# Privacy e condizioni: preparazione all’apertura

Questo file è una traccia operativa, non un’informativa definitiva né un’attestazione di conformità. Prima di raccogliere dati reali, scuola e gestore devono definire le rispettive responsabilità e pubblicare i testi completi nell’area Documenti del sito, attualmente contenuti in `src/App.tsx` nel componente `Documents`. Non attribuire automaticamente alla scuola o al bar un ruolo privacy senza considerare chi decide finalità e mezzi.

## Dati e finalità

Il sistema tratta nome, email, classe per gli studenti o categoria del personale, stato dell’account, ordini, importi, dati di ritiro e operazioni amministrative. Firebase gestisce le password; il codice applicativo non le legge. Il bar vede le informazioni necessarie a preparare e consegnare. Il pannello scuola gestisce gli accessi senza mostrare gli acquisti nominativi altrui.

Non raccogliere diagnosi, certificati, allergie personali o note sanitarie nel profilo. Il filtro vegano è una funzione del catalogo e non crea un profilo alimentare dell’utente. Le etichette degli allergeni descrivono i prodotti, non la salute dello studente. Qualora in futuro si introducano richieste alimentari riconducibili alla salute, valutare separatamente l’art. 9 GDPR e le misure necessarie.

## Informativa da completare

Indicare almeno: titolare/i e recapiti, eventuale DPO, finalità e basi giuridiche distinte, dati obbligatori e conseguenze del mancato conferimento, destinatari/responsabili, trasferimenti internazionali e relative garanzie, periodi di conservazione, diritti e modalità per esercitarli, reclamo al Garante e assenza/presenza di decisioni automatizzate rilevanti. Individuare formalmente i fornitori ai sensi dell’art. 28 quando applicabile.

L’accettazione delle condizioni d’acquisto non è un consenso generico per qualunque trattamento. Una registrazione non autorizza pubblicazione delle consumazioni o profilazione pubblicitaria. Il progetto non inizializza Firebase Analytics e non include pubblicità.

Per i minori, valutare base giuridica, informative comprensibili e regole della scuola con DPO e gestore. La soglia italiana dei 14 anni relativa al consenso per specifici servizi della società dell’informazione non risolve da sola i profili contrattuali dell’acquisto. Non assumere che tutti gli studenti possano aprire conti di pagamento: questa applicazione non ne apre e non conserva carte.

## Conservazione, accessi e sicurezza

Stabilire tempi proporzionati per gli ordini operativi, distinti dagli obblighi fiscali. Lo storico personale e il registro audit non devono restare illimitatamente senza una finalità. Prevedere gestione documentata di richieste di accesso, rettifica, cancellazione ove applicabile, incidenti e ripristino. Il GDPR richiede misure adeguate al rischio, non promette sicurezza assoluta.

Il progetto applica minimizzazione e separazione dei ruoli, ma le scelte organizzative e i contratti con i fornitori restano necessari. Regione UE del database non significa automaticamente assenza di ogni trasferimento: verificare anche autenticazione, supporto, App Check, hosting e pagamenti.

## Cookie, telefono e accessibilità

La demo usa storage locale per dati sintetici. Il servizio reale usa la persistenza di sessione Firebase e App Check/reCAPTCHA. Documentare questi strumenti nell’informativa e valutare con il titolare la disciplina applicabile ai tracciatori effettivamente utilizzati. Non aggiungere banner o consenso “a tutto” senza una classificazione corretta.

Il codice di ritiro è stampabile per evitare di imporre l’uso del telefono a scuola; si applicano il regolamento dell’istituto e le disposizioni ministeriali vigenti. Il sito comprende navigazione da tastiera, etichette e layout mobile, ma l’eventuale dichiarazione di accessibilità richiede verifica dei requisiti applicabili: non è generata come certificazione automatica.

## Alimenti e vendita

Il gestore deve validare ingredienti, allergeni e possibili contaminazioni prima dell’apertura. Per gli alimenti si considerano, fra gli altri, il Regolamento UE 1169/2011, gli artt. 9, 14 e 44 e l’allegato II secondo il tipo di vendita e prodotto, insieme alla disciplina nazionale applicabile. Una ricetta vegana può contenere allergeni.

Completare nelle condizioni: identità dell’esercente, contatti, prezzi finali, disponibilità, obbligo di pagamento, ritiro, annullamento, mancato ritiro, assistenza e rimborsi. Verificare le regole pertinenti sui contratti a distanza e sulle eccezioni al recesso per le specifiche forniture alimentari: il pulsante di annullamento del sito è una regola operativa e non sostituisce l’esame dei diritti del consumatore. Il PDF dell’ordine non è scontrino né fattura.

## Riferimenti ufficiali

- [GDPR, Regolamento UE 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj/ita): artt. 5, 6, 8, 9, 12–14, 25, 28, 32–35 e capo V, secondo i trattamenti effettivi.
- [Codice privacy, D.lgs. 196/2003](https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2003-06-30;196): in particolare art. 2-quinquies per il consenso dei minori nel suo specifico ambito.
- [Garante: scuola](https://www.garanteprivacy.it/temi/scuola).
- [Regolamento UE 1169/2011](https://eur-lex.europa.eu/eli/reg/2011/1169/oj/ita).
- [Codice del consumo, D.lgs. 206/2005](https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-09-06;206).

Confrontare i testi consolidati e le eventuali modifiche alla data di apertura con il responsabile competente.
