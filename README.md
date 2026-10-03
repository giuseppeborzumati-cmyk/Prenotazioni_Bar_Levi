# Intervallo · Bar Levi

Applicazione per le prenotazioni del bar dell’I.I.S. Primo Levi di Seregno. Interfaccia React/TypeScript, autenticazione Firebase, database Firestore e API Cloudflare Worker. Il repository contiene il servizio e un ambiente separato di prova.

**Stato della consegna:** codice funzionante e verificabile localmente; l’attivazione del database e la pubblicazione richiedono l’accesso autorizzato agli account Firebase/Cloudflare. Non vengono creati account amministrativi reali usando password pubbliche. Nexi è disabilitato finché il gestore non configura e collauda XPay.

## Prova subito

Node 22.12 o successivo:

```bash
npm ci
npm run dev:demo
```

Apri l’indirizzo mostrato dal terminale. La prova salva esclusivamente dati fittizi nel browser. Le credenziali seguenti **non funzionano nel servizio Firebase**:

| Profilo di prova       | Email               | Password          |
| ---------------------- | ------------------- | ----------------- |
| Studente               | studente@demo.local | StudenteDemo!2026 |
| Docente                | docente@demo.local  | DocenteDemo!2026  |
| Gestore bar            | bar@demo.local      | BarDemo!2026      |
| Amministrazione scuola | scuola@demo.local   | ScuolaDemo!2026   |

Puoi anche registrare profili fittizi. Per provare l’approvazione, crea un account personale scolastico, esci, accedi come scuola e approvalo. In modalità reale tutti i nuovi profili, anche gli studenti, attendono approvazione ed email verificata.

## Funzioni

- Catalogo ricercabile, categorie, filtro vegano, ingredienti, allergeni e tracce prima dell’acquisto.
- Carrello con prezzi in centesimi, massimo 20 pezzi, controllo della disponibilità e conferma esplicita dell’ordine.
- Prenotazioni anticipate; ritiro esclusivamente **09:45–09:55** o **12:45–13:00**, con fuso `Europe/Rome` verificato dal server.
- Numero progressivo per pausa e codice privato distinto per la consegna. Schermo ritiri senza nomi.
- Prenotazioni personali, annullamento nei termini, riordino con verifica del catalogo corrente, budget e spese.
- Ruoli bar e scuola separati. Docente, segreteria, dirigente, vicepreside, collaboratore e ATA sono categorie del personale, non privilegi amministrativi.
- Coda del bar, avanzamento preparazione, registrazione manuale degli incassi al banco, consegna con codice, rimborsi distinti.
- Importazione `.xlsx` con anteprima e convalida. Tre fogli collegati, controllo formule/macro/dimensione/duplicati.
- Ricette → fabbisogno ingredienti → quantità mancanti → arrotondamento alle confezioni. Export CSV per Excel e lista acquisti PDF.
- Conferma di prenotazione PDF reale, scaricabile e stampabile. Nessuna carta viene memorizzata.
- Calendario, capienze, sospensione del servizio, chiusure straordinarie, approvazione e sospensione degli account, registro delle operazioni.

Le giacenze sono valori di riferimento iniziali: questa versione **non scala automaticamente le vendite al banco o gli scarti**. Il modello non è un sistema HACCP né un registratore telematico.

## Attivazione del servizio

Segui [ATTIVAZIONE.md](docs/ATTIVAZIONE.md). La configurazione Firebase fornita è già in `src/firebase.ts`; non è una password amministrativa. Devi collegare:

1. Firebase Authentication, provider Email/Password;
2. Cloud Firestore con le regole del repository;
3. Firebase App Check;
4. un Cloudflare Worker gratuito per le operazioni protette;
5. Firebase Hosting statico, piano Spark.

`npm run dev` e `npm run build` usano il servizio reale quando `VITE_DEMO_MODE` non è `true`. `npm run dev:demo` e `npm run build:demo` selezionano esplicitamente la simulazione. Non è previsto un passaggio automatico ai dati fittizi in caso di errore del server.

## Guide

- [Attivazione, account e credenziali](docs/ATTIVAZIONE.md)
- [Sicurezza, limiti e gestione operativa](docs/SICUREZZA.md)
- [Collegamento Nexi e riconciliazione](docs/NEXI.md)
- [Catalogo, ricette ed Excel](docs/EXCEL.md)
- [Privacy e adempimenti da completare](docs/PRIVACY.md)
- [Prove eseguite e modello di collaudo](docs/COLLAUDO.md)
- [Modello Excel scaricabile](public/modello_catalogo.xlsx)

## Verifiche ripetibili

```bash
npm test
npm run build
npx firebase emulators:exec --project demo-levi --only firestore "npm run test:rules"
npx playwright install chromium
npm run test:browser
npx wrangler deploy --dry-run
```

I test delle regole usano l’emulatore, non il database dell’istituto. Le prove browser usano dati dimostrativi. È incluso un controllo con 1.000 richieste sul modello transazionale in memoria: **non certifica 1.000 connessioni simultanee in produzione**. Il database condiviso della disponibilità, il tempo CPU del Worker e le quote gratuite devono essere misurati prima dell’apertura all’intero istituto.

## Costi

Non sono richiesti abbonamenti software nel progetto. Hosting, autenticazione, database e Worker hanno quote gratuite: superarle può interrompere il servizio sul piano gratuito. Non attivare piani a consumo per seguire questa guida. Il dominio personalizzato è facoltativo; si può usare quello gratuito dell’hosting.

**Le transazioni Nexi possono avere commissioni e richiedono un contratto abilitato all’ecommerce. Avere un POS fisico non garantisce un gateway online gratuito.** Il pagamento al banco è già implementato senza integrazione obbligatoria con Nexi.

## Struttura

`src/` interfaccia e adapter; `shared/` regole di dominio; `worker/` API e pagamenti; `scripts/` inizializzazione e gestione riservata; `tests/` verifiche; `docs/` guide. Foto illustrative provenienti dal prototipo, font distribuiti localmente, logo originale conservato. Vedi [ATTRIBUZIONI.md](docs/ATTRIBUZIONI.md).
