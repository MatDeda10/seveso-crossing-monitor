/**
 * Parametri operativi: stazione, rete, cache e persistenza locale.
 * Quello che prima era hardcoded dentro App.jsx (S01925, 30s, 95s, ...).
 */

const env = import.meta.env ?? {};

export const VIAGGIATRENO_BASE = 'https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno';

/** Timeout per singolo tentativo di rete. */
const RUNTIME_TIMEOUT_MS = 8_000;

/** Timeout per i proxy pubblici: se sono lenti, meglio passare al successivo. */
const PUBLIC_PROXY_TIMEOUT_MS = 9_000;

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

/** `true` se l'utente ha configurato un proxy proprio. */
export const hasConfiguredProxy = Boolean(proxyTemplate);

/**
 * Proxy pubblici gratuiti (nessun account richiesto), provati in parallelo.
 *
 * Sono servizi di terze parti: possono sparire o mettere in rate limit. Per
 * questo il primo della lista e' sempre il proxy dedicato (Worker, se
 * configurato) e gli altri vengono interrogati contemporaneamente: vince il
 * primo che risponde con un JSON valido. Con un Worker attivo gli altri non
 * vengono nemmeno contattati (vedi `viaggiatreno.js`).
 */
export const TRANSPORT_TEMPLATES = Object.freeze(
  [
    proxyTemplate ? { id: 'worker', template: proxyTemplate, timeoutMs: RUNTIME_TIMEOUT_MS, fallbackOnly: false } : null,
    {
      id: 'allorigins',
      template: 'https://api.allorigins.win/raw?url={url}',
      timeoutMs: PUBLIC_PROXY_TIMEOUT_MS,
      fallbackOnly: true,
    },
    {
      id: 'codetabs',
      template: 'https://api.codetabs.com/v1/proxy?quest={url}',
      timeoutMs: PUBLIC_PROXY_TIMEOUT_MS,
      fallbackOnly: true,
    },
    {
      id: 'corsproxy',
      template: 'https://corsproxy.io/?url={url}',
      timeoutMs: PUBLIC_PROXY_TIMEOUT_MS,
      fallbackOnly: true,
    },
    {
      id: 'corslol',
      template: 'https://api.cors.lol/?url={url}',
      timeoutMs: PUBLIC_PROXY_TIMEOUT_MS,
      fallbackOnly: true,
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
