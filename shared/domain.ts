import type {
  Catalog,
  CartLine,
  DayLedger,
  Ingredient,
  Order,
  OrderLine,
  Profile,
  Settings,
  SlotId,
} from "./types";
export const SLOTS = {
  prima: { label: "Prima pausa", start: "09:45", end: "09:55", prefix: "A" },
  seconda: {
    label: "Seconda pausa",
    start: "12:45",
    end: "13:00",
    prefix: "B",
  },
} as const;
export const ALLERGENS = [
  "glutine",
  "crostacei",
  "uova",
  "pesce",
  "arachidi",
  "soia",
  "latte",
  "frutta a guscio",
  "sedano",
  "senape",
  "sesamo",
  "solfiti",
  "lupini",
  "molluschi",
];
export const DEFAULT_SETTINGS: Settings = {
  bookingDays: 7,
  weekdays: [1, 2, 3, 4, 5],
  closedDates: [],
  capacity: { prima: 180, seconda: 180 },
  cutoff: { prima: "09:30", seconda: "12:20" },
  accepting: true,
  notice:
    "Prenota in anticipo. Porta con te il codice di ritiro, anche su carta.",
  schoolName: "I.I.S. Primo Levi · Seregno",
  termsVersion: "demo-2026-10-03",
};
export function rome(now = new Date()) {
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (k: string) => p.find((x) => x.type === k)?.value || "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}
export function addDays(date: string, delta: number) {
  return new Date(Date.parse(date + "T12:00:00Z") + delta * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function dayName(date: string) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
}
export function money(cents: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
export function ensure(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export function validateDate(
  date: string,
  slot: SlotId,
  settings: Settings,
  now = new Date(),
) {
  ensure(Object.hasOwn(SLOTS, slot), "Fascia di ritiro non valida.");
  ensure(
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      !Number.isNaN(Date.parse(date + "T12:00:00Z")),
    "Data non valida.",
  );
  ensure(
    new Date(date + "T12:00:00Z").toISOString().slice(0, 10) === date,
    "Data inesistente.",
  );
  const local = rome(now);
  ensure(settings.accepting, "Le prenotazioni sono momentaneamente sospese.");
  ensure(
    date >= local.date && date <= addDays(local.date, settings.bookingDays),
    "Scegli una data nel periodo prenotabile.",
  );
  ensure(
    settings.weekdays.includes(new Date(date + "T12:00:00Z").getUTCDay()) &&
      !settings.closedDates.includes(date),
    "Il bar non effettua servizio nella data scelta.",
  );
  ensure(
    date !== local.date || local.time < settings.cutoff[slot],
    `Prenotazioni chiuse per questa pausa (termine ${settings.cutoff[slot]}).`,
  );
}
export function availableDates(settings: Settings, now = new Date()) {
  return Array.from({ length: settings.bookingDays + 1 }, (_, i) =>
    addDays(rome(now).date, i),
  ).filter((d) =>
    (["prima", "seconda"] as SlotId[]).some((s) => {
      try {
        validateDate(d, s, settings, now);
        return true;
      } catch {
        return false;
      }
    }),
  );
}
export function inPickupWindow(date: string, slot: SlotId, now = new Date()) {
  const t = rome(now);
  return (
    date === t.date && t.time >= SLOTS[slot].start && t.time < SLOTS[slot].end
  );
}
export function blankLedger(): DayLedger {
  return {
    counts: {},
    slots: { prima: 0, seconda: 0 },
    sequence: { prima: 0, seconda: 0 },
  };
}
export function quote(
  cart: CartLine[],
  catalog: Catalog,
  ledger: DayLedger,
): OrderLine[] {
  ensure(
    Array.isArray(cart) && cart.length > 0 && cart.length <= 20,
    "Il carrello deve contenere da 1 a 20 prodotti diversi.",
  );
  const seen = new Set<string>();
  let quantity = 0;
  return cart.map((line) => {
    ensure(
      typeof line.productId === "string" && !seen.has(line.productId),
      "Prodotto duplicato nel carrello.",
    );
    seen.add(line.productId);
    ensure(
      Number.isInteger(line.quantity) &&
        line.quantity >= 1 &&
        line.quantity <= 10,
      "Quantità non valida (1–10 per prodotto).",
    );
    quantity += line.quantity;
    ensure(quantity <= 20, "Massimo 20 pezzi per prenotazione.");
    const p = catalog.products.find((p) => p.id === line.productId);
    ensure(p && p.active, "Un prodotto non è più disponibile.");
    ensure(
      (ledger.counts[p.id] || 0) + line.quantity <= p.dailyLimit,
      `Disponibilità terminata per ${p.name}.`,
    );
    return {
      productId: p.id,
      name: p.name,
      quantity: line.quantity,
      priceCents: p.priceCents,
      ingredientNames: [...(p.ingredientNames || [])],
      allergens: [...p.allergens],
      traces: [...p.traces],
      vegan: p.vegan,
      recipe: structuredClone(p.recipe),
    };
  });
}
export function reserve(
  cart: CartLine[],
  catalog: Catalog,
  ledger: DayLedger,
  slot: SlotId,
  settings: Settings,
) {
  ensure(
    ledger.slots[slot] < settings.capacity[slot],
    "Questa pausa ha raggiunto la capienza. Scegli un’altra fascia.",
  );
  const lines = quote(cart, catalog, ledger);
  const next = structuredClone(ledger);
  for (const l of lines)
    next.counts[l.productId] = (next.counts[l.productId] || 0) + l.quantity;
  next.slots[slot]++;
  next.sequence[slot]++;
  return {
    lines,
    ledger: next,
    queueNumber: next.sequence[slot],
    totalCents: lines.reduce((a, l) => a + l.priceCents * l.quantity, 0),
  };
}
export function release(order: Order, ledger: DayLedger) {
  const next = structuredClone(ledger);
  for (const l of order.lines)
    next.counts[l.productId] = Math.max(
      0,
      (next.counts[l.productId] || 0) - l.quantity,
    );
  next.slots[order.slot] = Math.max(0, next.slots[order.slot] - 1);
  return next;
}
export function ingredientNeeds(orders: Order[], ingredients: Ingredient[]) {
  const needed: Record<string, number> = {};
  for (const o of orders.filter((o) => o.status !== "cancelled"))
    for (const l of o.lines)
      for (const r of l.recipe)
        needed[r.ingredientId] =
          (needed[r.ingredientId] || 0) + r.quantity * l.quantity;
  return ingredients
    .map((i) => {
      const required = Math.round((needed[i.id] || 0) * 1000) / 1000;
      const missing = Math.max(
        0,
        Math.round((required - i.stock) * 1000) / 1000,
      );
      return {
        ...i,
        required,
        missing,
        purchase: missing ? Math.ceil(missing / i.packSize) * i.packSize : 0,
      };
    })
    .filter((i) => i.required > 0 || i.stock < i.minStock);
}
export function aggregateProducts(orders: Order[]) {
  const rows: Record<string, { name: string; quantity: number }> = {};
  for (const o of orders.filter((o) => o.status !== "cancelled"))
    for (const l of o.lines) {
      rows[l.productId] ??= { name: l.name, quantity: 0 };
      rows[l.productId].quantity += l.quantity;
    }
  return Object.values(rows).sort((a, b) => b.quantity - a.quantity);
}
export function validateSettings(s: Settings) {
  ensure(
    Number.isInteger(s.bookingDays) &&
      s.bookingDays >= 1 &&
      s.bookingDays <= 14,
    "Periodo prenotabile: 1–14 giorni.",
  );
  ensure(
    Array.isArray(s.weekdays) &&
      s.weekdays.length > 0 &&
      s.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    "Giorni di apertura non validi.",
  );
  ensure(
    Array.isArray(s.closedDates) &&
      s.closedDates.length <= 100 &&
      s.closedDates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    "Date di chiusura non valide.",
  );
  for (const slot of ["prima", "seconda"] as SlotId[]) {
    ensure(
      Number.isInteger(s.capacity[slot]) &&
        s.capacity[slot] >= 1 &&
        s.capacity[slot] <= 1000,
      "Capienza: 1–1000 prenotazioni.",
    );
    ensure(
      /^([01]\d|2[0-3]):[0-5]\d$/.test(s.cutoff[slot]) &&
        s.cutoff[slot] < SLOTS[slot].start,
      "Il termine degli ordini deve precedere il ritiro.",
    );
  }
  ensure(
    typeof s.accepting === "boolean" &&
      typeof s.notice === "string" &&
      s.notice.length <= 300,
    "Avviso non valido.",
  );
  return s;
}
export function validateCatalog(c: Catalog): Catalog {
  ensure(
    Array.isArray(c.products) &&
      c.products.length > 0 &&
      c.products.length <= 200,
    "Il catalogo deve contenere 1–200 prodotti.",
  );
  ensure(
    Array.isArray(c.ingredients) &&
      c.ingredients.length > 0 &&
      c.ingredients.length <= 500,
    "Inserire 1–500 ingredienti.",
  );
  const keys = new Set<string>();
  for (const i of c.ingredients) {
    ensure(
      /^[a-z0-9_-]{1,40}$/.test(i.id) &&
        !["__proto__", "constructor", "prototype"].includes(i.id) &&
        !keys.has(i.id),
      "Codice ingrediente duplicato o non valido.",
    );
    keys.add(i.id);
    ensure(
      typeof i.name === "string" &&
        i.name.trim().length > 0 &&
        i.name.length <= 100,
      "Nome ingrediente non valido.",
    );
    ensure(["g", "ml", "pz"].includes(i.unit), "Unità: g, ml o pz.");
    ensure(
      [i.stock, i.minStock].every(
        (n) => Number.isFinite(n) && n >= 0 && n <= 10000000,
      ) &&
        Number.isFinite(i.packSize) &&
        i.packSize > 0 &&
        i.packSize <= 10000000,
      "Giacenza o confezione non valida.",
    );
    ensure(
      Array.isArray(i.allergens) &&
        i.allergens.every((a) => ALLERGENS.includes(a)) &&
        typeof i.vegan === "boolean",
      "Allergeni o campo vegano non validi.",
    );
  }
  const ids = new Set<string>();
  for (const p of c.products) {
    ensure(
      /^[a-z0-9_-]{1,40}$/.test(p.id) &&
        !["__proto__", "constructor", "prototype"].includes(p.id) &&
        !ids.has(p.id),
      "Codice prodotto duplicato o non valido.",
    );
    ids.add(p.id);
    ensure(
      typeof p.name === "string" &&
        p.name.trim().length > 0 &&
        p.name.length <= 100 &&
        typeof p.description === "string" &&
        p.description.length <= 500,
      "Nome o descrizione non validi.",
    );
    ensure(
      ["Panini", "Focacce", "Dolci", "Bevande"].includes(p.category),
      "Categoria prodotto non valida.",
    );
    ensure(
      Number.isInteger(p.priceCents) &&
        p.priceCents >= 1 &&
        p.priceCents <= 10000,
      "Prezzo non valido (0,01–100 euro).",
    );
    ensure(
      Number.isInteger(p.dailyLimit) &&
        p.dailyLimit >= 0 &&
        p.dailyLimit <= 5000 &&
        typeof p.active === "boolean",
      "Disponibilità giornaliera non valida.",
    );
    ensure(
      Array.isArray(p.recipe) && p.recipe.length > 0 && p.recipe.length <= 30,
      "Ogni prodotto deve avere una ricetta.",
    );
    const rids = new Set<string>();
    for (const r of p.recipe) {
      ensure(
        keys.has(r.ingredientId) &&
          !rids.has(r.ingredientId) &&
          Number.isFinite(r.quantity) &&
          r.quantity > 0 &&
          r.quantity <= 100000,
        "Ricetta con ingrediente mancante, duplicato o quantità non valida.",
      );
      rids.add(r.ingredientId);
    }
    const ing = p.recipe.map((r) =>
      c.ingredients.find((i) => i.id === r.ingredientId)!,
    );
    p.ingredientNames = ing.map((i) => i.name);
    p.allergens = [...new Set(ing.flatMap((i) => i.allergens))];
    p.vegan = ing.every((i) => i.vegan);
    ensure(
      Array.isArray(p.traces) && p.traces.every((a) => ALLERGENS.includes(a)),
      "Tracce di allergeni non valide.",
    );
    p.image = [
      "caprese",
      "focaccia",
      "vegano",
      "dolce",
      "te",
      "succo",
    ].includes(p.image)
      ? p.image
      : "caprese";
  }
  return c;
}
export function maySeeOrder(p: Profile, o: Order) {
  return p.role === "bar" || p.uid === o.uid;
}
