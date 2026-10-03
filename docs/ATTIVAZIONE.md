# Attivazione del servizio effettivo

Questa procedura pubblica l’applicazione reale. Non inserire nei campi Firebase le credenziali `@demo.local`: sono account della sola simulazione. Non inviare password, file amministrativi o chiavi Nexi in chat, nel repository o nelle issue.

## 1. Firebase, progetto già indicato

Apri la [console Firebase](https://console.firebase.google.com/project/bar-prenotazione-levi/overview) con un account autorizzato. Mantieni il piano **Spark**. La guida non richiede Functions, App Hosting, Storage, SMS o estensioni email.

- Authentication → Sign-in method: abilita **Email/Password**. Disabilita il provider anonimo se non serve ad altre applicazioni dello stesso progetto. Il bar non accetta identità anonime.
- Authentication → Settings: configura una password minima di almeno 12 caratteri, protezione contro l’enumerazione delle email e i domini autorizzati. Aggiungi solo l’hosting effettivo, non wildcard.
- Personalizza nome del mittente e testi delle email di verifica e recupero. Le email Firebase hanno quote giornaliere: organizza l’attivazione degli studenti in gruppi.
- Crea Firestore **Standard, Native mode**, database `(default)`, scegliendo una regione UE compatibile con le decisioni del titolare. La regione non si cambia semplicemente dopo la creazione.
- Pubblica **il file completo** `firestore.rules`, non una regola permissiva temporanea. Puoi copiarlo nella scheda Rules o usare il comando sotto.
- Non è necessario attivare Cloud Storage. `storage.rules` è una configurazione di diniego per un eventuale bucket già esistente.

```bash
npm ci
npx firebase login
npx firebase deploy --project bar-prenotazione-levi --only firestore:rules,firestore:indexes
```

Se altre applicazioni usano le stesse collezioni, verifica prima la compatibilità: le regole sono pensate per questo progetto e negano l’accesso operativo diretto dal browser.

## 2. App Check

Registra la web app in Firebase App Check con reCAPTCHA Enterprise e il dominio effettivo. Copia la **site key pubblica** in `VITE_APP_CHECK_SITE_KEY`. Configura l’app senza abilitare spese automatiche e controlla le quote del provider.

Abilita l’enforcement Firestore dopo aver verificato le metriche del dominio autorizzato. L’API Worker verifica sempre i token App Check; senza questa configurazione il servizio reale rifiuta le richieste. Non aggiungere token debug a un sito pubblico. App Check riduce gli abusi, non sostituisce autenticazione, controlli del server o monitoraggio.

## 3. API gratuita Cloudflare Worker

Crea o usa un account Cloudflare **Workers Free**. Il codice non richiede KV, R2 o Durable Objects. Con un account gratuito già autorizzato:

```bash
npx wrangler login
```

Crea un service account Google dedicato al Worker con il solo ruolo IAM necessario `roles/datastore.user` sul progetto. La chiave privata deve restare nei secret Cloudflare. Non usare un account Owner/Editor. Per gli script che modificano Firebase Authentication usa un’identità amministrativa separata e solo sul computer autorizzato.

Inserisci i valori mediante input riservato del comando, mai come costanti `VITE_` o valori committati:

```bash
npx wrangler secret put FIREBASE_CLIENT_EMAIL
npx wrangler secret put FIREBASE_PRIVATE_KEY
npx wrangler secret put STAFF_SESSION_SECRET
npx wrangler secret put STAFF_TOTP_SECRETS
```

- `FIREBASE_CLIENT_EMAIL`: email del service account dedicato.
- `FIREBASE_PRIVATE_KEY`: campo `private_key` completo del suo JSON, incluso BEGIN/END PRIVATE KEY. Sono accettati ritorni a capo reali o `\n`.
- `STAFF_SESSION_SECRET`: segreto casuale di almeno 32 byte; generarne uno localmente, per esempio con `openssl rand -hex 32`.
- `STAFF_TOTP_SECRETS`: oggetto JSON che associa ciascun UID riservato a un segreto TOTP distinto. Inizialmente `{}` impedisce l’accesso agli amministratori finché non sono iscritti all’autenticatore.

Controlla `ALLOWED_ORIGIN` in `wrangler.toml`: deve coincidere esattamente con l’origine frontend scelta, senza slash finale. Poi:

```bash
npx wrangler deploy
```

Annota l’URL `https://bar-levi-api.…workers.dev`. Non usare `--temporary` per il servizio istituzionale. Non abilitare Workers Paid per seguire questa guida.

## 4. Dati iniziali

Sul computer autorizzato configura `GOOGLE_APPLICATION_CREDENTIALS` con il percorso del file amministrativo locale, tenuto **fuori dal repository**. In alternativa usa Application Default Credentials di un’identità autorizzata.

```bash
npm run firebase:seed
```

Lo script crea catalogo e regole del servizio soltanto se non esistono; **non sovrascrive dati presenti**. Le prenotazioni vengono inizializzate chiuse. Il catalogo è esemplificativo: il bar deve convalidare composizione, allergeni, prezzi e disponibilità.

## 5. Frontend reale

Copia `.env.example` in `.env.local` e imposta:

```dotenv
VITE_DEMO_MODE=false
VITE_API_BASE=https://URL-DEL-TUO-WORKER.workers.dev
VITE_APP_CHECK_SITE_KEY=SITE_KEY_PUBBLICA
```

Nessuna chiave Nexi o chiave privata deve avere prefisso `VITE_`: questi valori diventano pubblici nel browser. Restringi `connect-src` nella CSP di `firebase.json` sostituendo `https://*.workers.dev` con l’origine esatta del tuo Worker.

```bash
npm run build
npx firebase deploy --project bar-prenotazione-levi --only hosting
```

Indirizzo previsto dal progetto: `https://bar-prenotazione-levi.web.app`. Questo indirizzo è una destinazione di configurazione, **non una dichiarazione che la pubblicazione sia già avvenuta**.

## 6. Account bar e scuola: cosa inserire in Authentication

Usa **email reali e personali dei titolari**, per esempio quella istituzionale del responsabile scuola e quella del gestore. Le password vengono scelte privatamente dai titolari; non esiste una password amministrativa universale.

1. Ciascun titolare si registra dal sito come personale scolastico e conferma l’email. La registrazione crea un profilo in attesa, senza privilegi.
2. Il responsabile tecnico assegna il ruolo da un terminale amministrativo, non dal browser pubblico:

```bash
npm run roles -- EMAIL_REALE_DEL_GESTORE bar
npm run roles -- EMAIL_REALE_DEL_RESPONSABILE school_admin
```

3. Lo script stampa il relativo UID. Genera un segreto diverso per ogni persona:

```bash
node scripts/generate-totp.mjs EMAIL_REALE_DEL_TITOLARE
```

4. Il titolare inserisce il segreto in un’app autenticatore TOTP. Conserva la copia di recupero in luogo riservato. Non usare SMS o servizi a pagamento.
5. Aggiorna il secret `STAFF_TOTP_SECRETS` con una mappa `{"UID_BAR":"SEGRETO_TOTP_BAR","UID_SCUOLA":"SEGRETO_TOTP_SCUOLA"}`. UID e nomi qui sono segnaposto.
6. Esci e accedi con email, password e codice corrente dell’autenticatore. La sessione privilegiata dura 15 minuti e rimane solo in memoria: dopo scadenza o ricaricamento è necessario ripetere il secondo fattore.

Per un account creato manualmente in Authentication manca inizialmente il documento profilo: usare la registrazione del sito è la procedura preferita. Se un errore lascia un account incompleto, il responsabile deve verificarlo nella console prima di ricrearlo; non aprire le regole per aggirare il problema.

La categoria “dirigente” selezionata in registrazione non equivale a `school_admin`. La scuola approva o sospende studenti/personale dal pannello; non può assegnarsi nuovi superpoteri.

## 7. Apertura

Completa informativa, condizioni, recapiti del bar, verifica allergeni, regole sui minori, conservazione e backup. Esegui il collaudo sul dominio reale con un gruppo limitato. Dal pannello scuola apri le prenotazioni. Nexi resta opzionale: vedi [NEXI.md](NEXI.md).
