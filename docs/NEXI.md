# Nexi: collegamento protetto

**Al momento disabilitato.** Il codice comprende un adapter XPay Hosted Payment Page, ma non è stato collaudato con credenziali Nexi dell’esercente. Non è un collegamento automatico al POS fisico.

Chiedere al gestore nome e versione del servizio, contratto ecommerce attivo, disponibilità XPay HPP API e condizioni economiche. Pay-by-Link, POS fisico e XPay non sono intercambiabili. Commissioni e canoni dipendono dal contratto: il progetto non può renderli gratuiti.

## Flusso

1. Il Worker crea la prenotazione con importo calcolato dal catalogo e stato pagamento `pending`.
2. Solo il server chiama `POST /orders/hpp`. L’identificativo univoco dell’ordine è di 18 caratteri. Viene richiesto `NO_RECURRING` e incasso implicito.
3. Il browser apre la pagina HTTPS di Nexi. Il sito non riceve numero carta o CVV e non crea un contratto per addebiti futuri.
4. Il webhook confronta il `securityToken` privato della sessione. Il server consulta comunque `GET /orders/{orderId}`, controllando identificativo, valuta e importo contabilizzato.
5. Solo l’esito verificato aggiorna l’ordine. Anche il pulsante “Verifica Nexi” e il rientro dalla pagina del provider chiamano questa verifica. I parametri del browser non sono prova di pagamento.

Un pagamento tardivo su un ordine annullato produce `refund_required` e non riattiva la preparazione. Le notifiche ripetute non duplicano il pagamento. Un timeout durante l’apertura della sessione mantiene bloccato il tentativo: non viene avviato alla cieca un secondo addebito. Il gestore deve riconciliare dal portale.

## Attivazione sandbox

Prima configurare tutto il servizio Firebase/Worker. Poi aggiungere il secret riservato:

```bash
npx wrangler secret put NEXI_API_KEY
```

In `wrangler.toml`, dopo aver ricevuto credenziali di test autorizzate:

```toml
NEXI_ENABLED = "true"
NEXI_ENV = "sandbox"
PUBLIC_API_URL = "https://URL-REALE-DEL-WORKER.workers.dev"
```

Pubblicare il Worker. I domini Nexi accettati dall’adapter sono `xpaysandbox.nexigroup.com` e `xpay.nexigroup.com`. Se il contratto restituisce un dominio diverso, verificarlo nella documentazione del proprio terminale prima di aggiornare la lista; non consentire tutti i redirect.

Gli endpoint sono HTTPS; il webhook è `/webhooks/nexi`. Il frontend deve gestire le riscritture verso `index.html` per `/payment-return` e `/payment-cancel`, già previste in Firebase Hosting. Le carte di prova provengono dall’area test ufficiale Nexi, non dal titolare.

## Prove necessarie prima di incassi reali

Verificare successo, rifiuto, abbandono, autenticazione 3DS, timeout, doppio clic, notifica duplicata, notifica mancante, importo alterato, ordine annullato prima dell’esito e rimborso. Confrontare sempre i risultati con il back office Nexi. Per ogni casistica conservare il verbale di prova senza numeri di carta o token.

I rimborsi Nexi si eseguono nel back office del provider. Dopo il rimborso usare “Verifica Nexi”; gli importi parziali/incoerenti rimangono da verificare. Non è implementato un pulsante che disponga automaticamente un rimborso monetario. Il rimborso al banco viene invece registrato dall’operatore dopo la restituzione effettiva.

Le prenotazioni in attesa di pagamento **non scadono automaticamente** in questa versione: il bar deve verificarle e annullare quelle abbandonate. La preparazione di un ordine Nexi è bloccata finché il pagamento non risulta incassato. Non marcare come pagata una transazione soltanto autorizzata.

Solo dopo il collaudo del contratto effettivo sostituire il secret con la chiave di produzione e `NEXI_ENV = "production"`. Non attivare la produzione per provare il software.

Fonti ufficiali: [Hosted Payment Page API](https://developer.nexi.it/it/api/post-orders-hpp), [notifica](https://developer.nexi.it/it/api/notifica), [verifica ordine](https://developer.nexi.it/it/api/get-orders-orderId), [Pay-by-Link Nexi](https://www.nexi.it/it/pos/pay-by-link).
