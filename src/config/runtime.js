/**
 * Parametri operativi: stazione, rete, cache e persistenza locale.
 * Quello che prima era hardcoded dentro App.jsx (S01925, 30s, 95s, ...).
 */

const env = import.meta.env ?? {};

export const VIAGGIATRENO_BASE = 'https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno';

/** Timeout per singolo tentativo di rete (esposto anche in `RUNTIME`). */
const RUNTIME_TIMEOUT_MS = 8_000;

/** Timeout ridotto per i ripieghi pubblici, spesso spenti o in rate limit. */
const PUBLIC_FALLBACK_TIMEOUT_MS = 3_000;

/**
 * Template del proxy configurato dall'utente.
 * Accetta sia l'URL base (`https://proxy.example.workers.dev`) sia il template
 * completo (`https://proxy.example.workers.dev/?url={url}`), cosi' un `.env`
 * compilato in uno dei due modi non rompe silenziosamente le richieste.
 */
const proxyTemplate = (() => {
  const raw = String(env.VITE_PROXY_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!raw) return null;
  return raw.includes('{url}') ? raw : `${raw}/?url={url}`;
})();

/**
 * `true` se l'utente ha configurato un proxy proprio.
 *
 * Serve alla UI: senza proxy l'app puo' contare solo sui ripieghi pubblici
 * (inaffidabili) e sull'orario teorico, quindi conviene dire chiaramente
 * cosa manca invece di sembrare semplicemente rotta.
 */
export const hasConfiguredProxy = Boolean(proxyTemplate);

/**
 * Proxy, provati in ordine. Il primo e' il tuo Worker (affidabile),
 * gli altri sono ripieghi pubblici che oggi funzionano in modo intermittente:
 * servono solo a non lasciare l'app completamente cieca se il Worker e' giu'.
 * Il segnaposto `{url}` viene sostituito con l'URL Viaggiatreno codificato.
 *
 * `timeoutMs` e' piu' basso per i ripieghi pubblici: quando sono morti
 * (spesso) conviene arrivare subito all'orario teorico invece di tenere la
 * pagina vuota per otto secondi per ogni tentativo.
 */
export const TRANSPORT_TEMPLATES = Object.freeze(
  [
    proxyTemplate ? { id: 'worker', template: proxyTemplate, timeoutMs: RUNTIME_TIMEOUT_MS } : null,
    {
      id: 'allorigins',
      template: 'https://api.allorigins.win/raw?url={url}',
      timeoutMs: PUBLIC_FALLBACK_TIMEOUT_MS,
    },
    {
      id: 'codetabs',
      template: 'https://api.codetabs.com/v1/proxy?quest={url}',
      timeoutMs: PUBLIC_FALLBACK_TIMEOUT_MS,
    },
  ].filter(Boolean),
);

export const RUNTIME = Object.freeze({
  stationCode: env.VITE_STATION_CODE || 'S01925',
  stationName: 'Seveso',

  /** Intervallo di aggiornamento dati. */
  pollIntervalMs: 30_000,
  /** Non rifare richieste se l'ultima e' piu' recente di cosi'. */
  minRefetchIntervalMs: 12_000,
  /** Timeout per singolo tentativo di rete. */
  requestTimeoutMs: RUNTIME_TIMEOUT_MS,

  /** Chiavi di persistenza locale. */
  storageKeys: {
    lastData: 'seveso-monitor:last-data:v1',
    logs: 'seveso-monitor:logs:v1',
    showPassed: 'seveso-monitor:show-passed:v1',
  },

  maxLogEntries: 80,
});
