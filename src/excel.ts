import type { Catalog, Ingredient, Product } from "../shared/types";
import { ensure, validateCatalog } from "../shared/domain";
// Check ZIP directory BEFORE decompression: reject oversized archives and embedded macros.
function checkZip(buffer: ArrayBuffer) {
  const d = new DataView(buffer);
  let e = -1;
  for (let p = d.byteLength - 22; p >= Math.max(0, d.byteLength - 65557); p--)
    if (d.getUint32(p, true) === 0x06054b50) {
      e = p;
      break;
    }
  ensure(e >= 0, "Il file non è un documento XLSX valido.");
  const count = d.getUint16(e + 10, true);
  ensure(count <= 150, "Il file contiene troppi elementi.");
  let p = d.getUint32(e + 16, true),
    total = 0;
  for (let i = 0; i < count; i++) {
    ensure(
      p + 46 <= d.byteLength && d.getUint32(p, true) === 0x02014b50,
      "Archivio Excel non valido.",
    );
    total += d.getUint32(p + 24, true);
    ensure(total <= 12000000, "Excel troppo grande dopo la decompressione.");
    const nl = d.getUint16(p + 28, true),
      xl = d.getUint16(p + 30, true),
      cl = d.getUint16(p + 32, true);
    ensure(p + 46 + nl + xl + cl <= d.byteLength, "Archivio incompleto.");
    const name = new TextDecoder().decode(new Uint8Array(buffer, p + 46, nl));
    ensure(
      !/vbaProject|externalLinks/i.test(name),
      "Macro e collegamenti esterni non sono ammessi.",
    );
    p += 46 + nl + xl + cl;
  }
}
export async function parseExcel(
  file: File,
  version: number,
): Promise<Catalog> {
  ensure(/\.xlsx$/i.test(file.name), "Carica un file .xlsx usando il modello.");
  ensure(file.size <= 1000000, "Dimensione massima del file: 1 MB.");
  const buffer = await file.arrayBuffer();
  checkZip(buffer);
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const read = (name: string) => {
    const s = wb.getWorksheet(name);
    ensure(s, `Foglio ${name} mancante.`);
    ensure(
      s.rowCount <= 501 && s.columnCount <= 20,
      `Il foglio ${name} supera i limiti.`,
    );
    const headers = (s.getRow(1).values as unknown[]).slice(1).map(String);
    ensure(
      new Set(headers).size === headers.length,
      `Intestazioni duplicate in ${name}.`,
    );
    const rows: Record<string, unknown>[] = [];
    s.eachRow((r, n) => {
      if (n === 1) return;
      const o: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        const cell = r.getCell(i + 1);
        ensure(
          !cell.formula && (!cell.value || typeof cell.value !== "object"),
          `Formula o contenuto complesso non ammesso: ${name}, riga ${n}.`,
        );
        o[h] = cell.value ?? "";
      });
      if (Object.values(o).some((v) => v !== "")) rows.push(o);
    });
    return rows;
  };
  const text = (v: unknown) => String(v ?? "").trim();
  const num = (v: unknown) => {
    ensure(
      v !== "" && v !== null && v !== undefined,
      "Valore numerico mancante.",
    );
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    ensure(Number.isFinite(n), "Valore numerico non valido.");
    return n;
  };
  const bool = (v: unknown) => {
    const s = text(v).toLowerCase();
    ensure(
      ["si", "sì", "no", "true", "false", "1", "0"].includes(s),
      "Usa SI oppure NO nei campi booleani.",
    );
    return ["si", "sì", "true", "1"].includes(s);
  };
  const list = (v: unknown) =>
    text(v)
      .toLowerCase()
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean);
  const ingredients: Ingredient[] = read("Ingredienti").map((r) => ({
    id: text(r.Codice),
    name: text(r.Nome),
    unit: text(r.Unita) as Ingredient["unit"],
    stock: num(r.Giacenza),
    minStock: num(r.Scorta_minima),
    packSize: num(r.Confezione),
    allergens: list(r.Allergeni),
    vegan: bool(r.Vegano),
  }));
  const recipes = read("Ricette");
  const products: Product[] = read("Prodotti").map((r) => ({
    id: text(r.Codice),
    name: text(r.Nome),
    category: text(r.Categoria) as Product["category"],
    description: text(r.Descrizione),
    priceCents: Math.round(num(r.Prezzo_euro) * 100),
    dailyLimit: num(r.Limite_giornaliero),
    active: bool(r.Attivo),
    allergens: [],
    vegan: false,
    traces: list(r.Tracce),
    image: text(r.Immagine),
    recipe: recipes
      .filter((x) => text(x.Prodotto) === text(r.Codice))
      .map((x) => ({
        ingredientId: text(x.Ingrediente),
        quantity: num(x.Quantita),
      })),
  }));
  for (const r of recipes)
    ensure(
      products.some((p) => p.id === text(r.Prodotto)),
      "Una ricetta fa riferimento a un prodotto inesistente.",
    );
  return validateCatalog({
    products,
    ingredients,
    version,
    updatedAt: new Date().toISOString(),
  });
}
