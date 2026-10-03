# Sicurezza e limiti operativi

Il progetto applica controlli concreti; nessun sito può essere dichiarato impenetrabile. HTTPS/TLS protegge il trasporto: non è una VPN e non protegge da solo password rubate, dispositivi compromessi o configurazioni errate.

## Confini di accesso

| Identità               | Permessi                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Visitatore             | Catalogo e disponibilità aggregate, con App Check nel servizio reale                                   |
| Studente/personale     | Profilo proprio, prenotazioni proprie, budget; prenotazioni dopo verifica email e approvazione         |
| Bar                    | Ordini per giorno, preparazioni, incassi, ritiro, ingredienti e catalogo; secondo fattore obbligatorio |
| Scuola                 | Approvazione/sospensione utenti ordinari, calendario e capienze; secondo fattore obbligatorio          |
| Amministratore tecnico | Assegnazione ruoli da script amministrativo; gestione infrastruttura e segreti                         |

La scuola non riceve il dettaglio nominativo degli acquisti altrui. Il ruolo bar non gestisce account o calendario. Gli amministratori non sono selezionabili nella registrazione.

## Controlli implementati

- Firebase Authentication Email/Password, sessione browser limitata, email verificata sul server. I nuovi account reali attendono approvazione.
- Claim Firebase privilegiato e ruolo del documento devono coincidere. Lo stato sospeso del profilo viene verificato a ogni accesso API.
- TOTP a sei cifre con finestra di 30 secondi, prevenzione del riutilizzo e blocco dopo cinque tentativi errati in cinque minuti. Token privilegiato firmato, valido 15 minuti e conservato solo in memoria.
- App Check su tutte le API del browser, CORS con origine esatta. Il webhook Nexi usa invece il token privato del pagamento e la verifica API del provider.
- Firestore nega al browser letture e scritture operative, anche con claim bar. Permette soltanto creazione rigorosamente validata e lettura del proprio profilo.
- Prezzi, ricette, disponibilità, capienze, orari e totali calcolati nel Worker. Transazioni Firestore, ripetizione controllata in caso di conflitto e identificativo ordine idempotente.
- Massimo 10 pezzi per prodotto, 20 per ordine, sei ordini creati per persona/giorno; limite di 30 mutazioni API al minuto per account. Cancellare non azzera il contatore antiabuso.
- Consegna vincolata a codice riservato, incasso registrato e finestra di ritiro. Il numero pubblico in coda non basta.
- File Excel con limite compresso e decompresso, massimo numero di archivi e righe, rifiuto di formule, macro e collegamenti esterni. Nessuna esecuzione dei contenuti importati.
- React effettua escaping del testo; non viene inserito HTML non attendibile. CSV neutralizza celle iniziate come formule.
- CSP, HSTS, blocco framing, referrer limitato, nessun Analytics, font e immagini serviti localmente.
- Nessun numero completo di carta, CVV o token per futuri addebiti salvato. Nessun saldo ricaricabile.

I secret Worker e l’account amministrativo bypassano le regole Firestore tramite IAM: proteggerli è indispensabile. Non esporre `FIREBASE_PRIVATE_KEY`, segreti TOTP o `NEXI_API_KEY`. La configurazione Firebase web e la site key App Check sono invece identificatori pubblici. Restringere l’API key alle API previste dal progetto dopo aver verificato le indicazioni Firebase.

## Revoca e manutenzione

Sospendi l’utente nel pannello scuola per bloccare subito le API. Per account riservati interviene il responsabile tecnico sul profilo, sui claim e sui token Firebase. La sola disabilitazione in Authentication può lasciare valido un ID token già emesso fino alla sua scadenza: per il blocco immediato aggiornare anche `users/{uid}.disabled`.

Alla perdita dell’autenticatore revoca il mapping TOTP, ruota il segreto, invalida i token tramite rotazione di `STAFF_SESSION_SECRET` quando necessario e verifica l’identità prima di reiscrivere il titolare. Proteggi con MFA anche GitHub, Firebase e Cloudflare. Tieni aggiornate le dipendenze e verifica i ripristini.

## Disponibilità, 1.000 utenti e gratuità

Il frontend statico è distribuibile via CDN. Il server non mantiene una connessione Firestore realtime per ciascuno studente. Il bar carica gli ordini della data selezionata e lo schermo ritiri mostra solo numeri.

Il registro giornaliero è aggiornato in transazione: protegge dalla sovravendita, ma può diventare un punto di contesa con molti checkout simultanei. La prova da 1.000 richieste in memoria verifica l’invariante sulle quantità, non la latenza o la capacità cloud. Prima di promettere 1.000 utenti simultanei occorre una prova autorizzata nell’ambiente di staging con misurazione di tempi, errori, conflitti, CPU Worker e quote.

Il piano Firestore gratuito include quote giornaliere di letture/scritture e di archiviazione; Workers Free ha limiti di richieste e CPU. Un processo che supera tali limiti può non completarsi. I limiti gratuiti non costituiscono uno SLA. La gestione manuale al banco rimane la procedura di continuità. Le notifiche email degli ordini non sono implementate: è disponibile il PDF; verifica e recupero account usano le email Firebase.

## Archiviazione e backup

Il codice non attiva cancellazioni automatiche o backup a pagamento. Definire periodi di conservazione distinti per ordini operativi, documenti fiscali, account e audit; applicarli con una procedura amministrativa verificata. Esportare giornalmente i riepiloghi dal bar non equivale a un backup completo del database. Il responsabile tecnico deve predisporre e provare un export protetto completo e il ripristino, anche per i dati degli account.

Lo storico personale ha una soglia di sicurezza di 5.000 documenti per risposta, gli account amministrati 2.000, gli ordini per giorno 2.500: il server segnala il superamento e non mostra totali parziali. Gli audit visibili sono gli ultimi 100. Questi limiti richiedono paginazione/archiviazione per usi più estesi.

Fonti tecniche: [Firestore quotas](https://firebase.google.com/docs/firestore/quotas), [Auth limits](https://firebase.google.com/docs/auth/limits), [App Check](https://firebase.google.com/docs/app-check), [custom claims](https://firebase.google.com/docs/auth/admin/custom-claims), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/). Quote e condizioni vanno ricontrollate prima dell’attivazione.
