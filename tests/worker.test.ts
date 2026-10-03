import { describe, it, expect, vi, afterEach } from "vitest";
import worker, { createOrder, actOnOrder } from "../worker/index";
import { decode, encode, Store, type Env, type Write } from "../worker/store";
import { totp, equal, privileged, staffSession } from "../worker/security";
import { providerStatus, trustedPaymentUrl } from "../worker/payments";
import { seedCatalog } from "../shared/seed";
import { DEFAULT_SETTINGS } from "../shared/domain";
import type { Order, Profile } from "../shared/types";
const env = {
  FIREBASE_PROJECT_ID: "demo-levi",
  ALLOWED_ORIGIN: "https://bar.example",
  STAFF_SESSION_SECRET: "test-secret-for-unit-tests-only-0123456789",
} as Env;
const student = {
  uid: "alice",
  name: "Test Alice",
  className: "3L",
  role: "student",
  approved: true,
  disabled: false,
} as Profile;
// Serial, in-memory transaction fixture verifies business invariants. It is NOT a cloud load test.
class MemoryStore {
  data = new Map<string, any>([
    ["config/catalog", seedCatalog()],
    ["config/service", structuredClone(DEFAULT_SETTINGS)],
    ["users/alice", student],
  ]);
  queue = Promise.resolve();
  get<T>(key: string, _tx?: string): Promise<T | null> {
    return Promise.resolve(structuredClone(this.data.get(key) ?? null));
  }
  write(path: string, value: any): any {
    return { path, value: structuredClone(value) };
  }
  transaction<T>(fn: (tx: string, writes: Write[]) => Promise<T>): Promise<T> {
    const task = this.queue.then(async () => {
      const writes: any[] = [];
      const result = await fn("tx", writes);
      for (const w of writes) this.data.set(w.path, w.value);
      return result;
    });
    this.queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
}
const body = (id = "abcdef123456789012") => ({
  id,
  date: "2026-10-05",
  slot: "prima",
  cart: [{ productId: "caprese", quantity: 1 }],
  paymentMethod: "counter",
  catalogVersion: 1,
  termsVersion: DEFAULT_SETTINGS.termsVersion,
  totalCents: 1,
});
afterEach(() => vi.useRealTimers());
describe("API e operazioni privilegiate", () => {
  it("rifiuta origini sconosciute e App Check mancante prima del database", async () => {
    const a = await worker.fetch(
      new Request("https://api.example/bootstrap", {
        headers: { Origin: "https://evil.example" },
      }),
      env,
    );
    expect(a.status).toBe(403);
    const b = await worker.fetch(
      new Request("https://api.example/bootstrap", {
        headers: { Origin: env.ALLOWED_ORIGIN },
      }),
      env,
    );
    expect(b.status).toBe(401);
  });
  it("nega al dirigente non amministratore e al bar senza secondo fattore", async () => {
    await expect(
      privileged(
        new Request("https://example.test"),
        env,
        { ...student, role: "staff" },
        "school_admin",
      ),
    ).rejects.toThrow();
    await expect(
      privileged(
        new Request("https://example.test"),
        env,
        { ...student, role: "bar" },
        "bar",
      ),
    ).rejects.toThrow(/autenticatore/);
  });
  it("implementa il vettore TOTP RFC 6238 e confronto token", async () => {
    expect(await totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1)).toBe("287082");
    expect(equal("abc", "abc")).toBe(true);
    expect(equal("abc", "abd")).toBe(false);
  });
  it("consuma un codice TOTP una volta sola e limita i tentativi", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T06:00:00Z"));
    const store = new MemoryStore(),
      secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGE";
    const e = { ...env, STAFF_TOTP_SECRETS: JSON.stringify({ alice: secret }) };
    const p = { ...student, role: "bar" } as Profile,
      code = await totp(secret, Math.floor(Date.now() / 30000));
    expect(
      (await staffSession(p, code, e, store as unknown as Store)).token,
    ).toBeTruthy();
    await expect(
      staffSession(p, code, e, store as unknown as Store),
    ).rejects.toThrow(/già utilizzato/);
  });
  it("idempotenza: una richiesta ripetuta non crea doppia scorta o doppio conto", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T10:00:00Z"));
    const store = new MemoryStore();
    const orders = await Promise.all(
      Array.from({ length: 12 }, () =>
        createOrder(body(), student, env, store as unknown as Store),
      ),
    );
    expect(new Set(orders.map((o) => o.id)).size).toBe(1);
    expect(orders[0].totalCents).toBe(280);
    expect(store.data.get("days/2026-10-05").counts.caprese).toBe(1);
  });
  it("1000 richieste sul modello transazionale non superano le 80 caprese", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T10:00:00Z"));
    const store = new MemoryStore();
    const result = await Promise.allSettled(
      Array.from({ length: 1000 }, (_, n) => {
        const p = { ...student, uid: "test" + n };
        store.data.set("users/" + p.uid, p);
        return createOrder(
          body(n.toString(16).padStart(18, "0")),
          p,
          env,
          store as unknown as Store,
        );
      }),
    );
    expect(result.filter((x) => x.status === "fulfilled").length).toBe(80);
    expect(store.data.get("days/2026-10-05").counts.caprese).toBe(80);
  });
  it("nega lettura/azione altrui, auto-incasso e ritiri fuori finestra", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T10:00:00Z"));
    const store = new MemoryStore();
    const o = await createOrder(
      body(),
      student,
      env,
      store as unknown as Store,
    );
    await expect(
      actOnOrder(
        o.id,
        { action: "cancel" },
        { ...student, uid: "bob" },
        store as unknown as Store,
      ),
    ).rejects.toThrow(/trovata/);
    await expect(
      actOnOrder(o.id, { action: "paid" }, student, store as unknown as Store),
    ).rejects.toThrow();
    store.data.set("orders/" + o.id, {
      ...o,
      status: "ready",
      paymentStatus: "paid",
    });
    await expect(
      actOnOrder(
        o.id,
        { action: "collect", code: o.pickupCode },
        { ...student, role: "bar" },
        store as unknown as Store,
      ),
    ).rejects.toThrow(/fascia/);
    vi.setSystemTime(new Date("2026-10-05T07:46:00Z"));
    expect(
      (
        await actOnOrder(
          o.id,
          { action: "collect", code: o.pickupCode },
          { ...student, role: "bar" },
          store as unknown as Store,
        )
      ).status,
    ).toBe("collected");
  });
  it("annullamento ripetuto libera disponibilità una sola volta", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T10:00:00Z"));
    const store = new MemoryStore();
    const o = await createOrder(
      body(),
      student,
      env,
      store as unknown as Store,
    );
    await actOnOrder(
      o.id,
      { action: "cancel" },
      student,
      store as unknown as Store,
    );
    await actOnOrder(
      o.id,
      { action: "cancel" },
      student,
      store as unknown as Store,
    );
    expect(store.data.get("days/2026-10-05").slots.prima).toBe(0);
  });
  it("serializza oggetti Firestore senza perdere booleani e centesimi", () => {
    const x = {
      price: 280,
      active: false,
      allergens: ["latte"],
      stock: 1.5,
      empty: null,
    };
    expect(decode(encode(x))).toEqual(x);
  });
});
describe("Nexi: verifica autoritativa dell’esito", () => {
  const o = {
    id: "abcdef123456789012",
    totalCents: 280,
    status: "confirmed",
  } as Order;
  const data = (amount = "280", capturedAmount = "280") => ({
    orderStatus: {
      order: { orderId: o.id, amount, currency: "EUR" },
      capturedAmount,
    },
  });
  it("non accetta importi falsificati o una semplice autorizzazione", () => {
    expect(() => providerStatus(data("1"), o)).toThrow(/corrispondenti/);
    expect(providerStatus(data("280", "0"), o)).toBe(null);
    expect(providerStatus(data(), o)).toBe("paid");
  });
  it("non riattiva un ordine annullato dopo un pagamento tardivo", () =>
    expect(providerStatus(data(), { ...o, status: "cancelled" })).toBe(
      "refund_required",
    ));
  it("blocca redirect esterni al provider", () => {
    expect(() => trustedPaymentUrl("https://evil.example/pay")).toThrow();
    expect(
      trustedPaymentUrl("https://xpaysandbox.nexigroup.com/pay"),
    ).toContain("https://xpaysandbox");
  });
});
