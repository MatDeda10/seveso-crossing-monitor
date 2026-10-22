/* ============================================================================
 * ORARIO TEORICO (RIPIEGO)
 * ---------------------------------------------------------------------------
 * Legge i file in `public/schedule/` generati da `npm run schedule:update`.
 *
 * Servono a far funzionare il monitor anche quando il proxy non e' configurato
 * o la rete non risponde: in quel caso l'app mostra le chiusure previste
 * DALL'ORARIO, senza i ritardi in tempo reale, e lo dichiara chiaramente
 * all'utente. E' un degrado trasparente, non un finto "tutto aperto".
 * ========================================================================== */

/** Festivita' a data fissa (MM-DD). */
const FIXED_HOLIDAYS = new Set([
  '01-01',
  '01-06',
  '04-25',
  '05-01',
  '06-02',
  '08-15',
  '11-01',
  '12-08',
  '12-25',
  '12-26',
]);

/** Lunedi' dell'Angelo (data variabile): da aggiornare di anno in anno. */
const EASTER_MONDAYS = new Set(['2026-04-06', '2027-03-29', '2028-04-17']);

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * Tipo di servizio per una data: `feriale`, `sabato` o `festivo`.
 * @param {Date} date
 */
export const scheduleKindFor = (date = new Date()) => {
  const iso = isoDate(date);
  const monthDay = iso.slice(5);

  if (EASTER_MONDAYS.has(iso) || FIXED_HOLIDAYS.has(monthDay)) return 'festivo';

  const day = date.getDay();
  if (day === 0) return 'festivo';
  if (day === 6) return 'sabato';
  return 'feriale';
};

/** "HH:MM" -> minuti dalla mezzanotte. */
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

/**
 * Converte un orario del giorno in un timestamp vicino a `referenceTs`.
 * Serve per gli orari a cavallo della mezzanotte: se un treno parte alle
 * 00:00 ma e' arrivato alle 23:58, la partenza appartiene al giorno dopo.
 */
const nearestOccurrence = (minutes, referenceTs) => {
  if (minutes === null) return null;

  const reference = new Date(referenceTs);
  const candidate = new Date(reference);
  candidate.setHours(0, 0, 0, 0);
  candidate.setMinutes(minutes);

  const HALF_DAY = 12 * 60 * 60 * 1000;
  let ts = candidate.getTime();

  while (ts - referenceTs > HALF_DAY) ts -= 24 * 60 * 60 * 1000;
  while (referenceTs - ts > HALF_DAY) ts += 24 * 60 * 60 * 1000;

  return ts;
};

/**
 * Converte l'orario teorico nei record grezzi attesi dall'engine.
 * Ogni riga viene emessa come record "arrivo" e/o "partenza": l'engine li
 * riunira' per numero di treno, esattamente come per i dati dal vivo.
 *
 * @param {object} payload contenuto di `public/schedule/<kind>.json`
 * @param {number} nowMs
 */
export const timetableToRecords = (payload, nowMs = Date.now()) => {
  const arrivals = [];
  const departures = [];

  for (const row of payload?.trains ?? []) {
    const arrivalTs = nearestOccurrence(toMinutes(row.a), nowMs);
    const departureTs = nearestOccurrence(toMinutes(row.p), arrivalTs ?? nowMs);

    const base = {
      numeroTreno: row.n,
      categoria: row.c,
      origine: row.o ?? null,
      destinazione: row.d ?? null,
      ritardo: 0,
      provvedimento: 0,
    };

    if (arrivalTs !== null) {
      arrivals.push({ ...base, orarioArrivo: arrivalTs, orarioPartenza: null });
    }
    if (departureTs !== null) {
      departures.push({ ...base, orarioArrivo: null, orarioPartenza: departureTs });
    }
  }

  return { arrivals, departures };
};

let cache = { kind: null, payload: null };

/**
 * Carica l'orario teorico del tipo di servizio di oggi.
 * @returns {Promise<{kind: string, arrivals: object[], departures: object[]}|null>}
 */
export const loadTimetable = async ({ nowMs = Date.now() } = {}) => {
  const kind = scheduleKindFor(new Date(nowMs));

  try {
    if (cache.kind !== kind) {
      const base = import.meta.env?.BASE_URL ?? '/';
      const response = await fetch(`${base}schedule/${kind}.json`, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      cache = { kind, payload: await response.json() };
    }

    const { arrivals, departures } = timetableToRecords(cache.payload, nowMs);
    return { kind, arrivals, departures };
  } catch {
    return null;
  }
};
