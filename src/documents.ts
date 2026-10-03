import type { Order, Settings } from "../shared/types";
import { SLOTS, money } from "../shared/domain";
import { IS_DEMO } from "./api";
import { saveFile } from "./mobile";
export async function orderPDF(order: Order, settings: Settings) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  const W = 210;
  let y = 22;
  pdf.setFillColor(23, 42, 37);
  pdf.rect(0, 0, W, 43, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(25);
  pdf.text("Intervallo / Bar Levi", 16, y);
  pdf.setFontSize(10);
  pdf.text(settings.schoolName, 16, y + 10);
  y = 55;
  pdf.setTextColor(25, 40, 35);
  pdf.setFontSize(15);
  pdf.text(
    IS_DEMO ? "PRENOTAZIONE DIMOSTRATIVA" : "CONFERMA DI PRENOTAZIONE",
    16,
    y,
  );
  y += 12;
  const line = (label: string, value: string) => {
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text(label, 16, y);
    pdf.setFont("helvetica", "normal");
    const text = pdf.splitTextToSize(value, 125);
    pdf.text(text, 65, y);
    y += Math.max(8, text.length * 5 + 3);
  };
  line("Ordine", order.id);
  line(
    "Intestatario",
    order.customerName + (order.className ? " · " + order.className : ""),
  );
  line(
    "Ritiro",
    `${order.date} | ${SLOTS[order.slot].start} - ${SLOTS[order.slot].end}`,
  );
  line(
    "Numero coda",
    `${SLOTS[order.slot].prefix}-${String(order.queueNumber).padStart(3, "0")}`,
  );
  line("Codice riservato", order.pickupCode);
  line(
    "Pagamento",
    order.paymentStatus === "paid"
      ? "Registrato"
      : order.paymentStatus === "pending"
        ? "In attesa di verifica"
        : "Da effettuare al ritiro",
  );
  y += 4;
  pdf.setFillColor(240, 235, 221);
  pdf.rect(16, y - 5, 178, 9, "F");
  pdf.setFontSize(11);
  pdf.text("Prodotto", 20, y + 1);
  pdf.text("Totale", 168, y + 1);
  y += 13;
  for (const row of order.lines) {
    if (y > 240) {
      pdf.addPage();
      y = 25;
    }
    pdf.setFontSize(11);
    pdf.text(`${row.quantity} x ${row.name}`, 20, y);
    pdf.text(money(row.quantity * row.priceCents).replace("€", "EUR"), 167, y, {
      align: "left",
    });
    y += 7;
    pdf.setFontSize(8);
    const detail = `Allergeni: ${row.allergens.join(", ") || "nessuno dichiarato"}. ${row.traces.length ? "Possibili tracce: " + row.traces.join(", ") + ". " : ""}${row.vegan ? "Ricetta vegana." : ""}`;
    const wrapped = pdf.splitTextToSize(detail, 170);
    pdf.text(wrapped, 20, y);
    y += wrapped.length * 4 + 7;
  }
  if (y > 220) {
    pdf.addPage();
    y = 25;
  }
  pdf.setFontSize(15);
  pdf.text("Totale: " + money(order.totalCents).replace("€", "EUR"), 16, y + 6);
  y += 20;
  pdf.setFontSize(9);
  pdf.text(
    pdf.splitTextToSize(
      "Conserva il codice e comunicalo al banco soltanto al ritiro. Il codice non permette di accedere al tuo account. Questo documento non sostituisce il documento commerciale o gli altri adempimenti fiscali.",
      178,
    ),
    16,
    y,
  );
  y += 22;
  pdf.text(
    pdf.splitTextToSize(
      IS_DEMO
        ? "DEMO: prodotti, allergeni e prezzi sono esempi da validare dal gestore. Nessun pagamento reale."
        : "Contatta il bar per chiarimenti sugli ingredienti e sulle possibili contaminazioni. La dicitura vegano non equivale ad assenza di allergeni.",
      178,
    ),
    16,
    y,
  );
  pdf.setFontSize(8);
  pdf.text(
    `Catalogo v${order.catalogVersion} · Condizioni ${order.termsVersion}`,
    16,
    285,
  );
  await saveFile(`Prenotazione_${order.id}.pdf`, pdf.output("blob"));
}
export async function reportPDF(
  title: string,
  rows: string[],
  filename: string,
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  let y = 25;
  pdf.setFontSize(20);
  pdf.text("Intervallo / Bar Levi", 16, y);
  y += 12;
  pdf.setFontSize(14);
  pdf.text(title, 16, y);
  y += 12;
  pdf.setFontSize(10);
  for (const row of rows) {
    for (const text of pdf.splitTextToSize(row, 178)) {
      if (y > 275) {
        pdf.addPage();
        y = 20;
      }
      pdf.text(text, 16, y);
      y += 6;
    }
    y += 2;
  }
  await saveFile(filename, pdf.output("blob"));
}
export async function downloadCSV(name: string, rows: (string | number)[][]) {
  const text = rows
    .map((row) =>
      row
        .map((v) => {
          let s = String(v);
          if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
          return '"' + s.replaceAll('"', '""') + '"';
        })
        .join(";"),
    )
    .join("\r\n");
  const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
  await downloadBlob(name, blob);
}
export async function downloadBlob(name: string, blob: Blob) {
  await saveFile(name, blob);
}
