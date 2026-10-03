import { importPKCS8, SignJWT } from "jose";
export interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_PROJECT_NUMBER: string;
  FIREBASE_APP_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  ALLOWED_ORIGIN: string;
  STAFF_TOTP_SECRETS: string;
  STAFF_SESSION_SECRET: string;
  NEXI_ENABLED?: string;
  NEXI_ENV?: string;
  NEXI_API_KEY?: string;
  PUBLIC_API_URL?: string;
}
type Value = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: null;
  timestampValue?: string;
  arrayValue?: { values?: Value[] };
  mapValue?: { fields?: Record<string, Value> };
};
export function encode(v: unknown): Value {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (v && typeof v === "object")
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(v)
            .filter(([, x]) => x !== undefined)
            .map(([k, x]) => [k, encode(x)]),
        ),
      },
    };
  throw new Error("Unsupported database value");
}
export function decode(v: Value): unknown {
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if (v.arrayValue) return (v.arrayValue.values || []).map(decode);
  return Object.fromEntries(
    Object.entries(v.mapValue?.fields || {}).map(([k, x]) => [k, decode(x)]),
  );
}
class StoreError extends Error {
  constructor(public status: number) {
    super("Database temporarily unavailable");
  }
}
let oauth: { email: string; token: string; until: number } | undefined;
export async function accessToken(env: Env) {
  if (oauth?.email === env.FIREBASE_CLIENT_EMAIL && oauth.until > Date.now())
    return oauth.token;
  const key = await importPKCS8(
    env.FIREBASE_PRIVATE_KEY.replaceAll("\\n", "\n"),
    "RS256",
  );
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/datastore",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(env.FIREBASE_CLIENT_EMAIL)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!r.ok) throw new StoreError(r.status);
  const data = (await r.json()) as { access_token: string; expires_in: number };
  oauth = {
    email: env.FIREBASE_CLIENT_EMAIL,
    token: data.access_token,
    until: Date.now() + (data.expires_in - 120) * 1000,
  };
  return oauth.token;
}
export interface Write {
  update: { name: string; fields: Record<string, Value> };
  currentDocument?: { exists: boolean };
}
export class Store {
  root: string;
  url: string;
  constructor(private env: Env) {
    this.root = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
    this.url = "https://firestore.googleapis.com/v1/" + this.root;
  }
  async request(path: string, init: RequestInit = {}) {
    const r = await fetch(this.url + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${await accessToken(this.env)}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new StoreError(r.status);
    return r.json() as Promise<any>;
  }
  async get<T>(path: string, transaction?: string): Promise<T | null> {
    const doc = await this.request(
      "/" +
        path +
        (transaction ? "?transaction=" + encodeURIComponent(transaction) : ""),
    );
    return doc ? (decode({ mapValue: { fields: doc.fields } }) as T) : null;
  }
  write(path: string, data: unknown, create = false): Write {
    return {
      update: {
        name: this.root + "/" + path,
        fields: encode(data).mapValue!.fields!,
      },
      ...(create ? { currentDocument: { exists: false } } : {}),
    };
  }
  async put(path: string, data: unknown) {
    await this.request(":commit", {
      method: "POST",
      body: JSON.stringify({ writes: [this.write(path, data)] }),
    });
  }
  async query<T>(
    collection: string,
    filters: { field: string; op: string; value: unknown }[] = [],
    limit = 5000,
    options: { orderBy?: string; truncate?: boolean } = {},
  ): Promise<T[]> {
    const clauses = filters.map((f) => ({
      fieldFilter: {
        field: { fieldPath: f.field },
        op: f.op,
        value: encode(f.value),
      },
    }));
    const result = await this.request(":runQuery", {
      method: "POST",
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: collection }],
          ...(clauses.length
            ? {
                where:
                  clauses.length === 1
                    ? clauses[0]
                    : { compositeFilter: { op: "AND", filters: clauses } },
              }
            : {}),
          ...(options.orderBy
            ? {
                orderBy: [
                  {
                    field: { fieldPath: options.orderBy },
                    direction: "DESCENDING",
                  },
                ],
              }
            : {}),
          limit: limit + 1,
        },
      }),
    });
    const rows = (result || [])
      .filter((r: any) => r.document)
      .map(
        (r: any) => decode({ mapValue: { fields: r.document.fields } }) as T,
      );
    if (rows.length > limit && !options.truncate)
      throw new Error(
        "Troppi dati da visualizzare: occorre archiviare o paginare lo storico. Nessun totale parziale viene mostrato.",
      );
    return rows.slice(0, limit);
  }
  async transaction<T>(
    fn: (tx: string, writes: Write[]) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const { transaction } = await this.request(":beginTransaction", {
        method: "POST",
        body: "{}",
      });
      const writes: Write[] = [];
      try {
        const value = await fn(transaction, writes);
        await this.request(":commit", {
          method: "POST",
          body: JSON.stringify({ transaction, writes }),
        });
        return value;
      } catch (e) {
        await this.request(":rollback", {
          method: "POST",
          body: JSON.stringify({ transaction }),
        }).catch(() => {});
        if (
          e instanceof StoreError &&
          (e.status === 409 || e.status === 429) &&
          attempt < 5
        ) {
          await new Promise((r) =>
            setTimeout(r, 40 * 2 ** attempt + Math.random() * 100),
          );
          continue;
        }
        throw e;
      }
    }
    throw new Error("Servizio occupato, riprova tra pochi secondi.");
  }
}
