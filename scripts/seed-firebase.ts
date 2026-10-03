import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { seedCatalog } from "../shared/seed";
import { DEFAULT_SETTINGS } from "../shared/domain";
initializeApp({
  credential: applicationDefault(),
  projectId: "bar-prenotazione-levi",
});
const db = getFirestore();
await db.runTransaction(async (tx) => {
  const catalog = db.doc("config/catalog"),
    service = db.doc("config/service");
  const [c, s] = await Promise.all([tx.get(catalog), tx.get(service)]);
  if (c.exists || s.exists)
    throw new Error(
      "Configurazione già presente: nessun dato esistente è stato sovrascritto.",
    );
  tx.create(catalog, seedCatalog());
  tx.create(service, {
    ...DEFAULT_SETTINGS,
    accepting: false,
    notice:
      "Servizio in configurazione. Le prenotazioni saranno aperte dopo il collaudo.",
  });
});
console.log(
  "Dati di esempio inizializzati, servizio chiuso. Verificare prezzi, ricette, allergeni, condizioni e aprire dal pannello scuola.",
);
