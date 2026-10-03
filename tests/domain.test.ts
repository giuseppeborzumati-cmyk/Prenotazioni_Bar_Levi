import { describe, it, expect } from "vitest";
import { seedCatalog } from "../shared/seed";
import {
  DEFAULT_SETTINGS,
  blankLedger,
  inPickupWindow,
  ingredientNeeds,
  maySeeOrder,
  release,
  reserve,
  validateCatalog,
  validateDate,
} from "../shared/domain";
import type { Order, Profile } from "../shared/types";
const monday = new Date("2026-10-05T07:20:00Z");
describe("Prenotazioni e alimenti", () => {
  it("accetta il giorno prima e converte gli orari in Europe/Rome", () => {
    expect(() =>
      validateDate(
        "2026-10-05",
        "prima",
        DEFAULT_SETTINGS,
        new Date("2026-10-04T18:00:00Z"),
      ),
    ).not.toThrow();
    expect(() =>
      validateDate("2026-10-05", "prima", DEFAULT_SETTINGS, monday),
    ).not.toThrow();
    expect(() =>
      validateDate(
        "2026-10-05",
        "prima",
        DEFAULT_SETTINGS,
        new Date("2026-10-05T07:30:00Z"),
      ),
    ).toThrow(/chiuse/);
  });
  it("nega festività configurate, date inesistenti e sabato", () => {
    expect(() =>
      validateDate("2026-10-10", "prima", DEFAULT_SETTINGS, monday),
    ).toThrow();
    expect(() =>
      validateDate("2026-02-31", "prima", DEFAULT_SETTINGS, monday),
    ).toThrow();
    expect(() =>
      validateDate(
        "2026-10-05",
        "prima",
        { ...DEFAULT_SETTINGS, closedDates: ["2026-10-05"] },
        monday,
      ),
    ).toThrow();
  });
  it("rispetta le finestre anche dopo il cambio all’ora solare", () => {
    expect(
      inPickupWindow("2026-10-05", "prima", new Date("2026-10-05T07:45:00Z")),
    ).toBe(true);
    expect(
      inPickupWindow("2026-10-05", "prima", new Date("2026-10-05T07:55:00Z")),
    ).toBe(false);
    expect(
      inPickupWindow("2026-10-26", "seconda", new Date("2026-10-26T11:50:00Z")),
    ).toBe(true);
  });
  it("calcola prezzi sul catalogo e impedisce esaurimento e carrelli duplicati", () => {
    const c = seedCatalog(),
      s = reserve(
        [{ productId: "caprese", quantity: 2 }],
        c,
        blankLedger(),
        "prima",
        DEFAULT_SETTINGS,
      );
    expect(s.totalCents).toBe(560);
    expect(s.ledger.counts.caprese).toBe(2);
    expect(() =>
      reserve(
        [
          { productId: "caprese", quantity: 1 },
          { productId: "caprese", quantity: 1 },
        ],
        c,
        blankLedger(),
        "prima",
        DEFAULT_SETTINGS,
      ),
    ).toThrow(/duplicato/);
    c.products[0].dailyLimit = 2;
    expect(() =>
      reserve(
        [{ productId: "caprese", quantity: 1 }],
        c,
        s.ledger,
        "seconda",
        DEFAULT_SETTINGS,
      ),
    ).toThrow(/terminata/);
  });
  it("libera disponibilità senza riutilizzare il numero di coda", () => {
    const c = seedCatalog(),
      a = reserve(
        [{ productId: "caprese", quantity: 1 }],
        c,
        blankLedger(),
        "prima",
        DEFAULT_SETTINGS,
      );
    const freed = release({ lines: a.lines, slot: "prima" } as Order, a.ledger);
    expect(freed.counts.caprese).toBe(0);
    expect(
      reserve(
        [{ productId: "caprese", quantity: 1 }],
        c,
        freed,
        "prima",
        DEFAULT_SETTINGS,
      ).queueNumber,
    ).toBe(2);
  });
  it("deriva allergeni e veganismo dalla ricetta, non dalla dichiarazione del prodotto", () => {
    const c = seedCatalog();
    c.products[0].vegan = true;
    c.products[0].allergens = [];
    const checked = validateCatalog(c);
    expect(checked.products[0].vegan).toBe(false);
    expect(checked.products[0].allergens).toContain("latte");
    expect(checked.products.find((p) => p.id === "orto")?.vegan).toBe(true);
  });
  it("calcola provola e confezioni e ignora ordini annullati", () => {
    const c = seedCatalog(),
      a = reserve(
        [{ productId: "caprese", quantity: 3 }],
        c,
        blankLedger(),
        "prima",
        DEFAULT_SETTINGS,
      );
    const ing = c.ingredients.map((i) => ({ ...i, stock: 0 }));
    const needs = ingredientNeeds(
      [
        { lines: a.lines, status: "confirmed" } as Order,
        { lines: a.lines, status: "cancelled" } as Order,
      ],
      ing,
    );
    const provola = needs.find((i) => i.id === "provola")!;
    expect(provola.required).toBe(150);
    expect(provola.purchase).toBe(provola.packSize);
  });
  it("riserva lo storico nominativo al titolare e al bar", () => {
    const o = { uid: "owner" } as Order;
    expect(maySeeOrder({ uid: "other", role: "student" } as Profile, o)).toBe(
      false,
    );
    expect(
      maySeeOrder({ uid: "school", role: "school_admin" } as Profile, o),
    ).toBe(false);
    expect(maySeeOrder({ uid: "bar", role: "bar" } as Profile, o)).toBe(true);
  });
});

it("rifiuta codici riservati alla struttura degli oggetti JavaScript", () => {
  const c = seedCatalog();
  c.products[0].id = "__proto__";
  expect(() => validateCatalog(c)).toThrow();
});
