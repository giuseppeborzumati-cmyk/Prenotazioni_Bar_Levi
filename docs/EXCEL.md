# Catalogo e fabbisogno

Scarica `public/modello_catalogo.xlsx` oppure usa “Scarica modello” nel pannello bar. I dati sono esempi da sostituire e convalidare. Il foglio Guida spiega i campi.

| Foglio      | Una riga rappresenta                  | Campi principali                                                                                   |
| ----------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Prodotti    | Un articolo vendibile                 | Codice, nome, categoria, descrizione, prezzo in euro, limite giornaliero, attivo, tracce, immagine |
| Ingredienti | Un componente o articolo confezionato | Codice, nome, unità, giacenza, scorta minima, quantità per confezione, allergeni, vegano           |
| Ricette     | Un componente della singola porzione  | Codice prodotto, codice ingrediente, quantità                                                      |

Esempio: una Caprese richiede una rosetta, 50 g di provola e 50 g di pomodoro. Venti prenotazioni richiedono 20 rosette, 1.000 g di provola e 1.000 g di pomodoro. Con 300 g di provola in giacenza e confezioni da 500 g, il fabbisogno mancante è 700 g e l’acquisto proposto è 1.000 g.

Le bevande confezionate sono prodotti con una ricetta da un pezzo. Il catalogo iniziale non comprende acqua, come richiesto.

## Convalida

Formato `.xlsx`, massimo 1 MB; espansione ZIP massima 12 MB e 150 file; 200 prodotti, 500 ingredienti, 500 righe ricette. Intestazioni esatte e codici univoci. Prezzi numerici positivi, quantità positive, unità `g`, `ml`, `pz`; flag `SI`/`NO`. Niente formule, macro o collegamenti esterni. Più allergeni separati da punto e virgola.

Il parser accetta soltanto la lista dei 14 gruppi di allergeni prevista dal modello. Tutti gli allergeni dei componenti di un ingrediente composto devono essere dichiarati dal gestore. Il software non deduce da solo la composizione commerciale di pane, salse, dolci o bevande. `Vegano` deriva dagli ingredienti dichiarati vegani; non certifica assenza di allergeni o contaminazioni.

L’importazione mostra un’anteprima e richiede conferma. Sostituisce il catalogo corrente, aumentando la versione. Gli ordini registrati mantengono prezzi e ricette originali. Nel servizio reale gli ingredienti già esistenti e le loro unità non possono essere eliminati/cambiati, perché servono allo storico; rendere inattivi i prodotti da ritirare.

Il limite giornaliero di un prodotto è il numero vendibile; è indipendente dalla giacenza degli ingredienti. Il fabbisogno è una lista per approvvigionamento, non una previsione automatica di vendibilità basata sul magazzino.

## Uso quotidiano

Prima del servizio registra le giacenze iniziali del giorno, scegli la data e controlla quantità e confezioni da comprare. Le prenotazioni annullate sono escluse; quelle già consegnate rimangono nel fabbisogno lordo giornaliero. Registra separatamente vendite al banco, scarti e acquisti. Per confronti storici conserva l’export giornaliero delle scorte, perché la giacenza di riferimento corrente non è un archivio di magazzino per data.

Le fotografie selezionabili sono illustrative e ospitate localmente. Per nuove foto sostituire/aggiungere file e aggiornare la lista consentita nel codice, dopo verifica dei diritti di utilizzo.
