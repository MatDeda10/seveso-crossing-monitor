import {
  WINDOWS,
  CATEGORY_CONFIG,
  BRANCHES
} from '../config/topology';

/* ==============================================================================
 * NORMALIZE STATION NAME
 * ============================================================================== */

const normalizeStationName = (value = '') => {
  return String(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

/* ==============================================================================
 * INFER DIRECTION
 * ============================================================================== */

const NORTH_STATIONS = [
  'ASSO',
  'ERBA',
  'MARIANO',
  'MERONE',
  'CANZO',
  'CAMNAGO',
  'LENTATE',
  'MEDA'
];

const inferDirection = (destination = '') => {
  const d = normalizeStationName(destination);

  return NORTH_STATIONS.some(station => d.includes(station))
    ? 'NORD'
    : 'SUD';
};

/* ==============================================================================
 * INFER ROUTE BRANCH
 * ============================================================================== */

const inferRouteBranch = (destination = '') => {
  const d = normalizeStationName(destination);

  if (d.includes('CAMNAGO') || d.includes('LENTATE')) {
    return BRANCHES.CAMNAGO;
  }

  if (
    d.includes('ASSO') ||
    d.includes('ERBA') ||
    d.includes('MERONE') ||
    d.includes('CANZO') ||
    d.includes('MARIANO')
  ) {
    return BRANCHES.ASSO;
  }

  return BRANCHES.UNKNOWN;
};

/* ==============================================================================
 * BRANCH COMPATIBILITY
 * ============================================================================== */

const isBranchCompatible = (trainBranch, crossingBranch) => {
  if (crossingBranch === BRANCHES.COMMON) {
    return true;
  }

  if (trainBranch === BRANCHES.UNKNOWN) {
    return false;
  }

  return trainBranch === crossingBranch;
};

/* ==============================================================================
 * NORMALIZE TRAINS
 * ============================================================================== */

export const normalizeTrains = (arrivals = [], departures = []) => {
  const map = new Map();

  const raw = [
    ...arrivals.map(t => ({ ...t, type: 'ARR' })),
    ...departures.map(t => ({ ...t, type: 'DEP' }))
  ];

  raw.forEach(t => {
    if (t.provvedimento === 1) {
      return;
    }

    const baseTs = t.orarioArrivo || t.orarioPartenza;

    if (!baseTs) {
      return;
    }

    const realTs = new Date(baseTs).getTime() + ((t.ritardo || 0) * 60000);

    const destination = t.destinazione || t.origine || '';
    const direction = inferDirection(destination);
    const routeBranch = inferRouteBranch(destination);

    const rawCategory = t.categoria || t.categoriaDescrizione || 'REG';

    const categoryKey = CATEGORY_CONFIG[rawCategory]
      ? rawCategory
      : rawCategory?.[0] || 'REG';

    const config = CATEGORY_CONFIG[categoryKey] || CATEGORY_CONFIG.default;

    if (!map.has(t.numeroTreno)) {
      map.set(t.numeroTreno, {
        id: t.numeroTreno,
        category: categoryKey,
        config,
        destination,
        direction,
        routeBranch,
        delay: t.ritardo || 0,
        arrivalTs: null,
        departureTs: null
      });
    }

    const train = map.get(t.numeroTreno);

    if (t.type === 'ARR') {
      train.arrivalTs = realTs;
    }

    if (t.type === 'DEP') {
      train.departureTs = realTs;
    }
  });

  return Array.from(map.values());
};

/* ==============================================================================
 * CALCULATE OFFSET
 * ============================================================================== */

const calculateOffsetMs = (train, crossing) => {
  const speedMs = (train.config.avgSpeedKmh * 1000) / 3600;
  const travelSeconds = crossing.distanceMeters / speedMs;

  return travelSeconds * 1000;
};

/* ==============================================================================
 * BUILD INTERVAL
 * ============================================================================== */

const buildInterval = ({ eventTs, train, crossing }) => {
  const uncertainty = train.config.uncertaintyFactor || 1.2;
  const closeLead = crossing.closureLeadSec || WINDOWS.CLOSING;

  return {
    trainId: train.id,
    start: eventTs - (WINDOWS.PRE_ALERT * uncertainty * 1000),
    possibleClosing: eventTs - (closeLead * 1000),
    likelyClosed: eventTs - (WINDOWS.CLOSED * 1000),
    end: eventTs + (WINDOWS.REOPEN_BUFFER * 1000)
  };
};

/* ==============================================================================
 * MERGE INTERVALS
 * ============================================================================== */

const mergeIntervals = (intervals = []) => {
  if (intervals.length <= 1) {
    return intervals;
  }

  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const current = sorted[i];

    if (current.start <= last.end + 20000) {
      last.end = Math.max(last.end, current.end);
      last.trainId = `${last.trainId} + ${current.trainId}`;
    } else {
      merged.push(current);
    }
  }

  return merged;
};

/* ==============================================================================
 * MAIN ENGINE
 * ============================================================================== */

export const predictCrossings = ({
  arrivals = [],
  departures = [],
  crossings = [],
  now = new Date(),
  lastSyncTs = 0
}) => {
  const currentTime = now.getTime();
  const syncAge = currentTime - lastSyncTs;

  const isVeryStale = syncAge > 120000;
  const isSlightlyStale = syncAge > 45000;

  const trains = normalizeTrains(arrivals, departures);

  const results = crossings.map(crossing => {
    const intervals = [];

    trains.forEach(train => {
      if (!isBranchCompatible(train.routeBranch, crossing.branch)) {
        return;
      }

      const offsetMs = calculateOffsetMs(train, crossing);
      let eventTs = null;

      if (train.direction === 'NORD') {
        if (crossing.side === 'CESANO' && train.arrivalTs) {
          eventTs = train.arrivalTs - offsetMs;
        }
        if (crossing.side === 'MEDA' && train.departureTs) {
          eventTs = train.departureTs + offsetMs;
        }
      } else {
        if (crossing.side === 'MEDA' && train.arrivalTs) {
          eventTs = train.arrivalTs - offsetMs;
        }
        if (crossing.side === 'CESANO' && train.departureTs) {
          eventTs = train.departureTs + offsetMs;
        }
      }

      if (!eventTs) {
        return;
      }

      intervals.push(buildInterval({ eventTs, train, crossing }));
    });

    const merged = mergeIntervals(intervals);

    const active = merged.find(interval =>
      currentTime >= interval.start && currentTime <= interval.end
    );

    const next = merged.find(interval => interval.start > currentTime);

    if (isVeryStale) {
      return {
        ...crossing,
        status: 'INCERTO',
        color: 'gray',
        reason: 'Dati realtime obsoleti',
        timer: null,
        confidence: 0
      };
    }

    if (!active) {
      if (!next) {
        return {
          ...crossing,
          status: 'APERTO',
          color: 'green',
          reason: 'Nessun treno imminente',
          timer: null,
          confidence: isSlightlyStale ? 70 : 95
        };
      }

      const sec = Math.max(0, Math.ceil((next.possibleClosing - currentTime) / 1000));

      if (sec > WINDOWS.SAFE_OPEN) {
        return {
          ...crossing,
          status: 'APERTO',
          color: 'green',
          reason: 'Circolazione regolare',
          timer: `Possibile chiusura tra ${Math.floor(sec / 60)}m`,
          confidence: isSlightlyStale ? 70 : 90
        };
      }

      return {
        ...crossing,
        status: 'POSSIBILE CHIUSURA',
        color: 'blue',
        reason: `Treno ${next.trainId} in avvicinamento`,
        timer: `Possibile chiusura tra ${sec}s`,
        confidence: isSlightlyStale ? 55 : 78
      };
    }

    if (currentTime >= active.likelyClosed) {
      const sec = Math.max(0, Math.ceil((active.end - currentTime) / 1000));

      return {
        ...crossing,
        status: 'CHIUSO PROBABILE',
        color: 'red',
        reason: `Treno ${active.trainId}`,
        timer: `Riapertura stimata ${sec}s`,
        confidence: isSlightlyStale ? 70 : 92
      };
    }

    if (currentTime >= active.possibleClosing) {
      const sec = Math.max(0, Math.ceil((active.likelyClosed - currentTime) / 1000));

      return {
        ...crossing,
        status: 'IN CHIUSURA',
        color: 'yellow',
        reason: `Treno ${active.trainId}`,
        timer: `Barriere giù tra ${sec}s`,
        confidence: isSlightlyStale ? 65 : 88
      };
    }

    return {
      ...crossing,
      status: 'PREALLERTA',
      color: 'blue',
      reason: 'Treno imminente',
      timer: 'Possibile attivazione PL',
      confidence: isSlightlyStale ? 60 : 80
    };
  });

  return {
    crossings: results,
    trains
  };
};
