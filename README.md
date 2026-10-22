# Seveso PL Monitor

Monitor (non ufficiale) dello stato dei passaggi a livello di **Seveso**, costruito
incrociando gli orari e i ritardi pubblicati da **Viaggiatreno** con i tempi medi di
chiusura degli impianti.

> ## ⚠️ Non è un dispositivo di sicurezza
> Le informazioni mostrate sono **stime**. Un guasto, un treno merci, una manovra o un
> errore nei dati pubblicati possono renderle sbagliate. Non sostituisce barriere,
> segnaletica e codice della strada. In caso di dubbio: fermati.

## Cosa fa

Tre viste:

- **Passaggi** — un semaforo per ogni passaggio a livello, raggruppati per lato della
  stazione (Cesano Maderno / Meda), con stato, motivo, countdown e intervallo stimato.
- **Treni** — i treni in arrivo/transito con categoria, destinazione, ritardo, ramo
  della linea e attendibilità dell'orario.
- **Log** — diagnostica: stato dei dati, transport usato, conteggi, eventi. Esportabile
  in JSON (utile per tarare i tempi dei PL, vedi sotto).

Stati possibili di un passaggio a livello:

| Stato | Colore | Significato |
| --- | --- | --- |
| `APERTO` | verde | Nessun transito imminente secondo i dati disponibili |
| `PREALLERTA` | blu | Un treno è atteso entro ~3 minuti |
| `IN CHIUSURA` | giallo | Le barriere stanno scendendo |
| `CHIUSO` | rosso | Barriere chiuse, transito in corso |
| `INCERTO` | grigio | Dati ricevuti ma inutilizzabili (es. nessun treno) |
| `OFFLINE` | grigio | Dati assenti o troppo vecchi |

### Quando i dati in tempo reale non arrivano

L'app non finge mai di essere aggiornata. In ordine di qualità decrescente usa:

| Origine | Cosa mostra | Come lo dichiara |
| --- | --- | --- |
| `network` | Dati live di Viaggiatreno | Pallino verde + "Aggiornato Ns fa" |
| `cache` | Ultimo dato salvato (< 2,5 min) | Pallino giallo + "cache" accanto all'ora |
| `timetable` | Orario ufficiale incluso nel sito | Pallino giallo + attendibilità ridotta |
| — | Niente | Tutti i PL in `OFFLINE` (grigio), mai "aperto" |

Il ripiego sull'**orario teorico** (`public/schedule/*.json`, generato da
`npm run schedule:update`) serve perché GitHub Pages è statico e non può fare da
proxy: senza un proxy raggiungibile il sito mostrerebbe altrimenti solo
`OFFLINE`. In quel caso la griglia dei passaggi è quella ufficiale, ma **i
ritardi del giorno non sono inclusi**: l'attendibilità scende e lo stato
generale diventa "chiusure stimate". La scelta è comunicata dal pallino
giallo/rosso nell'header e dal conteggio, senza banner aggiuntivi.

## Come funziona

```
Viaggiatreno (partenze + arrivi)
        │  proxy CORS con cache
        ▼
services/viaggiatreno.js        struttura nota, timeout, fallback, cache locale
        ▼
engine/predictionEngine.js      PURO e testabile
   buildTrains()                unisce arrivo+partenza per numeroTreno,
                                deduce direzione (NORD/SUD) e ramo (S2/S4)
   estimateCrossingTs()         orario al passaggio a livello = orario in stazione
                                ± tempo di percorrenza stimato
   mergeIntervals()             fonde le chiusure ravvicinate
        ▼
UI                              intervallo di chiusura + attendibilità
```

Il modello usa, per ogni PL, tre tempi configurabili in
`src/config/topology.js`: `closureLeadSec` (anticipo di chiusura),
`fullClosureSec` (barriere completamente chiuse) e `reopenBufferSec` (sicurezza
in riapertura). Nessuno di questi è oggi misurato: sono stime iniziali.

L'incertezza viene sempre mostrata come **intervallo** (`12:34–12:37`), non come
istante esatto, e l'`%` di attendibilità è una sintesi esplicita dei fattori che
degradano la stima (dati vecchi, ritardo alto, PL lontano, percorso non
determinato) — non una probabilità statistica.

## Avvio rapido

```bash
npm install
npm run dev:all
```

`dev:all` avvia **insieme** il proxy CORS locale e il server di sviluppo,
impostando da sé la variabile `VITE_PROXY_URL`: non serve creare nessun file
`.env`. Il proxy è indispensabile per i **dati in tempo reale**, perché
Viaggiatreno non invia header CORS e senza di esso il browser non può leggere le
risposte. Se lanci `npm run dev` da solo l'app resta utilizzabile in **orario
teorico** (vedi sotto), ma senza ritardi.

Se preferisci due terminali separati:

```bash
npm run dev:proxy   # terminale 1
npm run dev         # terminale 2
```

e in `.env.local` (vedi `.env.example`):

```
VITE_PROXY_URL=http://localhost:8787/?url={url}
```

> Nota: `.env.local` viene letto anche da `npm run build`, quindi non
> dimenticarlo attivo se poi pubblichi la build a mano. Il deploy automatico su
> GitHub Actions non è toccato (usa il secret del repository).

## Mettere online il proxy (consigliato per i dati in tempo reale)

GitHub Pages serve solo file statici e non può fare da proxy: Viaggiatreno non
invia header CORS, quindi il browser non può leggere le risposte dirette.

L'app però **non richiede configurazione**: interroga in parallelo alcuni proxy
pubblici gratuiti (`api.allorigins.win`, `api.codetabs.com`, `corsproxy.io`,
`api.cors.lol`) e usa il primo che risponde con un JSON valido. Se nessuno
risponde entro 9 secondi passa all'ultimo dato salvato e poi all'orario
ufficiale. Poiché sono servizi di terze parti possono essere lenti o andare in
rate limit: per un funzionamento stabile conviene un proxy proprio, sempre
gratuito, con il Worker in `workers/viaggiatreno-proxy.js` (Cloudflare, piano
free senza carta di credito).

Con `VITE_PROXY_URL` impostato il Worker diventa l'unico transport interrogato:
i ripieghi pubblici restano spenti finché risponde.

### Via A — deploy automatico da GitHub Actions (consigliata)

Una volta sola, dal repository:

1. crea un token Cloudflare con permesso **Workers Scripts: Edit** →
   <https://dash.cloudflare.com/profile/api-tokens>
2. **Settings → Secrets and variables → Actions → Secrets**: aggiungi
   `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`
3. **Settings → Secrets and variables → Actions → Variables**: crea
   `WORKER_DEPLOY` = `true`
4. esegui il workflow *Deploy proxy* (Actions → Deploy proxy → Run workflow):
   nel riepilogo del job trovi l'URL pubblico del Worker
5. copia quell'URL nel secret `VITE_PROXY_URL` e ripubblica il sito

Da qui in avanti il Worker si ripubblica da solo a ogni modifica di `workers/`.

### Via B — deploy manuale

1. <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Worker**
2. incolla il contenuto di `workers/viaggiatreno-proxy.js` → **Deploy**
3. copia l'URL, es. `https://viaggiatreno-proxy.<tuonome>.workers.dev`
4. impostalo in `.env` (locale) e come **secret `VITE_PROXY_URL`** del repository

Il Worker limita gli inoltri al solo host `www.viaggiatreno.it` (non è un open
proxy) e applica una cache di 20 secondi.

## Comandi

| Comando | Effetto |
| --- | --- |
| `npm run dev:all` | **Consigliato**: proxy CORS locale + server di sviluppo |
| `npm run dev` | Solo server di sviluppo |
| `npm run dev:proxy` | Solo proxy CORS locale |
| `npm run build` | Build di produzione in `dist/` |
| `npm run preview` | Anteprima della build |
| `npm run lint` | ESLint |
| `npm run test` | Test dell'engine (Vitest) |
| `npm run schedule:update` | Rigenera l'orario teorico in `public/schedule/` |
| `npm run format` | Prettier |
| `npm run deploy` | Deploy su GitHub Pages (metodo `gh-pages`) |

> `schedule:update` interroga Viaggiatreno direttamente (senza proxy: non c'è
> browser di mezzo) per le 24 ore del prossimo lunedì, sabato e domenica. Serve
> solo a rigenerare i file di ripiego quando cambia l'orario ferroviario
> (di solito poche volte l'anno).

Il workflow `.github/workflows/ci.yml` esegue **lint + test + build** a ogni push
e pull request: è il controllo che tiene in piedi il progetto, non tocca il tuo
deploy. Il workflow `deploy-worker.yml`, opzionale, ripubblica il proxy (vedi
sopra).

La pubblicazione su GitHub Pages resta quella di prima (`npm run deploy`, branch
`gh-pages`) e **non richiede nessuna modifica alle impostazioni del repository**.

Se in futuro vuoi passare al deploy automatico da GitHub Actions:

1. **Settings → Pages → Source**: seleziona **GitHub Actions**
2. **Settings → Secrets and variables → Actions → Variables**: crea la variabile
   `PAGES_VIA_ACTIONS` = `true`
3. In **Settings → Secrets and variables → Actions → Secrets**: crea
   `VITE_PROXY_URL` con l'URL del tuo Worker

Il job di deploy nel workflow è disattivato finché `PAGES_VIA_ACTIONS` non esiste,
proprio per non far fallire la CI su un repository configurato con `gh-pages`.

## Struttura

```
src/
  config/
    topology.js     PL, rami, categorie di treno, lati della stazione
    windows.js      TUTTE le soglie temporali (unica fonte di verità)
    runtime.js      stazione, intervalli di polling, timeout, chiavi di storage
  engine/
    predictionEngine.js        modello puro (nessun Date.now() nascosto)
    predictionEngine.test.js   test sui casi che prima erano sbagliati
  services/
    viaggiatreno.js            rete, proxy, cache, resilienza
    schedule.js                orario teorico di ripiego
    schedule.test.js           selezione del tipo di servizio e conversione orari
  hooks/                       useClock, useTrainData, useLogs
  components/                  CrossingCard, TrainCard, Disclaimer
  utils/timeFormat.js          formattazione e giudizi di stato
public/schedule/               orario teorico (feriale/sabato/festivo)
workers/viaggiatreno-proxy.js  proxy CORS per la produzione
wrangler.toml                  configurazione del Worker
tools/dev-proxy.mjs            proxy CORS per lo sviluppo
tools/dev-all.mjs              avvia proxy + Vite con un solo comando
tools/build-schedule.mjs       rigenera l'orario teorico
```

## Calibrazione dei tempi (come migliorare davvero le stime)

`closureLeadSec`, `fullClosureSec` e `reopenBufferSec` determinano la qualità
delle previsioni e oggi sono stime a occhio. Per tararli serve un confronto fra
previsione e realtà:

1. usa la vista **Log → Esporta** e conserva l'export JSON;
2. quando possibile, annota l'orario reale di chiusura/riapertura di un PL
   (basta guardare il passaggio a livello);
3. confronta con `windowFrom`/`windowTo` della previsione.

Con qualche decina di osservazioni si può stimare il tempo medio di ciascun PL e
aggiornare i valori in `src/config/topology.js`. Un pulsante "è chiuso adesso"
in app renderebbe la raccolta molto più rapida: è il prossimo passo naturale.

## Limiti noti

- Le previsioni si basano su orari e ritardi, non sulla posizione reale dei treni.
  Un upgrade possibile è l'endpoint `andamentoTreno`, che fornisce l'ultimo
  rilevamento reale del treno.
- I treni il cui percorso non è determinabile (né ramo né destinazione noti)
  vengono inclusi in modo prudente su tutti i PL del ramo, con attendibilità
  ridotta e badge "percorso non determinato": è preferibile una falsa chiusura a
  un falso "aperto".
- Se l'API risponde con **zero treni** l'app mostra `INCERTO`, non "aperto".
- L'**orario teorico** non conosce i ritardi e usa tre soli profili di servizio
  (feriale / sabato / festivo): nei giorni festivi infrasettimanali riconosce le
  principali ricorrenze italiane, ma non le chiusure straordinarie o gli scioperi.
- L'API di Viaggiatreno è non ufficiale e può cambiare senza preavviso.

## Licenza

MIT — vedi [LICENSE](LICENSE). Include l'avviso che il software mostra stime e
non è un dispositivo di sicurezza.
