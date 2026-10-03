# Collaudo tecnico

Le verifiche locali devono essere distinte dal collaudo del servizio pubblicato. I risultati effettivi dell’ultima esecuzione sono riportati nella consegna e possono essere riprodotti con i comandi del README.

## Esito locale del 3 ottobre 2026

Superati: 24 test dominio/API/Excel, 4 gruppi di test delle regole Firestore e tutti i 4 percorsi browser. Compilazione frontend reale e pacchetto Worker riuscite. `npm audit --omit=dev` non segnala vulnerabilità note nell’albero delle dipendenze di produzione dopo gli aggiornamenti applicati. Questo risultato non è un penetration test né copre automaticamente ogni dipendenza di sviluppo o ogni configurazione cloud.

## Test automatici inclusi

**24 controlli di dominio/API/importazione**: orari Europe/Rome e ora solare, data anticipata e chiusure, prezzi autoritativi, capienze, quantità, codici di coda, allergeni/vegano, fabbisogno, privacy ordini, CORS, App Check mancante, ruoli, TOTP con vettore RFC e antireplay, idempotenza, annullamento ripetuto, ritiro fuori orario, confronto importi Nexi, redirect consentiti e importazione del modello XLSX effettivamente distribuito.

**4 gruppi di test Firestore nell’emulatore**: creazione profilata, divieto di autoapprovazione/escalation, esclusione anonimi e profili altrui, negazione di accesso diretto ai dati operativi anche ai claim amministrativi.

**4 percorsi browser**:

1. Studente: carrello, ordine, PDF; bar: preparazione, incasso e consegna con codice.
2. Registrazione personale, stato in attesa, approvazione scuola, accesso con ruolo corretto e isolamento storico.
3. Importazione del modello Excel, anteprima/conferma, fabbisogno e schermo ritiri privo di nomi.
4. Telefono: filtro vegano, navigazione e controllo scorrimento orizzontale.

I test browser usano l’ambiente di prova; il ritiro fuori fascia è permesso **soltanto nella simulazione** e chiaramente indicato. Il controllo della fascia reale è testato nel backend.

## Prova del servizio reale da eseguire

Non sono state eseguite transazioni monetarie reali, assegnazioni di ruoli nel progetto Firebase dell’istituto, pubblicazioni sui suoi account cloud o prove cloud da 1.000 utenti. La verifica di 1.000 richieste riguarda un modello transazionale seriale in memoria e controlla la disponibilità: non è un benchmark di produzione.

In staging verificare flussi Auth/email/App Check, query e transazioni Firestore via REST, scadenza TOTP, revoca immediata dei profili, quote/CPU del Worker, simulazione di guasti di rete, Nexi sandbox, backup/ripristino e accessibilità. Usare utenti di test autorizzati, non dati reali di classi. Aumentare il carico gradualmente e registrare tempi p50/p95, errori, retry, CPU e consumo di quota. Le prove sul provider possono esaurire le quote gratuite: stabilire preventivamente limiti e finestra.

## Modello di verbale

| Campo                                             | Da compilare dopo la prova |
| ------------------------------------------------- | -------------------------- |
| Data, luogo e responsabile                        |                            |
| Versione/commit e dominio                         |                            |
| Progetto di staging e configurazione              |                            |
| Ruoli e utenti fittizi utilizzati                 |                            |
| Casistiche eseguite e risultati                   |                            |
| Verifica orari e fuso                             |                            |
| Verifica privacy e permessi                       |                            |
| Excel, allergeni e convalida gestore              |                            |
| Pagamenti/rimborsi: ambiente e riscontro provider |                            |
| Carico: utenti, durata, percentili ed errori      |                            |
| Backup e prova di ripristino                      |                            |
| Anomalie, responsabili e scadenze                 |                            |
| Decisione di apertura o mantenimento chiusura     |                            |
| Firma del responsabile                            |                            |

Il sito permette anche di scaricare una scheda PDF vuota. Non costituisce una dichiarazione automatica di avvenuto collaudo.
