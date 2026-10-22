/* ============================================================================
 * LIVELLO DI RETE — Viaggiatreno attraverso il proxy
 * ---------------------------------------------------------------------------
 * Responsabilita':
 *  - costruire l'URL con la data nel formato richiesto da Viaggiatreno;
 *  - usare il primo transport che funziona (con timeout);
 *  - non perdere i dati se una delle due chiamate fallisce;
 *  - conservare l'ultimo dato buono in localStorage (resilienza offline).
 * ========================================================================== */

import { RUNTIME, TRANSPORT_TEMPLATES, VIAGGIATRENO_BASE } from '../config/runtime';
import { WINDOWS } from '../config/windows';
import { loadTimetable } from './schedule';

const GIORNI = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MESI = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n) => String(n).padStart(2, '0');

/**
 * Viaggiatreno pretende il formato "Fri Oct 16 2026 12:30:00 GMT+0200".
 * Il codice precedente usava `new Date().toString().split(' (')[0]`, che
 * dipende dalla locale del browser: qui la stringa viene costruita a mano.
 */
export const formatRequestDate = (date = new Date()) => {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const gmt = `GMT${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;

  return (
    `${GIORNI[date.getDay()]} ${MESI[date.getMonth()]} ${pad(date.getDate())} ` +
    `${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${gmt}`
  );
};

/** URL dell'endpoint `partenze`/`arrivi` per la stazione configurata. */
export const buildUpstreamUrl = (type, date = new Date()) =>
  `${VIAGGIATRENO_BASE}/${type}/${RUNTIME.stationCode}/${encodeURIComponent(formatRequestDate(date))}`;

const buildTransportUrl = (template, upstreamUrl) =>
  template.replace('{url}', encodeURIComponent(upstreamUrl));

/**
 * GET + parse con timeout. Rifiuta se la risposta non e' un array JSON:
 * un proxy che restituisce HTML di errore con status 200 non deve
 * trasformarsi in "nessun treno" (bug storico dell'app).
 */
const requestArray = async (url, timeoutMs = RUNTIME.requestTimeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    if (!text.trim()) throw new Error('Risposta vuota');
    if (text.trimStart().startsWith('<')) throw new Error('Risposta non JSON (probabile HTML di errore)');

    const json = JSON.parse(text);
    if (!Array.isArray(json)) throw new Error('Formato inatteso: atteso un array');
    return json;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Interroga i transport in parallelo e restituisce il primo che risponde con
 * un JSON valido.
 *
 * La versione precedente li provava in sequenza: se il primo proxy pubblico
 * era lento, ogni aggiornamento perdeva fino a 8 secondi prima di arrivare a
 * quello funzionante. Con i ripieghi pubblici (spesso lenti o a rate limit)
 * questo rendeva l'app inutilizzabile proprio quando serviva.
 */
const raceTransports = async (transports, upstreamUrl) => {
  const errors = [];

  const attempts = transports.map((transport) =>
    requestArray(
      buildTransportUrl(transport.template, upstreamUrl),
      transport.timeoutMs ?? RUNTIME.requestTimeoutMs,
    )
      .then((data) => ({ data, transport: transport.id }))
      .catch((error) => {
        errors.push(`${transport.id}: ${error.message}`);
        throw error;
      }),
  );

  if (attempts.length === 0) throw new Error('Nessun transport configurato');

  try {
    return await Promise.any(attempts);
  } catch {
    throw new Error([...new Set(errors)].join(' | ') || 'Nessun transport disponibile');
  }
};

/**
 * Prova il proxy dedicato (se configurato) e, solo se fallisce, i ripieghi
 * pubblici. Cosi' chi ha un Worker non paga il costo delle chiamate inutili.
 */
const fetchThroughProxies = async (upstreamUrl) => {
  const dedicated = TRANSPORT_TEMPLATES.filter((transport) => !transport.fallbackOnly);
  const fallbacks = TRANSPORT_TEMPLATES.filter((transport) => transport.fallbackOnly);

  if (dedicated.length > 0) {
    try {
      return await raceTransports(dedicated, upstreamUrl);
    } catch {
      /* il proxy dedicato non risponde: si passa ai ripieghi pubblici */
    }
  }

  return raceTransports(fallbacks, upstreamUrl);
};

const readCache = () => {
  try {
    const raw = localStorage.getItem(RUNTIME.storageKeys.lastData);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeCache = (payload) => {
  try {
    localStorage.setItem(RUNTIME.storageKeys.lastData, JSON.stringify(payload));
  } catch {
    /* quota o storage disabilitato: non e' un errore fatale */
  }
};

/**
 * Scarica arrivi e partenze.
 *
 * Ordine di ripiego quando la rete non risponde:
 *  1. ultimo dato salvato in localStorage (`cached`): resta utilizzabile
 *     finche' non supera `WINDOWS.staleHardMs`;
 *  2. orario teorico incluso nel sito (`timetable`): nessun ritardo, ma la
 *     griglia dei passaggi e' quella vera;
 *  3. `offline`.
 *
 * Il tipo di dato viene propagato all'engine, che degrada la stima in modo
 * proporzionale: non si mostra mai "tutto aperto" per un guasto di rete.
 *
 * @returns {Promise<{
 *   arrivals: object[], departures: object[],
 *   fetchedAt: number,
 *   source: 'network'|'cache'|'timetable'|'offline',
 *   transport: string|null,
 *   dataState: 'ok'|'partial'|'empty'|'cached'|'timetable'|'offline',
 *   error: string|null
 * }>}
 */
export const fetchTrainData = async ({ date = new Date(), nowMs = Date.now() } = {}) => {
  const [departures, arrivals] = await Promise.allSettled([
    fetchThroughProxies(buildUpstreamUrl('partenze', date)),
    fetchThroughProxies(buildUpstreamUrl('arrivi', date)),
  ]);

  const okDepartures = departures.status === 'fulfilled' ? departures.value : null;
  const okArrivals = arrivals.status === 'fulfilled' ? arrivals.value : null;

  const errors = [
    departures.status === 'rejected' ? `partenze -> ${departures.reason.message}` : null,
    arrivals.status === 'rejected' ? `arrivi -> ${arrivals.reason.message}` : null,
  ].filter(Boolean);

  const networkError = errors.join(' | ') || 'Rete non disponibile';

  if (!okDepartures && !okArrivals) {
    const cached = readCache();
    const cacheAgeMs = cached ? nowMs - (cached.fetchedAt ?? 0) : Number.POSITIVE_INFINITY;

    if (cached && cacheAgeMs <= WINDOWS.staleHardMs) {
      return {
        arrivals: cached.arrivals ?? [],
        departures: cached.departures ?? [],
        fetchedAt: cached.fetchedAt ?? 0,
        source: 'cache',
        transport: null,
        dataState: 'cached',
        error: networkError,
      };
    }

    // Ultima risorsa: l'orario teorico incluso nel sito. Meglio una griglia
    // senza ritardi (dichiarata come tale) che una schermata vuota.
    const timetable = await loadTimetable({ nowMs });
    if (timetable) {
      return {
        arrivals: timetable.arrivals,
        departures: timetable.departures,
        fetchedAt: nowMs,
        source: 'timetable',
        transport: null,
        dataState: 'timetable',
        error: networkError,
      };
    }

    return {
      arrivals: [],
      departures: [],
      fetchedAt: 0,
      source: 'offline',
      transport: null,
      dataState: 'offline',
      error: networkError,
    };
  }

  const payload = {
    arrivals: okArrivals?.data ?? [],
    departures: okDepartures?.data ?? [],
    fetchedAt: nowMs,
  };

  writeCache(payload);

  const total = payload.arrivals.length + payload.departures.length;
  const partial = !okArrivals || !okDepartures;

  return {
    ...payload,
    source: 'network',
    transport: okDepartures?.transport ?? okArrivals?.transport ?? null,
    dataState: total === 0 ? 'empty' : partial ? 'partial' : 'ok',
    error: errors.length ? errors.join(' | ') : null,
  };
};
