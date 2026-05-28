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
  departures = []
) => {

  const map = new Map();

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

    if (
      t.provvedimento === 1 ||
      !t.numeroTreno
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

  /*
   * Treni più lenti in uscita stazione
   */

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
  crossing
) => {

  const travelMs =
    calculateTravelMs(
      train,
      crossing
    );

  if (train.direction === 'NORD') {

    if (
      crossing.side === 'CESANO' &&
      train.arrivalTs
    ) {

      return train.arrivalTs - travelMs;
    }

    if (
      crossing.side === 'MEDA' &&
      train.departureTs
    ) {

      return train.departureTs + travelMs;
    }
  }

  if (train.direction === 'SUD') {

    if (
      crossing.side === 'MEDA' &&
      train.arrivalTs
    ) {

      return train.arrivalTs - travelMs;
    }

    if (
      crossing.side === 'CESANO' &&
      train.departureTs
    ) {

      return train.departureTs + travelMs;
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
      (crossing.reopenBufferSec * 1000)
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

    if (
      current.start <=
      last.end + WINDOWS.MERGE_GAP_MS
    ) {

      last.end =
        Math.max(last.end, current.end);

      last.trainId =
        `${last.trainId} + ${current.trainId}`;

    } else {

      merged.push(current);
    }
  }

  return merged;
};

/* ============================================================================
 * CONFIDENCE
 * ========================================================================== */

const computeConfidence = (
  syncAge,
  delay
) => {

  let score = 100;

  if (syncAge > WINDOWS.STALE_SOFT) {
    score -= 18;
  }

  if (delay > 5) {
    score -= 8;
  }

  if (delay > 10) {
    score -= 10;
  }

  return Math.max(35, score);
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
      departures
    );

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
            crossing
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

      if (
        syncAge >
        WINDOWS.STALE_HARD
      ) {

        return {

          ...crossing,

          status: 'INCERTO',

          color: 'gray',

          reason:
            'Realtime non aggiornato',

          timer: null,

          confidence: 0
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
              computeConfidence(syncAge, 0)
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
              computeConfidence(syncAge, 0)
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
            computeConfidence(syncAge, 0) - 5
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
            computeConfidence(syncAge, 0)
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
          computeConfidence(syncAge, 0) - 3
      };
    });

  return {

    crossings: results,

    trains
  };
};