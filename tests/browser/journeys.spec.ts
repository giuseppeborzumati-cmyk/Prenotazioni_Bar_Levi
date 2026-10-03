import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function login(page: Page, email: string, password: string) {
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Email", { exact: true }).fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Accedi al tuo spazio" }).click();
  await expect(form).not.toBeVisible();
}
async function logout(page: Page) {
  await page.getByRole("button", { name: "Esci", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Accedi", exact: true }),
  ).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Aggiungi La Caprese", exact: true }),
  ).toBeVisible();
  page.on("dialog", (d) => d.accept());
});
test("studente → carrello → PDF → bar → incasso → ritiro", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "studente@demo.local", "StudenteDemo!2026");
  await page
    .getByRole("button", { name: "Aggiungi La Caprese", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Aggiungi Tè al limone", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /Ho letto ingredienti/ }).check();
  await page
    .getByRole("button", { name: "Conferma con obbligo di pagare" })
    .click();
  const ticket = page.getByRole("dialog", { name: "La tua prenotazione" });
  await expect(ticket).toBeVisible();
  const code = (await ticket.locator(".ticket-code b").innerText()).trim();
  expect(code).toMatch(/^[A-F0-9]{12}$/);
  const downloaded = page.waitForEvent("download");
  await ticket.getByRole("button", { name: "Scarica il PDF" }).click();
  const pdf = await downloaded;
  await pdf.saveAs("verification/prenotazione-esempio.pdf");
  expect((await readFile(await pdf.path())).subarray(0, 4).toString()).toBe(
    "%PDF",
  );
  await ticket.getByRole("button", { name: "Chiudi finestra" }).click();
  await page.getByRole("button", { name: /Le mie prenotazioni/ }).click();
  await expect(page.locator(".order-card")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Coda e preparazioni" }),
  ).toHaveCount(0);
  await logout(page);
  await login(page, "bar@demo.local", "BarDemo!2026");
  await page.getByRole("button", { name: "Coda e preparazioni" }).click();
  await page.getByRole("textbox", { name: "Cerca prenotazione" }).fill(code);
  await expect(page.locator(".bar-order")).toHaveCount(1);
  await page.getByRole("button", { name: "Prepara", exact: true }).click();
  await page.getByRole("button", { name: "Segna pronto" }).click();
  await page.getByRole("button", { name: "Registra incasso" }).click();
  await expect(page.locator(".bar-order")).toContainText("Pagato");
  await page.getByRole("button", { name: "Consegna", exact: true }).click();
  const collect = page.getByRole("dialog", { name: "Verifica il ritiro" });
  await collect.getByLabel("Codice di ritiro").fill("ERRATO");
  await collect.getByRole("button", { name: "Conferma consegna" }).click();
  await expect(collect).toBeVisible();
  await collect.getByLabel("Codice di ritiro").fill(code);
  await collect.getByRole("button", { name: "Conferma consegna" }).click();
  await expect(collect).not.toBeVisible();
  await expect(page.locator(".bar-order")).toContainText("Ritirato");
  expect(errors).toEqual([]);
});
test("personale in attesa, approvazione scuola e separazione dei ruoli", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  let form = page.getByRole("dialog");
  await form.getByRole("button", { name: "Registrati", exact: true }).click();
  await form.getByLabel("Nome e cognome").fill("Test Collaboratore");
  await form.getByLabel("Tipo di account").selectOption("staff");
  await form
    .getByRole("combobox", { name: "Categoria", exact: true })
    .selectOption("collaboratore");
  await form
    .getByLabel("Email", { exact: true })
    .fill("collaboratore-test@demo.local");
  await form
    .getByLabel("Password", { exact: true })
    .fill("CollaboratoreProva!2026");
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Crea account", exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(
    page.getByText("Account in attesa di approvazione.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Account della scuola" }),
  ).toHaveCount(0);
  await logout(page);
  await login(page, "scuola@demo.local", "ScuolaDemo!2026");
  await page.getByRole("button", { name: "Account della scuola" }).click();
  const row = page
    .getByRole("row")
    .filter({ hasText: "collaboratore-test@demo.local" });
  await row.getByRole("button", { name: "Approva", exact: true }).click();
  await expect(row).toContainText("Approvato");
  await expect(
    page.getByRole("button", { name: "Coda e preparazioni" }),
  ).toHaveCount(0);
  await expect(page.locator(".bar-order")).toHaveCount(0);
  await logout(page);
  await login(page, "collaboratore-test@demo.local", "CollaboratoreProva!2026");
  await expect(
    page.getByText("Account in attesa di approvazione.", { exact: false }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Le mie prenotazioni/ }).click();
  await expect(page.locator(".order-card")).toHaveCount(0);
});
test("importazione Excel reale, fabbisogni e schermo ritiri senza nomi", async ({
  page,
}) => {
  await login(page, "bar@demo.local", "BarDemo!2026");
  await page.getByRole("button", { name: "Catalogo ed Excel" }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles("public/modello_catalogo.xlsx");
  const preview = page.getByRole("dialog", {
    name: "Controlla il catalogo importato",
  });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("6 prodotti");
  await preview.getByRole("checkbox").check();
  await preview.getByRole("button", { name: "Conferma importazione" }).click();
  await expect(preview).not.toBeVisible();
  await page.getByRole("button", { name: "Fabbisogno e scorte" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Provola" }),
  ).toBeVisible();
  await page.screenshot({
    path: "verification/fabbisogno.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Coda e preparazioni" }).click();
  await page.getByRole("button", { name: "Schermo ritiri" }).click();
  await expect(page.locator(".pickup-board")).toBeVisible();
  await expect(page.locator(".pickup-board")).not.toContainText("Alex");
  await expect(page.locator(".pickup-board")).toContainText("B-001");
});
test("telefono: navigazione, filtro vegano e assenza di scorrimento orizzontale", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Vegano", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "La Caprese", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "verification/mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Apri menu" }).click();
  await page
    .getByRole("button", { name: "Documenti e aiuto", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tutto chiaro, prima della pausa." }),
  ).toBeVisible();
});
