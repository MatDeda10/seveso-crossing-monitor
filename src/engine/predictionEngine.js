/* ============================================================================
 * PREDICTION ENGINE
 * ---------------------------------------------------------------------------
 * Tutto qui dentro e' PURO: nessuna chiamata di rete e nessun `Date.now()`
 * nascosto. L'istante corrente arriva sempre come parametro `nowMs`, quindi
 * l'intero modello e' verificabile con dei test (vedi predictionEngine.test.js).
 * ========================================================================== */

import {
  BRANCHES,
  CROSSINGS_CONFIG,
  SIDES,
  resolveCategoryConfig,
} from '../config/topology';
import { WINDOWS } from '../config/windows';

/** Parametri del modello fisico. Da tarare con osservazioni reali (README). */
export const MODEL_PARAMS = Object.freeze({
  /** Entro questo raggio dalla stazione il treno non e' a velocita' di crociera. */
  stationZoneRadiusMeters: 400,
  /** Fattore di riduzione della velocita' dentro la zona stazione. */
  stationZoneSpeedFactor: 0.55,
  /** Incertezza di base della stima, in secondi. */
  baseUncertaintySec: 12,
});

/** Codici `provvedimento` che indicano una corsa soppressa. */
const SUPPRESSED_PROVIDEDIMENTI = new Set([1, 2, 3]);
const SUPPRESSED_LABELS = new Set(['SOPPRESSO', 'CANCELLED', 'CANCELLED.']);

/* --- STAZIONI -------------------------------------------------------------
 * I nomi arrivano da Viaggiatreno come testo, quindi la classificazione e'
 * per sottostringa. I codici `codOrigine`/`codDestinazione` sarebbero piu'
 * solidi ma nelle risposte di `arrivi`/`partenze` sono spesso null.
 * ------------------------------------------------------------------------ */
const NORTH_STATIONS = [
  'ASSO',
  'ERBA',
  'CANZO',
  'MERONE',
  'MARIANO',
  'CAMNAGO',
  'LENTATE',
  'MEDA',
  'CABIATE',
  'INVERIGO',
  'LAMBRUGO',
];

const SOUTH_STATIONS = [
  'MILANO',
  'ROGOREDO',
  'CADORNA',
  'GARIBALDI',
  'AFFORI',
  'GRECO',
  'LAMBRATE',
  'PORTA',
  'BOVISA',
  'NIGUARDA',
  'SESTO',
  'MONZA',
  'CORMANO',
  'BRIANZOLA',
  'VAREDO',
  'CESANO',
  'BOVISIO',
  'PALAZZOLO',
];

/** Rami riconoscibili dal nome di una stazione. */
const BRANCH_STATIONS = [
  {
    branch: BRANCHES.ASSO,
    names: ['ASSO', 'ERBA', 'CANZO', 'MERONE', 'MARIANO', 'INVERIGO', 'LAMBRUGO'],
  },
  { branch: BRANCHES.CAMNAGO, names: ['CAMNAGO', 'LENTATE'] },
];

/** Stazioni sul tronco comune: se compare una di queste il ramo e' noto. */
const COMMON_STATIONS = ['MEDA', 'CABIATE', 'SEVESO'];

/**
 * Le linee suburbane di Trenord hanno un codice che coincide con la linea:
 * la S2 va verso Asso, la S4 verso Camnago-Lentate. Quando il nome della
 * stazione non basta, il codice categoria scioglie l'ambiguita'.
 */
const LINE_BRANCH_HINTS = [
  { branch: BRANCHES.ASSO, pattern: /^S2\b|^S2\d/ },
  { branch: BRANCHES.CAMNAGO, pattern: /^S4\b|^S4\d/ },
];

const normalizeStationName = (value) =>
  String(value ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const matchesAny = (name, list) => Boolean(name) && list.some((token) => name.includes(token));

const classifyStation = (name) => {
  if (matchesAny(name, NORTH_STATIONS)) return 'NORTH';
  if (matchesAny(name, SOUTH_STATIONS)) return 'SOUTH';
  return null;
};

/**
 * Direzione di marcia attraverso Seveso.
 *
 * La versione precedente controllava prima l'origine e ritornava 'SUD' come
 * default: un treno in arrivo da Milano veniva quindi classificato in
 * discesa, con un errore di minuti sulle chiusure stimate.
 */
export const inferDirection = (destination, origin) => {
  const dest = normalizeStationName(destination);
  const orig = normalizeStationName(origin);

  const destSide = classifyStation(dest);
  if (destSide === 'NORTH') return 'NORD';
  if (destSide === 'SOUTH') return 'SUD';

  const origSide = classifyStation(orig);
  if (origSide === 'NORTH') return 'SUD';
  if (origSide === 'SOUTH') return 'NORD';

  return 'UNKNOWN';
};

/**
 * Ramo della linea percorso dal treno.
 *
 * Guardare SOLO la destinazione era il bug piu' grave: nelle risposte
 * `arrivi` la destinazione e' sempre `null`, quindi ogni treno in arrivo
 * risultava sul tronco comune e non attivava mai i PL di Asso e Camnago.
 *
 * Ordine di priorita': nome di una stazione del ramo -> codice linea (S2/S4)
 * -> nome di una stazione del tronco -> non determinato.
 * Il caso "non determinato" viene comunque incluso in modo prudente
 * (vedi `affectsCrossing`), perche' un falso "aperto" e' il rischio peggiore.
 *
 * @param {string|null} destination
 * @param {string|null} origin
 * @param {string|null} [category] codice categoria Viaggiatreno (es. "S4")
 */
export const inferRouteBranch = (destination, origin, category) => {
  const candidates = [normalizeStationName(destination), normalizeStationName(origin)];

  for (const { branch, names } of BRANCH_STATIONS) {
    if (candidates.some((name) => matchesAny(name, names))) return branch;
  }

  const code = String(category ?? '').trim().toUpperCase();
  const hint = LINE_BRANCH_HINTS.find(({ pattern }) => pattern.test(code));
  if (hint) return hint.branch;

  if (candidates.some((name) => matchesAny(name, COMMON_STATIONS))) return BRANCHES.COMMON;

  return BRANCHES.UNKNOWN;
};

const isSuppressed = (raw) => {
  if (SUPPRESSED_PROVIDEDIMENTI.has(raw.provvedimento)) return true;
  const label = String(raw.statoTreno ?? raw.status ?? '').toUpperCase();
  return SUPPRESSED_LABELS.has(label);
};

const readTs = (value) => {
  const ts = Number(value);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
};

/* --- NORMALIZZAZIONE ------------------------------------------------------ */

/**
 * Costruisce l'elenco dei treni a partire dalle risposte grezze.
 *
 * Arrivi e partenze dello stesso `numeroTreno` sono lo STESSO treno che
 * transita (o sosta) a Seveso: prima venivano concatenati senza deduplica,
 * producendo chiavi React duplicate e due intervalli di chiusura per treno.
 *
 * @param {{arrivals?: object[], departures?: object[]}} input
 * @returns {{trains: object[], stats: object}}
 */
export const buildTrains = ({ arrivals = [], departures = [] } = {}) => {
  const byId = new Map();
  let suppressed = 0;
  let duplicatedRecords = 0;

  const collect = (raw, kind) => {
    const id = String(raw?.numeroTreno ?? '').trim();
    if (!id) return;

    const existing = byId.get(id);
    if (existing) duplicatedRecords += 1;

    const entry =
      existing ??
      {
        id,
        arrivalScheduledTs: null,
        departureScheduledTs: null,
        destination: null,
        origin: null,
        delay: 0,
        category: null,
        suppressed: false,
      };

    // Gli orari di Viaggiatreno sono PROGRAMMATI: il ritardo va sommato
    // dopo, quando e' noto il valore definitivo (e' il massimo fra i due record).
    if (kind === 'arrival') entry.arrivalScheduledTs = readTs(raw.orarioArrivo) ?? entry.arrivalScheduledTs;
    else entry.departureScheduledTs = readTs(raw.orarioPartenza) ?? entry.departureScheduledTs;

    entry.destination = entry.destination ?? raw.destinazione ?? null;
    entry.origin = entry.origin ?? raw.origine ?? null;
    entry.category = entry.category ?? raw.categoria ?? null;

    const rawDelay = Number(raw.ritardo);
    if (Number.isFinite(rawDelay)) entry.delay = Math.max(entry.delay, rawDelay);

    entry.suppressed = entry.suppressed || isSuppressed(raw);

    byId.set(id, entry);
  };

  arrivals.forEach((raw) => collect(raw, 'arrival'));
  departures.forEach((raw) => collect(raw, 'departure'));

  const trains = [];
  let withoutTime = 0;

  for (const entry of byId.values()) {
    if (entry.suppressed) {
      suppressed += 1;
      continue;
    }
    if (!entry.arrivalScheduledTs && !entry.departureScheduledTs) {
      withoutTime += 1;
      continue;
    }

    const delayMs = entry.delay * 60_000;
    const arrivalTs = entry.arrivalScheduledTs === null ? null : entry.arrivalScheduledTs + delayMs;
    const departureTs = entry.departureScheduledTs === null ? null : entry.departureScheduledTs + delayMs;

    const config = resolveCategoryConfig(entry.category);

    trains.push({
      id: entry.id,
      category: entry.category ?? 'N.D.',
      categoryLabel: config.label,
      destination: entry.destination,
      origin: entry.origin,
      direction: inferDirection(entry.destination, entry.origin),
      routeBranch: inferRouteBranch(entry.destination, entry.origin, entry.category),
      /** Orari attesi, ritardo incluso. */
      arrivalTs,
      departureTs,
      /** Orari da orario ufficiale, senza ritardo. */
      scheduledArrivalTs: entry.arrivalScheduledTs,
      scheduledDepartureTs: entry.departureScheduledTs,
      /** Istante in cui il treno e' a Seveso (arrivo, oppure transito). */
      stationTs: arrivalTs ?? departureTs,
      scheduledStationTs: entry.arrivalScheduledTs ?? entry.departureScheduledTs,
      delay: entry.delay,
      /** Il treno sosta a Seveso (occupa i PL piu' a lungo). */
      stopsAtStation: Boolean(arrivalTs && departureTs),
      config,
    });
  }

  trains.sort((a, b) => a.stationTs - b.stationTs);

  return {
    trains,
    stats: {
      records: arrivals.length + departures.length,
      unique: byId.size,
      usable: trains.length,
      suppressed,
      withoutTime,
      duplicatedRecords,
    },
  };
};

/* --- MODELLO DI TEMPO DI PERCORRENZA ------------------------------------- */

/** Tempo stimato (ms) per arrivare al PL dalla stazione, o viceversa. */
export const estimateTravelMs = (train, crossing) => {
  let speedKmh = train.config.avgSpeedKmh;

  if (crossing.distanceMeters < MODEL_PARAMS.stationZoneRadiusMeters) {
    speedKmh *= MODEL_PARAMS.stationZoneSpeedFactor;
  }

  const speedMs = (speedKmh * 1000) / 3600;
  if (speedMs <= 0) return 0;

  return ((crossing.distanceMeters / speedMs) / train.config.accelerationFactor) * 1000;
};

/** Incertezza (secondi) della stima di chiusura per questo treno e questo PL. */
export const computeUncertaintySec = (train, crossing) =>
  Math.min(
    WINDOWS.maxUncertaintySec,
    Math.round(
      MODEL_PARAMS.baseUncertaintySec +
        crossing.distanceMeters / 150 +
        Math.abs(train.delay) * 2 +
        (train.routeBranch === BRANCHES.UNKNOWN || train.direction === 'UNKNOWN' ? 15 : 0),
    ),
  );

/* --- INTERVALLI DI CHIUSURA --------------------------------------------- */

/**
 * Un treno incide sul PL se il PL e' sul tronco comune oppure se il treno
 * percorre quella diramazione. Le due diramazioni sono separate: non c'e'
 * inclusione fra Asso e Camnago.
 * Un ramo NON determinato viene incluso comunque: e' preferibile una falsa
 * chiusura a un falso "aperto".
 */
export const affectsCrossing = (crossing, train) => {
  if (crossing.branch === BRANCHES.COMMON) return true;
  if (train.routeBranch === BRANCHES.UNKNOWN) return true;
  return train.routeBranch === crossing.branch;
};

/** Istante in cui il treno raggiunge il PL, oppure null se non lo attraversa. */
export const estimateCrossingTs = (train, crossing) => {
  const travelMs = estimateTravelMs(train, crossing);
  const beforeStation = train.arrivalTs ?? train.departureTs;
  const afterStation = train.departureTs ?? train.arrivalTs;

  if (train.direction === 'NORD') {
    return crossing.side === SIDES.CESANO ? beforeStation - travelMs : afterStation + travelMs;
  }
  if (train.direction === 'SUD') {
    return crossing.side === SIDES.MEDA ? beforeStation - travelMs : afterStation + travelMs;
  }
  return null;
};

const buildIntervals = (crossing, trains) => {
  const intervals = [];

  for (const train of trains) {
    if (!affectsCrossing(crossing, train)) continue;

    const eventTs = estimateCrossingTs(train, crossing);
    if (eventTs === null) continue;

    const uncertaintyMs = computeUncertaintySec(train, crossing) * 1000;

    intervals.push({
      trainIds: [train.id],
      uncertain: train.routeBranch === BRANCHES.UNKNOWN || train.direction === 'UNKNOWN',
      delay: train.delay,
      eventTs,
      uncertaintyMs,
      // La finestra e' volutamente larga: la UI mostra un intervallo, non un istante.
      start: eventTs - crossing.closureLeadSec * 1000 - uncertaintyMs,
      likelyClosed: eventTs - crossing.fullClosureSec * 1000,
      end: eventTs + crossing.reopenBufferSec * 1000 + uncertaintyMs,
    });
  }

  return intervals;
};

/**
 * Fonde le chiusure ravvicinate in un'unica occupazione del PL.
 * La versione precedente mutava l'array di input e, fondendo due treni,
 * faceva `[...last.trainId]` su una STRINGA, spezzandola in caratteri
 * (il treno 1646 diventava "1 + 6 + 4 + 6").
 */
export const mergeIntervals = (intervals) => {
  if (intervals.length <= 1) return intervals.map((i) => ({ ...i, trainIds: [...i.trainIds] }));

  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [{ ...sorted[0], trainIds: [...sorted[0].trainIds] }];

  for (let i = 1; i < sorted.length; i += 1) {
    const last = merged[merged.length - 1];
    const current = sorted[i];

    if (current.start - last.end < WINDOWS.mergeGapMs) {
      last.start = Math.min(last.start, current.start);
      last.end = Math.max(last.end, current.end);
      last.likelyClosed = Math.min(last.likelyClosed, current.likelyClosed);
      last.uncertain = last.uncertain || current.uncertain;
      last.delay = Math.max(last.delay, current.delay);
      last.trainIds = [...new Set([...last.trainIds, ...current.trainIds])];
    } else {
      merged.push({ ...current, trainIds: [...current.trainIds] });
    }
  }

  return merged;
};

/* --- ATTENDIBILITA' ------------------------------------------------------ */

/**
 * Attendibilita' (0-100) della stima per questo PL.
 * Non e' una probabilita' statistica: e' una sintesi esplicita dei fattori
 * che degradano la stima, e i fattori sono elencati qui sotto.
 */
export const computeCrossingConfidence = ({
  syncAgeMs,
  delay,
  distanceMeters,
  trainCount,
  uncertain,
  staleHard,
  usingCached = false,
  theoryOnly = false,
}) => {
  let score = 100;

  if (syncAgeMs > WINDOWS.staleSoftMs) score -= 15;
  if (staleHard) score -= 20;
  if (Math.abs(delay) > 10) score -= 15;
  if (distanceMeters > 1500) score -= 10;
  if (trainCount > 1) score -= 8;
  if (uncertain) score -= 25;
  /** Dato ripreso dalla cache: la stima e' buona ma non fresca. */
  if (usingCached) score -= 15;
  /** Orario teorico: la griglia e' giusta, i ritardi del giorno no. */
  if (theoryOnly) score -= 30;

  return Math.max(20, Math.min(100, score));
};

/* --- ENGINE -------------------------------------------------------------- */

const staleResult = (
  crossing,
  { status, color, reason, syncAgeMs, confidence = 0, theoryOnly = false, usingCached = false },
) => ({
  ...crossing,
  status,
  color,
  reason,
  confidence,
  timerSec: null,
  closesInSec: null,
  windowFrom: null,
  windowTo: null,
  nextClosureInSec: null,
  nextTrainIds: [],
  nextWindowFrom: null,
  nextWindowTo: null,
  isUncertain: false,
  theoryOnly,
  usingCached,
  dataAgeSec: Math.round(syncAgeMs / 1000),
});

/**
 * Calcola lo stato di ogni passaggio a livello.
 *
 * @param {object} input
 * @param {object[]} input.trains treni normalizzati (vedi `buildTrains`)
 * @param {object[]} [input.crossings]
 * @param {number} input.nowMs
 * @param {number} [input.syncAgeMs] eta' dei dati in millisecondi
 * @param {'ok'|'partial'|'empty'|'cached'|'timetable'|'offline'} [input.dataState]
 */
export const predictCrossings = ({
  trains = [],
  crossings = CROSSINGS_CONFIG,
  nowMs,
  syncAgeMs = 0,
  dataState = 'ok',
}) => {
  const staleHard = syncAgeMs > WINDOWS.staleHardMs;
  /**
   * Orario teorico: la griglia dei treni e' quella ufficiale, ma i ritardi
   * non sono noti. E' un dato "vecchio" per natura, quindi non lo si degrada
   * con l'eta' (che sarebbe sempre 0) ma con un livello di attendibilita' piu'
   * basso e un avviso esplicito nella UI.
   */
  const theoryOnly = dataState === 'timetable';
  const usingCached = dataState === 'cached';

  const results = crossings.map((crossing) => {
    // 1. Dati non utilizzabili: mai mostrare "aperto" senza dati.
    if (dataState === 'offline') {
      return staleResult(crossing, {
        status: 'OFFLINE',
        color: 'gray',
        reason: 'Dati non disponibili',
        syncAgeMs,
      });
    }

    if (staleHard && !theoryOnly) {
      return staleResult(crossing, {
        status: 'OFFLINE',
        color: 'gray',
        reason: 'Dati troppo vecchi',
        syncAgeMs,
      });
    }

    if (dataState === 'empty') {
      return staleResult(crossing, {
        status: 'INCERTO',
        color: 'gray',
        reason: 'Nessun treno ricevuto',
        syncAgeMs,
        confidence: 20,
      });
    }

    // 2. Intervalli di chiusura stimati.
    const merged = mergeIntervals(buildIntervals(crossing, trains));
    const current = merged.find((interval) => nowMs >= interval.start && nowMs <= interval.end) ?? null;
    const next = merged.find((interval) => interval.start > nowMs) ?? null;

    const reference = current ?? next;
    const confidence = computeCrossingConfidence({
      syncAgeMs,
      delay: reference?.delay ?? 0,
      distanceMeters: crossing.distanceMeters,
      trainCount: reference?.trainIds.length ?? 1,
      uncertain: reference?.uncertain ?? false,
      staleHard,
      usingCached,
      theoryOnly,
    });

    const base = {
      ...crossing,
      confidence,
      isUncertain: reference?.uncertain ?? false,
      theoryOnly,
      usingCached,
      dataAgeSec: Math.round(syncAgeMs / 1000),
      nextClosureInSec: next ? Math.max(0, Math.round((next.start - nowMs) / 1000)) : null,
      nextTrainIds: next ? next.trainIds : [],
      nextWindowFrom: next ? next.start : null,
      nextWindowTo: next ? next.end : null,
    };

    // 3. Stato corrente.
    if (current) {
      const isClosed = nowMs >= current.likelyClosed;
      return {
        ...base,
        status: isClosed ? 'CHIUSO' : 'IN CHIUSURA',
        color: isClosed ? 'red' : 'yellow',
        reason: `Transito ${current.trainIds.join(' + ')}`,
        timerSec: Math.max(0, Math.round((current.end - nowMs) / 1000)),
        closesInSec: null,
        windowFrom: current.start,
        windowTo: current.end,
      };
    }

    if (next && next.start - nowMs < WINDOWS.imminentThresholdSec * 1000) {
      return {
        ...base,
        status: 'PREALLERTA',
        color: 'blue',
        reason: `Treno ${next.trainIds.join(' + ')} in avvicinamento`,
        timerSec: Math.max(0, Math.round((next.start - nowMs) / 1000)),
        closesInSec: null,
        windowFrom: next.start,
        windowTo: next.end,
      };
    }

    const staleSoft = syncAgeMs > WINDOWS.staleSoftMs;
    const softUncertain = staleSoft && !theoryOnly && !usingCached;

    return {
      ...base,
      status: softUncertain ? 'INCERTO' : 'APERTO',
      color: 'green',
      reason: next ? 'Nessun transito imminente' : 'Nessun treno in programma',
      timerSec: null,
      closesInSec: next ? Math.max(0, Math.round((next.start - nowMs) / 1000)) : null,
      windowFrom: null,
      windowTo: null,
    };
  });

  return { crossings: results, meta: { dataState, theoryOnly, usingCached } };
};
