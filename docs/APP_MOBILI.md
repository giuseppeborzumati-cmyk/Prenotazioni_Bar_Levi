# Intervallo sul telefono

## Cosa viene consegnato

| Versione                        | Utilizzo                                                                         | Stato                               |
| ------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------- |
| App web installabile (PWA)      | Prenotazioni reali su Android e iPhone, dopo l’attivazione del servizio          | Implementata nel sito               |
| APK Android «Intervallo Prova»  | Collaudo locale di catalogo, carrello, account fittizi, gestione bar/scuola, PDF | Compilato e firma verificata; sorgenti in `android/` |
| Progetto iOS «Intervallo Prova» | Stessa prova su simulatore o dispositivo con firma Apple                         | Progetto Xcode in `ios/App/`        |

**L’APK di prova non invia ordini al bar e non incassa denaro.** I dati sono locali al dispositivo; installazioni diverse non condividono gli ordini. Le credenziali dimostrative sono nel README. Non usare password personali o dati reali. Una registrazione effettuata nella prova non crea un account Firebase.

Il pulsante «Apri servizio scuola» apre `https://bar-prenotazione-levi.web.app/` nel browser di sistema integrato. Il dominio è quello del progetto Firebase fornito, ma **la presenza del link non attesta che il servizio sia già stato pubblicato**. Finché non sono completati i passaggi di [ATTIVAZIONE.md](ATTIVAZIONE.md), quel servizio può essere indisponibile.

## Installazione gratuita su iPhone e Android

Dopo la pubblicazione HTTPS del sito reale:

1. **iPhone:** apri il sito in Safari → Condividi → Aggiungi alla schermata Home → abilita «Apri come app web», se mostrato → Aggiungi.
2. **Android:** apri il sito in Chrome → «Installa app» nel sito, oppure menu del browser → Installa app / Aggiungi a schermata Home.
3. Accedi con l’account reale verificato e approvato dalla scuola. Le credenziali bar e scuola sono riservate, diverse da quelle pubbliche di prova.

La PWA non richiede pubblicazione negli store. Il pulsante di installazione dipende dal browser; il sito mostra le istruzioni quando non è disponibile una richiesta automatica.

Non si ordinano prodotti offline. Il service worker conserva soltanto una pagina pubblica «Connessione assente», non copie di ordini, token o risposte dei pagamenti. Se la rete cade dopo la conferma, controllare lo storico prima di ripetere l’operazione.

## APK Android

Requisiti di compilazione: Node 22.12+, JDK 21, Android SDK 36 e Build Tools 36.0.0. Android Studio può installarli gratuitamente. L’app supporta Android 7/API 24 o superiore; mantenere aggiornato Android System WebView/Chrome.

```bash
npm ci
npm run mobile:android
```

APK prodotto: `android/app/build/outputs/apk/debug/app-debug.apk`. Su Windows usare `gradlew.bat` nella cartella `android` dopo `npm run mobile:sync`.

Il pacchetto di collaudo è firmato con una chiave di sviluppo, non è una release per l’esercizio scolastico. Per provarlo, trasferirlo al proprio Android e autorizzare l’installazione da quella specifica app quando il sistema lo chiede. Non disabilitare Play Protect né le verifiche di sicurezza. Su dispositivi gestiti dalla scuola rivolgersi all’amministratore.

Per una distribuzione Android definitiva occorrono una chiave di firma custodita dal proprietario, versioni incrementali e una procedura di aggiornamento. Non inserire chiavi `.jks`, password, account di servizio o segreti Nexi nel repository. Le build CI hanno chiavi di sviluppo temporanee: potrebbero richiedere la disinstallazione della precedente prova, con perdita dei dati fittizi locali.

## iOS e limiti della gratuità

Un APK non funziona su iPhone. Il progetto iOS usa Capacitor e Swift Package Manager. Per aprirlo su un Mac con Xcode 26 o successivo:

```bash
npm ci
npm run mobile:ios
```

In Xcode scegliere il target App, configurare Signing & Capabilities con il proprio Team e selezionare il dispositivo o simulatore. Il Team Apple, i certificati e i profili non sono inclusi. Un Apple Account gratuito consente prove personali con limiti e firma da rinnovare; Apple indica profili validi 7 giorni. Non è una modalità adatta a distribuire l’app a tutti gli studenti.

Per la distribuzione tramite App Store/TestFlight serve un programma Apple idoneo; non è garantita a costo zero. Gli istituti accreditati possono verificare l’eventuale esenzione dalla quota con Apple. L’app web installabile resta il percorso senza abbonamenti per gli utenti della scuola. Non viene dichiarato pronto un file IPA installabile privo della firma necessaria.

Il workflow `.github/workflows/mobile.yml` compila Android e una build iOS **per simulatore, senza firma**. I risultati sono scaricabili dalla sezione Actions del repository quando il workflow termina correttamente; la build del simulatore non si installa su un iPhone.

## Sicurezza delle applicazioni

- Il pacchetto di prova include il sito e i dati dimostrativi. Nessun segreto del backend viene inserito nel pacchetto.
- Nessuna navigazione remota viene autorizzata dentro il WebView con il bridge nativo. Il servizio reale si apre tramite browser HTTPS, preservando l’origine autorizzata di Firebase App Check e i controlli dei pagamenti.
- Il pacchetto non aggiunge una seconda autenticazione Firebase nativa: non si rimuove App Check per aggirare i problemi di origine dei WebView.
- Android blocca traffico HTTP e contenuti misti; il backup applicativo è disabilitato. Il file provider espone soltanto la sottocartella temporanea degli export.
- I PDF e CSV della prova si salvano/condividono attraverso il pannello di sistema su richiesta dell’utente. I file temporanei vengono rimossi dopo la condivisione.
- La dichiarazione privacy iOS descrive la prova locale, non è un’informativa definitiva per il servizio della scuola.

Prima di un uso reale occorre collaudare su dispositivi fisici: tastiera, import Excel, esportazione PDF, rotazione, accessibilità, connessione instabile, login e ritorno da Nexi. Le sole compilazioni non certificano questi flussi.

## Riferimenti ufficiali

- https://capacitorjs.com/docs/getting-started/environment-setup
- https://capacitorjs.com/docs/apis/filesystem
- https://capacitorjs.com/docs/apis/share
- https://support.apple.com/it-it/guide/iphone/iphea86e5236/ios
- https://developer.apple.com/help/account/basics/about-your-developer-account
- https://developer.apple.com/support/membership-fee-waiver/
