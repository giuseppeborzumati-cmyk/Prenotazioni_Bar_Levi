import type {
  Audit,
  Catalog,
  CartLine,
  DayLedger,
  Order,
  Profile,
  Registration,
  Settings,
  SlotId,
  Snapshot,
} from "../shared/types";
import {
  DEFAULT_SETTINGS,
  availableDates,
  blankLedger,
  ensure,
  maySeeOrder,
  release,
  reserve,
  validateCatalog,
  validateDate,
  validateSettings,
} from "../shared/domain";
import { seedCatalog } from "../shared/seed";
const KEY = "levi-demo-v1";
const SESSION = "levi-demo-session-v1";
export const DEMO_ACCOUNTS = [
  {
    email: "studente@demo.local",
    password: "StudenteDemo!2026",
    name: "Alex · account esempio",
    role: "student",
    className: "3L",
    staffCategory: "",
  },
  {
    email: "docente@demo.local",
    password: "DocenteDemo!2026",
    name: "Docente · account esempio",
    role: "staff",
    className: "",
    staffCategory: "docente",
  },
  {
    email: "bar@demo.local",
    password: "BarDemo!2026",
    name: "Gestore · account esempio",
    role: "bar",
    className: "",
    staffCategory: "",
  },
  {
    email: "scuola@demo.local",
    password: "ScuolaDemo!2026",
    name: "Amministrazione · account esempio",
    role: "school_admin",
    className: "",
    staffCategory: "segreteria",
  },
] as const;
interface Store {
  catalog: Catalog;
  settings: Settings;
  users: Profile[];
  passwords: Record<string, { salt: string; hash: string }>;
  orders: Order[];
  ledgers: Record<string, DayLedger>;
  audit: Audit[];
}
const hex = (a: ArrayBuffer) =>
  Array.from(new Uint8Array(a))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
async function hash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode(salt),
        iterations: 120000,
        hash: "SHA-256",
      },
      key,
      256,
    ),
  );
}
function get(): Store {
  const raw = localStorage.getItem(KEY);
  ensure(raw, "Demo da inizializzare.");
  return JSON.parse(raw);
}
function save(s: Store) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
function me(s: Store) {
  return s.users.find((u) => u.uid === sessionStorage.getItem(SESSION)) || null;
}
function requireUser(s: Store, roles?: string[]) {
  const p = me(s);
  ensure(p && !p.disabled, "Accedi per continuare.");
  if (roles) ensure(roles.includes(p.role), "Operazione non autorizzata.");
  return p;
}
function audit(s: Store, p: Profile, action: string, target: string) {
  s.audit.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actor: p.name,
    action,
    target,
  });
  s.audit = s.audit.slice(0, 200);
}
async function lock<T>(fn: (s: Store) => T | Promise<T>): Promise<T> {
  const execute = async () => {
    const s = get();
    const result = await fn(s);
    save(s);
    return result;
  };
  return navigator.locks ? navigator.locks.request(KEY, execute) : execute();
}
let initPromise: Promise<void> | null = null;
export function initDemo() {
  return (initPromise ||= initializeDemo().finally(() => {
    initPromise = null;
  }));
}
async function initializeDemo() {
  if (localStorage.getItem(KEY)) return;
  const s: Store = {
    catalog: seedCatalog(),
    settings: structuredClone(DEFAULT_SETTINGS),
    users: [],
    passwords: {},
    orders: [],
    ledgers: {},
    audit: [],
  };
  for (const a of DEMO_ACCOUNTS) {
    const uid = "demo-" + a.role;
    const salt = crypto.randomUUID();
    s.users.push({
      uid,
      name: a.name,
      email: a.email,
      role: a.role,
      requestedRole: a.role === "student" ? "student" : "staff",
      staffCategory: a.staffCategory,
      className: a.className,
      approved: true,
      disabled: false,
      createdAt: new Date().toISOString(),
      budgetCents: 2000,
    });
    s.passwords[uid] = { salt, hash: await hash(a.password, salt) };
  }
  const date = availableDates(s.settings)[0];
  if (date) {
    for (let i = 0; i < 9; i++) {
      const slot: SlotId = i % 3 === 0 ? "seconda" : "prima";
      const cart = [
        {
          productId: ["caprese", "focaccia-cotto", "orto", "ciambella"][i % 4],
          quantity: 1,
        },
        ...(i % 2 ? [{ productId: "te-limone", quantity: 1 }] : []),
      ];
      const r = reserve(
        cart,
        s.catalog,
        s.ledgers[date] || blankLedger(),
        slot,
        s.settings,
      );
      s.ledgers[date] = r.ledger;
      const p = s.users[i < 2 ? 0 : 1];
      s.orders.push({
        id: "DEMO" + String(i + 1).padStart(12, "0"),
        uid: p.uid,
        customerName: i < 2 ? p.name : `Cliente esempio ${i + 1}`,
        className: i < 2 ? "3L" : "",
        customerRole: p.role,
        date,
        slot,
        queueNumber: r.queueNumber,
        pickupCode: `PROVA${String(i).padStart(4, "0")}`,
        lines: r.lines,
        totalCents: r.totalCents,
        status: i === 0 ? "ready" : i === 1 ? "preparing" : "confirmed",
        paymentMethod: "counter",
        paymentStatus: i === 0 ? "paid" : "due",
        createdAt: new Date(Date.now() - i * 900000).toISOString(),
        updatedAt: new Date().toISOString(),
        catalogVersion: 1,
        termsVersion: s.settings.termsVersion,
      });
    }
  }
  save(s);
}
export const demo = {
  async bootstrap(): Promise<Snapshot> {
    await initDemo();
    const s = get(),
      p = me(s);
    return {
      profile: p,
      products: s.catalog.products,
      ingredients: p?.role === "bar" ? s.catalog.ingredients : [],
      catalogVersion: s.catalog.version,
      settings: s.settings,
      orders: p ? s.orders.filter((o) => maySeeOrder(p, o)) : [],
      users: p?.role === "school_admin" ? s.users : [],
      audit: p?.role === "school_admin" || p?.role === "bar" ? s.audit : [],
      nexiEnabled: false,
    };
  },
  async signIn(email: string, password: string, _otp?: string) {
    await initDemo();
    const s = get();
    const p = s.users.find((u) => u.email === email.toLowerCase().trim());
    ensure(p && !p.disabled, "Email o password non corretti.");
    const secret = s.passwords[p.uid];
    ensure(
      (await hash(password, secret.salt)) === secret.hash,
      "Email o password non corretti.",
    );
    sessionStorage.setItem(SESSION, p.uid);
  },
  async signOut() {
    sessionStorage.removeItem(SESSION);
  },
  async register(r: Registration) {
    ensure(r.accepted, "Accetta le condizioni del servizio.");
    ensure(
      r.password.length >= 12,
      "Scegli una password di almeno 12 caratteri.",
    );
    ensure(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email) && r.name.trim().length >= 2,
      "Nome o email non validi.",
    );
    ensure(
      r.requestedRole !== "student" || /^[1-5][A-Z]{1,3}$/.test(r.className),
      "Inserisci la classe, per esempio 3L.",
    );
    await lock(async (s) => {
      ensure(
        !s.users.some((u) => u.email === r.email.toLowerCase().trim()),
        "Esiste già un account con questa email.",
      );
      const uid = crypto.randomUUID(),
        salt = crypto.randomUUID();
      const p: Profile = {
        uid,
        name: r.name.trim(),
        email: r.email.toLowerCase().trim(),
        role: r.requestedRole,
        requestedRole: r.requestedRole,
        staffCategory: r.requestedRole === "staff" ? r.staffCategory : "",
        className: r.requestedRole === "student" ? r.className : "",
        approved: r.requestedRole === "student",
        disabled: false,
        createdAt: new Date().toISOString(),
        budgetCents: 2000,
      };
      s.users.push(p);
      s.passwords[uid] = { salt, hash: await hash(r.password, salt) };
      sessionStorage.setItem(SESSION, uid);
    });
    return "Account demo creato. I dati restano in questo browser.";
  },
  async resetPassword(_email: string) {
    throw new Error(
      "La demo non invia email. Usa le credenziali di esempio oppure reimposta i dati demo. Gli account Firebase dispongono del recupero via email.",
    );
  },
  async barOrders(date: string) {
    const s = get();
    requireUser(s, ["bar"]);
    return s.orders.filter((o) => o.date === date);
  },
  async availability(date: string) {
    return get().ledgers[date] || blankLedger();
  },
  async order(body: {
    id: string;
    cart: CartLine[];
    date: string;
    slot: SlotId;
    paymentMethod: "counter" | "nexi";
    catalogVersion: number;
    termsVersion: string;
  }) {
    return lock((s) => {
      const p = requireUser(s);
      ensure(
        p.approved,
        "Il tuo account è in attesa dell’approvazione della scuola.",
      );
      const old = s.orders.find((o) => o.id === body.id);
      if (old) {
        ensure(old.uid === p.uid, "Ordine non accessibile.");
        return old;
      }
      ensure(
        body.paymentMethod === "counter",
        "I pagamenti online sono disattivati nella demo.",
      );
      ensure(
        body.catalogVersion === s.catalog.version,
        "Catalogo aggiornato: controlla i prodotti e riprova.",
      );
      ensure(
        body.termsVersion === s.settings.termsVersion,
        "Condizioni aggiornate: ricarica la pagina.",
      );
      validateDate(body.date, body.slot, s.settings);
      const r = reserve(
        body.cart,
        s.catalog,
        s.ledgers[body.date] || blankLedger(),
        body.slot,
        s.settings,
      );
      s.ledgers[body.date] = r.ledger;
      const o: Order = {
        id: body.id,
        uid: p.uid,
        customerName: p.name,
        className: p.className,
        customerRole: p.role,
        date: body.date,
        slot: body.slot,
        queueNumber: r.queueNumber,
        pickupCode: crypto
          .randomUUID()
          .replaceAll("-", "")
          .slice(0, 12)
          .toUpperCase(),
        lines: r.lines,
        totalCents: r.totalCents,
        status: "confirmed",
        paymentMethod: "counter",
        paymentStatus: "due",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        catalogVersion: s.catalog.version,
        termsVersion: s.settings.termsVersion,
      };
      s.orders.unshift(o);
      audit(s, p, "Prenotazione creata", o.id);
      return o;
    });
  },
  async orderAction(id: string, action: string, code = "") {
    return lock((s) => {
      const p = requireUser(s),
        o = s.orders.find((o) => o.id === id);
      ensure(o && maySeeOrder(p, o), "Ordine non accessibile.");
      if (action === "cancel") {
        ensure(
          o.status === "confirmed",
          "Annullamento disponibile prima della preparazione.",
        );
        if (p.role !== "bar") validateDate(o.date, o.slot, s.settings);
        s.ledgers[o.date] = release(o, s.ledgers[o.date] || blankLedger());
        o.status = "cancelled";
        if (o.paymentStatus === "paid") o.paymentStatus = "refund_required";
      } else {
        ensure(
          p.role === "bar",
          "Solo il bar può gestire preparazioni e incassi.",
        );
        if (action === "prepare") {
          ensure(o.status === "confirmed", "Stato non valido.");
          o.status = "preparing";
        } else if (action === "ready") {
          ensure(o.status === "preparing", "Avvia prima la preparazione.");
          o.status = "ready";
        } else if (action === "collect") {
          ensure(
            o.status === "ready" && code.toUpperCase() === o.pickupCode,
            "Verifica il codice di ritiro.",
          );
          ensure(o.paymentStatus === "paid", "Registra prima l’incasso.");
          o.status = "collected";
        } else if (action === "paid") {
          ensure(
            o.status !== "cancelled" &&
              o.paymentStatus === "due" &&
              o.paymentMethod === "counter",
            "Incasso non registrabile.",
          );
          o.paymentStatus = "paid";
        } else if (action === "refund") {
          ensure(
            o.paymentStatus === "refund_required",
            "Nessun rimborso da registrare.",
          );
          o.paymentStatus = "refunded";
        } else throw new Error("Azione non valida.");
      }
      o.updatedAt = new Date().toISOString();
      audit(s, p, action, id);
      return o;
    });
  },
  async saveCatalog(c: Catalog) {
    await lock((s) => {
      const p = requireUser(s, ["bar"]);
      ensure(
        c.version === s.catalog.version,
        "Catalogo modificato da un altro operatore. Ricarica.",
      );
      s.catalog = validateCatalog({
        ...structuredClone(c),
        version: s.catalog.version + 1,
        updatedAt: new Date().toISOString(),
      });
      audit(s, p, "Catalogo aggiornato", String(s.catalog.version));
    });
  },
  async saveSettings(settings: Settings) {
    await lock((s) => {
      const p = requireUser(s, ["school_admin"]);
      s.settings = validateSettings(settings);
      audit(s, p, "Regole di servizio aggiornate", "servizio");
    });
  },
  async userAction(uid: string, action: "approve" | "disable" | "enable") {
    await lock((s) => {
      const p = requireUser(s, ["school_admin"]),
        u = s.users.find((u) => u.uid === uid);
      ensure(
        u && u.role !== "bar" && u.role !== "school_admin",
        "Gli operatori riservati si gestiscono dal server.",
      );
      if (action === "approve") u.approved = true;
      if (action === "disable") u.disabled = true;
      if (action === "enable") u.disabled = false;
      audit(s, p, `Account: ${action}`, uid);
    });
  },
  async budget(cents: number) {
    await lock((s) => {
      const p = requireUser(s);
      ensure(
        Number.isInteger(cents) && cents >= 0 && cents <= 100000,
        "Budget non valido.",
      );
      p.budgetCents = cents;
    });
  },
  async resetDemo() {
    sessionStorage.removeItem(SESSION);
    localStorage.removeItem(KEY);
    await initDemo();
  },
  async nexi(_id: string): Promise<{ url: string }> {
    throw new Error("Nexi non è attivo nella demo.");
  },
  async reconcile(_id: string) {
    throw new Error("Nessun pagamento Nexi reale nella demo.");
  },
};
