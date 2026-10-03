import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import type { Profile } from "../shared/types";
import { Store, type Env } from "./store";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function demand(
  ok: unknown,
  message = "Operazione non autorizzata.",
  status = 403,
): asserts ok {
  if (!ok) throw new HttpError(status, message);
}
const firebaseKeys = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);
const appKeys = createRemoteJWKSet(
  new URL("https://firebaseappcheck.googleapis.com/v1/jwks"),
);
export async function appCheck(request: Request, env: Env) {
  const token = request.headers.get("X-Firebase-AppCheck");
  demand(token, "Verifica dell’app mancante. Ricarica la pagina.", 401);
  try {
    const { payload } = await jwtVerify(token, appKeys, {
      issuer: `https://firebaseappcheck.googleapis.com/${env.FIREBASE_PROJECT_NUMBER}`,
      audience: `projects/${env.FIREBASE_PROJECT_NUMBER}`,
      algorithms: ["RS256"],
    });
    demand(payload.sub === env.FIREBASE_APP_ID, "Applicazione non consentita.");
  } catch {
    throw new HttpError(401, "Verifica dell’app non valida.");
  }
}
export async function identity(
  request: Request,
  env: Env,
  store: Store,
  optional = false,
) {
  const bearer = request.headers.get("Authorization");
  if (!bearer && optional) return null;
  demand(bearer?.startsWith("Bearer "), "Accedi per continuare.", 401);
  let claims;
  try {
    ({ payload: claims } = await jwtVerify(bearer!.slice(7), firebaseKeys, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
      algorithms: ["RS256"],
    }));
  } catch {
    throw new HttpError(401, "Sessione scaduta. Accedi nuovamente.");
  }
  demand(
    claims.sub && claims.email_verified === true,
    "Verifica la tua email prima di accedere.",
    401,
  );
  const p = await store.get<Profile>("users/" + claims.sub);
  demand(
    p && p.uid === claims.sub,
    "Profilo non presente. Contatta l’amministrazione.",
    403,
  );
  demand(!p.disabled, "Account sospeso.");
  if (["bar", "school_admin"].includes(p.role))
    demand(
      claims.role === p.role && p.approved,
      "Credenziali riservate non abilitate.",
    );
  else demand(["student", "staff"].includes(p.role), "Profilo non valido.");
  return p;
}
export async function privileged(
  request: Request,
  env: Env,
  p: Profile,
  role?: string,
) {
  demand(p.approved && (!role || p.role === role), "Ruolo non autorizzato.");
  if (!["bar", "school_admin"].includes(p.role)) return;
  demand(
    env.STAFF_SESSION_SECRET?.length >= 32,
    "Secondo fattore non configurato.",
    503,
  );
  try {
    const { payload } = await jwtVerify(
      request.headers.get("X-Staff-Session") || "",
      new TextEncoder().encode(env.STAFF_SESSION_SECRET),
      { issuer: "bar-levi", audience: "staff-api", algorithms: ["HS256"] },
    );
    demand(payload.sub === p.uid && payload.role === p.role);
  } catch {
    throw new HttpError(
      401,
      "Codice di sicurezza richiesto: accedi nuovamente con l’autenticatore.",
    );
  }
}
export function equal(a: string, b: string) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return mismatch === 0;
}
export async function totp(secret: string, step: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    value = 0;
  const bytes: number[] = [];
  for (const c of secret.toUpperCase().replace(/=+$/, "")) {
    const n = alphabet.indexOf(c);
    demand(n >= 0, "Autenticatore non configurato.", 503);
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(bytes),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const counter = new ArrayBuffer(8);
  new DataView(counter).setBigUint64(0, BigInt(step));
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const offset = h[h.length - 1] & 15;
  const n =
    ((h[offset] & 127) << 24) |
    (h[offset + 1] << 16) |
    (h[offset + 2] << 8) |
    h[offset + 3];
  return String(n % 1000000).padStart(6, "0");
}
export async function staffSession(
  p: Profile,
  code: string,
  env: Env,
  store: Store,
) {
  demand(["bar", "school_admin"].includes(p.role) && p.approved);
  demand(/^\d{6}$/.test(code), "Inserisci il codice a 6 cifre.", 400);
  const secret = JSON.parse(env.STAFF_TOTP_SECRETS || "{}")[p.uid];
  demand(
    typeof secret === "string" &&
      secret.length >= 32 &&
      env.STAFF_SESSION_SECRET?.length >= 32,
    "Autenticatore da attivare con il responsabile tecnico.",
    503,
  );
  const step = Math.floor(Date.now() / 30000);
  let matched = -1;
  for (const s of [step - 1, step, step + 1])
    if (equal(await totp(secret, s), code)) matched = s;
  const allowed = await store.transaction(async (tx, writes) => {
    const path = "staffSecurity/" + p.uid;
    const state = (await store.get<{
      window: number;
      failures: number;
      lastStep: number;
    }>(path, tx)) || { window: 0, failures: 0, lastStep: -1 };
    if (Date.now() - state.window > 300000) {
      state.window = Date.now();
      state.failures = 0;
    }
    demand(state.failures < 5, "Troppi tentativi. Attendi cinque minuti.", 429);
    const valid = matched > state.lastStep;
    if (valid) state.lastStep = matched;
    else state.failures++;
    writes.push(store.write(path, state));
    return valid;
  });
  demand(
    allowed,
    "Codice non valido o già utilizzato. Attendi un nuovo codice.",
    401,
  );
  return {
    token: await new SignJWT({ role: p.role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(p.uid)
      .setIssuer("bar-levi")
      .setAudience("staff-api")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(env.STAFF_SESSION_SECRET)),
  };
}
export async function rateLimit(uid: string, store: Store) {
  await store.transaction(async (tx, writes) => {
    const path = "limits/" + uid,
      now = Date.now();
    const old = await store.get<{ start: number; count: number }>(path, tx);
    const next =
      old && now - old.start < 60000
        ? { ...old, count: old.count + 1 }
        : { start: now, count: 1 };
    demand(next.count <= 30, "Troppe operazioni: riprova tra un minuto.", 429);
    writes.push(store.write(path, next));
  });
}
