import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { parseExcel } from "../src/excel";
const path = new URL("../public/modello_catalogo.xlsx", import.meta.url);
it("importa il vero modello Excel distribuito nel sito", async () => {
  const buffer = await readFile(path);
  const result = await parseExcel(new File([buffer], "catalogo.xlsx"), 1);
  expect(result.products).toHaveLength(6);
  expect(result.ingredients).toHaveLength(10);
  expect(result.products[0].priceCents).toBe(280);
  expect(result.products[0].allergens).toContain("latte");
  expect(result.products.find((p) => p.id === "orto")?.vegan).toBe(true);
});
it("rifiuta formule e prezzi non numerici prima dell’anteprima", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.pathname);
  wb.getWorksheet("Prodotti")!.getCell("E2").value = {
    formula: "1+1",
    result: 2,
  };
  const bytes = await wb.xlsx.writeBuffer();
  await expect(
    parseExcel(new File([bytes as ArrayBuffer], "male.xlsx"), 1),
  ).rejects.toThrow(/formul/i);
});
it("rifiuta file grandi o non XLSX", async () => {
  await expect(
    parseExcel(new File(["test"], "evil.xlsm"), 1),
  ).rejects.toThrow();
  await expect(
    parseExcel(new File([new Uint8Array(1100000)], "grande.xlsx"), 1),
  ).rejects.toThrow();
});
