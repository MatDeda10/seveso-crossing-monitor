import {
  WINDOWS,
  CATEGORY_CONFIG,
  BRANCHES
} from '../config/topology';

/* ============================================================================
 * NORMALIZE
 * ========================================================================== */

const normalizeStationName = (value = '') => {
  return String(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

// Helper: Rilevare treni soppressi (C8 FIX)
const isSuppressed = (train) => {
  const suppressionCodes = [1, 2, 3];
  if (suppressionCodes.includes(train.provvedimento)) {
    return true;
  }
  if (train.status === 'SOPPRESSO' || train.status === 'CANCELLED') {
    return true;
  }
  return false;
};

// Helper: Calcolare server lag (C4 FIX)
const calculateServerLag = (arrivals, departures, lastSyncTs) => {
  const now = Date.now();
  const allTrains = [...arrivals, ...departures];
  if (allTrains.length === 0) return 0;

  const recentTrains = allTrains.filter(t => {
    const ts = t.orarioArrivo || t.orarioPartenza;
    const time = new Date(ts).getTime();
    return (now - time) < 300000;
  });

  if (recentTrains.length === 0) return 0;

  const avgRecentTime = recentTrains
    .reduce((sum, t) => {
      const ts = t.orarioArrivo || t.orarioPartenza;
      return sum + new Date(ts).getTime();
    }, 0) / recentTrains.length;

  return Math.max(0, now - avgRecentTime - 5000);
};

/* ============================================================================
 * ROUTING
 * ========================================================================== */

const NORTH_STATIONS = [

  'ASSO',
  'ERBA',
  'CANZO',
  'MERONE',
  'MARIANO',
  'CAMNAGO',
  'LENTATE',
  'MEDA'
];

const inferDirection = (destination = '') => {

  const d = normalizeStationName(destination);

  return NORTH_STATIONS.some(s => d.includes(s))
    ? 'NORD'
    : 'SUD';
};

const inferRouteBranch = (destination = '') => {

  const d = normalizeStationName(destination);

  if (
    d.includes('CAMNAGO') ||
    d.includes('LENTATE')
  ) {

    return BRANCHES.CAMNAGO;
  }

  if (
    d.includes('ASSO') ||
    d.includes('ERBA') ||
    d.includes('CANZO') ||
    d.includes('MERONE') ||
    d.includes('MARIANO')
  ) {

    return BRANCHES.ASSO;
  }

  return BRANCHES.UNKNOWN;
};

/* ============================================================================
 * COMPATIBILITY
 * ========================================================================== */

const isBranchCompatible = (
  trainBranch,
  crossingBranch
) => {

  if (crossingBranch === BRANCHES.COMMON) {
    return true;
  }

  return trainBranch === crossingBranch;
};

/* ============================================================================
 * CATEGORY
 * ========================================================================== */

const resolveCategory = raw => {

  const value =
    raw ||
    'REG';

  const key =
    CATEGORY_CONFIG[value]
      ? value
      : value?.[0];

  return CATEGORY_CONFIG[key]
    ? key
    : 'default';
};

/* ============================================================================
 * NORMALIZE TRAINS
 * ========================================================================== */

export const normalizeTrains = (
  arrivals = [],
  departures = [],
  lastSyncTs = 0
) => {

  const map = new Map();

  // C4 FIX: Calcolare server lag estimato
  const serverLag = calculateServerLag(
    arrivals,
    departures,
    lastSyncTs
  );

  const raw = [

    ...arrivals.map(t => ({
      ...t,
      type: 'ARR'
    })),

    ...departures.map(t => ({
      ...t,
      type: 'DEP'
    }))
  ];

  raw.forEach(t => {

    // C8 FIX: Verificare più codici di soppressione
    if (
      !t.numeroTreno ||
      isSuppressed(t)
    ) {

      return;
    }

    const baseTs =
      t.orarioArrivo ||
      t.orarioPartenza;

    if (!baseTs) {
      return;
    }

    const delayMs =
      (t.ritardo || 0) * 60000;

    const realtimeTs =
      new Date(baseTs).getTime() +
      delayMs;

    const destination =
      t.destinazione ||
      t.origine ||
      '';

    const categoryKey =
      resolveCategory(
        t.categoria ||
        t.categoriaDescrizione
      );

    const config =
      CATEGORY_CONFIG[categoryKey];

    if (!map.has(t.numeroTreno)) {

      map.set(t.numeroTreno, {

        id: t.numeroTreno,

        category: categoryKey,

        config,

        destination,

        direction:
          inferDirection(destination),

        routeBranch:
          inferRouteBranch(destination),

        delay:
          t.ritardo || 0,

        arrivalTs: null,

        departureTs: null
      });
    }

    const train =
      map.get(t.numeroTreno);

    if (t.type === 'ARR') {
      train.arrivalTs = realtimeTs;
    }

    if (t.type === 'DEP') {
      train.departureTs = realtimeTs;
    }

    // C1, C7 FIX: Aggiungere metadata per tracking
    train.uniqueKey = `${t.numeroTreno}_${baseTs}`;
    train.mergedCount = 1;
  });

  return Array.from(map.values());
};

/* ============================================================================
 * ETA ENGINE
 * ========================================================================== */

const calculateTravelMs = (
  train,
  crossing
) => {

  const baseSpeed =
    train.config.avgSpeedKmh;

  const speedMs =
    (baseSpeed * 1000) / 3600;

  const rawTravel =
    crossing.distanceMeters / speedMs;

  const adjustedTravel =
    rawTravel /
    train.config.accelerationFactor;

  return adjustedTravel * 1000;
};

/* ============================================================================
 * EVENT TS
 * ========================================================================== */

const computeEventTs = (
  train,
  crossing,
  serverLag = 0
) => {

  const travelMs =
    calculateTravelMs(
      train,
      crossing
    );

  // C4 FIX: Correggere per server lag
  const lagMs = serverLag || 0;

  if (train.direction === 'NORD') {

    if (
      crossing.side === 'CESANO' &&
      train.arrivalTs
    ) {

      return train.arrivalTs - lagMs - travelMs;
    }

    if (
      crossing.side === 'MEDA' &&
      train.departureTs
    ) {

      return train.departureTs - lagMs + travelMs;
    }
  }

  if (train.direction === 'SUD') {

    if (
      crossing.side === 'MEDA' &&
      train.arrivalTs
    ) {

      return train.arrivalTs - lagMs - travelMs;
    }

    if (
      crossing.side === 'CESANO' &&
      train.departureTs
    ) {

      return train.departureTs - lagMs + travelMs;
    }
  }

  return null;
};

/* ============================================================================
 * BUILD INTERVAL
 * ========================================================================== */

const buildInterval = ({
  train,
  crossing,
  eventTs
}) => {

  const uncertainty =
    train.config.uncertaintyFactor;

  const preAlertMs =
    crossing.closureLeadSec *
    uncertainty *
    1000;

  return {

    trainId: train.id,

    trainIds: [train.id],

    start:
      eventTs - preAlertMs,

    possibleClosing:
      eventTs -
      (crossing.closureLeadSec * 1000),

    likelyClosed:
      eventTs -
      (crossing.fullClosureSec * 1000),

    end:
      eventTs +
      (crossing.reopenBufferSec * 1000),

    // C1 FIX: Tracciare durata reale per merge logic
    duration: (crossing.reopenBufferSec + crossing.fullClosureSec) * 1000
  };
};

/* ============================================================================
 * MERGE
 * ========================================================================== */

const mergeIntervals = intervals => {

  if (intervals.length <= 1) {
    return intervals;
  }

  const sorted =
    [...intervals]
      .sort((a, b) => a.start - b.start);

  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {

    const last =
      merged[merged.length - 1];

    const current =
      sorted[i];

    const gap = current.start - last.end;

    // C1, C7 FIX: Gap logic migliorato
    // Se gap > 60sec: definitely separate closures
    if (gap > 60000) {
      merged.push(current);
    }
    // Se gap 10-60sec: evaluate intelligently
    else if (gap > 10000) {
      // Merge solo se non estende duration >150%
      const potentialDuration = 
        (current.end - last.start);
      const actualDuration = 
        (last.duration + current.duration);

      if (potentialDuration < actualDuration * 1.5) {
        last.end = Math.max(last.end, current.end);
        last.trainIds = [
          ...last.trainIds,
          ...current.trainIds
        ];
        last.trainId = `${last.trainId}+${current.trainId}`;
      } else {
        merged.push(current);
      }
    }
    // Se gap ≤ 10sec: always merge (treni immediati)
    else {
      last.end = Math.max(last.end, current.end);
      last.trainIds = [
        ...last.trainIds,
        ...current.trainIds
      ];
      last.trainId = `${last.trainId}+${current.trainId}`;
    }
  }

  return merged;
};

/* ============================================================================
 * CONFIDENCE (C9 FIX - Multi-factor scoring)
 * ========================================================================== */

const computeConfidence = (
  syncAge,
  delay,
  trainDistance = 5000,
  mergedCount = 1
) => {

  let score = 100;

  // Factor 1: Sync Age (25pts impact)
  if (syncAge < 10000) {
    // Fresh: 0 penalty
  } else if (syncAge < WINDOWS.STALE_SOFT) {
    score -= 3;
  } else if (syncAge < WINDOWS.STALE_HARD) {
    score -= 12;
  } else {
    score -= 25;
  }

  // Factor 2: Delay Amount (20pts impact)
  if (Math.abs(delay) <= 2) {
    // On-time: 0 penalty
  } else if (Math.abs(delay) <= 5) {
    score -= 4;
  } else if (Math.abs(delay) <= 10) {
    score -= 10;
  } else {
    score -= 15;
  }

  // Factor 3: Train Distance (15pts impact)
  // Closer trains = higher confidence
  if (trainDistance < 2000) {
    // Very close: 0 penalty
  } else if (trainDistance < 5000) {
    score -= 3;
  } else if (trainDistance < 10000) {
    score -= 8;
  } else {
    score -= 12;
  }

  // Factor 4: Merge Count (20pts impact)
  // More merges = lower confidence
  if (mergedCount <= 1) {
    // Single train: 0 penalty
  } else if (mergedCount <= 2) {
    score -= 5;
  } else if (mergedCount <= 3) {
    score -= 12;
  } else {
    score -= 18;
  }

  // Floor at 25% (was 35%)
  return Math.max(25, score);
};

/* ============================================================================
 * MAIN ENGINE
 * ========================================================================== */

export const predictCrossings = ({
  arrivals = [],
  departures = [],
  crossings = [],
  now = new Date(),
  lastSyncTs = 0
}) => {

  const currentTime =
    now.getTime();

  const syncAge =
    currentTime - lastSyncTs;

  const trains =
    normalizeTrains(
      arrivals,
      departures,
      lastSyncTs
    );

  // C4 FIX: Calculate server lag once
  const serverLag = calculateServerLag(trains);

  const results =
    crossings.map(crossing => {

      const intervals = [];

      trains.forEach(train => {

        if (
          !isBranchCompatible(
            train.routeBranch,
            crossing.branch
          )
        ) {

          return;
        }

        const eventTs =
          computeEventTs(
            train,
            crossing,
            serverLag
          );

        if (!eventTs) {
          return;
        }

        intervals.push(
          buildInterval({

            train,
            crossing,
            eventTs
          })
        );
      });

      const merged =
        mergeIntervals(intervals);

      const active =
        merged.find(i =>
          currentTime >= i.start &&
          currentTime <= i.end
        );

      const next =
        merged.find(i =>
          i.start > currentTime
        );

      // C3 FIX: Stale data handling
      if (
        syncAge >
        WINDOWS.STALE_HARD
      ) {

        // Try to extrapolate from last known state
        const lastState = active || next;

        return {

          ...crossing,

          status: lastState ? 'INCERTO' : 'APERTO',

          color: 'orange',

          reason:
            'Realtime non aggiornato da ' +
            Math.round(syncAge / 1000) +
            's',

          timer: lastState ? lastState.end : null,

          // C9: Confidence drops with staleness
          confidence:
            computeConfidence(
              syncAge,
              0,
              5000,
              1
            )
        };
      }

      /*
       * APERTO
       */

      if (!active) {

        if (!next) {

          return {

            ...crossing,

            status: 'APERTO',

            color: 'green',

            reason:
              'Nessun transito previsto',

            timer: null,

            confidence:
              computeConfidence(
                syncAge,
                0,
                50000,
                1
              )
          };
        }

        const sec =
          Math.max(
            0,
            Math.ceil(
              (next.possibleClosing - currentTime) / 1000
            )
          );

        if (
          sec >
          WINDOWS.IMMINENT_THRESHOLD
        ) {

          return {

            ...crossing,

            status: 'APERTO',

            color: 'green',

            reason:
              'Viabilità regolare',

            timer:
              `Chiusura stimata tra ${Math.floor(sec / 60)}m`,

            confidence:
              computeConfidence(
                syncAge,
                0,
                next.trainIds ? next.trainIds.length * 2000 : 10000,
                next.trainIds ? next.trainIds.length : 1
              )
          };
        }

        return {

          ...crossing,

          status: 'PREALLERTA',

          color: 'blue',

          reason:
            `Treno ${next.trainId} in arrivo`,

          timer:
            `${sec}s alla possibile chiusura`,

          confidence:
            computeConfidence(
              syncAge,
              0,
              next.trainIds ? next.trainIds.length * 2000 : 5000,
              next.trainIds ? next.trainIds.length : 1
            ) - 5
        };
      }

      /*
       * CHIUSO
       */

      if (
        currentTime >=
        active.likelyClosed
      ) {

        const sec =
          Math.max(
            0,
            Math.ceil(
              (active.end - currentTime) / 1000
            )
          );

        return {

          ...crossing,

          status: 'CHIUSO',

          color: 'red',

          reason:
            `Transito ${active.trainId}`,

          timer:
            `Riapertura stimata ${sec}s`,

          confidence:
            computeConfidence(
              syncAge,
              0,
              1000,
              active.trainIds ? active.trainIds.length : 1
            )
        };
      }

      /*
       * IN CHIUSURA
       */

      const sec =
        Math.max(
          0,
          Math.ceil(
            (active.likelyClosed - currentTime) / 1000
          )
        );

      return {

        ...crossing,

        status: 'IN CHIUSURA',

        color: 'yellow',

        reason:
          `Attivazione PL ${active.trainId}`,

        timer:
          `Barriere giù tra ${sec}s`,

        confidence:
          computeConfidence(
            syncAge,
            0,
            500,
            active.trainIds ? active.trainIds.length : 1
          ) - 3
      };
    });

  return {

    crossings: results,

    trains
  };
};