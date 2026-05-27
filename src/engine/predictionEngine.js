import {
  WINDOWS,
  CATEGORY_CONFIG,
  BRANCHES
} from '../config/topology';

/* ============================================================================
 * NORMALIZE STATION NAME
 * ========================================================================== */

const normalizeStationName = (
  value = ''
) => {

  return value
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

/* ============================================================================
 * INFER DIRECTION
 * ========================================================================== */

const inferDirection = (
  destination = ''
) => {

  const d =
    normalizeStationName(destination);

  const northStations = [

    'ASSO',
    'ERBA',
    'MARIANO',
    'MERONE',
    'CANZO',
    'CAMNAGO',
    'LENTATE',
    'MEDA'
  ];

  return northStations.some(s => d.includes(s))
    ? 'NORD'
    : 'SUD';
};

/* ============================================================================
 * INFER ROUTE BRANCH
 * ========================================================================== */

const inferRouteBranch = (
  destination = ''
) => {

  const d =
    normalizeStationName(destination);

  // ------------------------------------------------------------------------
  // CAMNAGO
  // ------------------------------------------------------------------------

  if (
    d.includes('CAMNAGO') ||
    d.includes('LENTATE')
  ) {

    return BRANCHES.CAMNAGO;
  }

  // ------------------------------------------------------------------------
  // ASSO
  // ------------------------------------------------------------------------

  if (
    d.includes('ASSO') ||
    d.includes('MARIANO') ||
    d.includes('ERBA') ||
    d.includes('MERONE') ||
    d.includes('CANZO')
  ) {

    return BRANCHES.ASSO;
  }

  return BRANCHES.UNKNOWN;
};

/* ============================================================================
 * BRANCH COMPATIBILITY
 * ========================================================================== */

const isBranchCompatible = (
  trainBranch,
  crossingBranch
) => {

  // ------------------------------------------------------------------------
  // COMMON
  // ------------------------------------------------------------------------

  if (
    crossingBranch ===
    BRANCHES.COMMON
  ) {

    return true;
  }

  // ------------------------------------------------------------------------
  // UNKNOWN
  // ------------------------------------------------------------------------

  if (
    trainBranch ===
    BRANCHES.UNKNOWN
  ) {

    return false;
  }

  return trainBranch === crossingBranch;
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

    if (t.provvedimento === 1) {
      return;
    }

    const baseTs =
      t.orarioArrivo ||
      t.orarioPartenza;

    if (!baseTs) {
      return;
    }

    const realTs =
      new Date(baseTs).getTime() +
      ((t.ritardo || 0) * 60000);

    const destination =
      t.destinazione ||
      t.origine ||
      '';

    const direction =
      inferDirection(destination);

    const routeBranch =
      inferRouteBranch(destination);

    const category =
      t.categoriaDescrizione ||
      t.categoria ||
      'REG';

    const categoryKey =
      CATEGORY_CONFIG[category]
        ? category
        : category?.[0] || 'REG';

    const config =
      CATEGORY_CONFIG[categoryKey] ||
      CATEGORY_CONFIG.default;

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
        departureTs: null,

        schedTime:
          t.compOrarioArrivo ||
          t.compOrarioPartenza
      });
    }

    const train =
      map.get(t.numeroTreno);

    if (t.type === 'ARR') {
      train.arrivalTs = realTs;
    }

    if (t.type === 'DEP') {
      train.departureTs = realTs;
    }
  });

  return Array.from(map.values());
};

/* ============================================================================
 * CALCULATE OFFSET
 * ========================================================================== */

const calculateOffsetMs = (
  train,
  crossing
) => {

  const speedMs =
    (train.config.avgSpeedKmh * 1000) / 3600;

  const seconds =
    crossing.distanceMeters / speedMs;

  return seconds * 1000;
};

/* ============================================================================
 * MERGE INTERVALS
 * ========================================================================== */

const mergeIntervals = (
  intervals
) => {

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
      last.end + 10000
    ) {

      last.end =
        Math.max(last.end, current.end);

      last.trainIds =
        `${last.trainIds} + ${current.trainIds}`;

    } else {

      merged.push(current);
    }
  }

  return merged;
};

/* ============================================================================
 * MAIN ENGINE
 * ========================================================================== */

export const predictCrossings = ({
  arrivals,
  departures,
  crossings,
  now,
  lastSyncTs
}) => {

  const currentTime =
    now.getTime();

  const isStale =
    (currentTime - lastSyncTs) > 95000;

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

        const offsetMs =
          calculateOffsetMs(
            train,
            crossing
          );

        let eventTs = null;

        // --------------------------------------------------------------
        // NORD
        // --------------------------------------------------------------

        if (
          train.direction === 'NORD'
        ) {

          if (
            crossing.side === 'CESANO' &&
            train.arrivalTs
          ) {

            eventTs =
              train.arrivalTs - offsetMs;
          }

          if (
            crossing.side === 'MEDA' &&
            train.departureTs
          ) {

            eventTs =
              train.departureTs + offsetMs;
          }
        }

        // --------------------------------------------------------------
        // SUD
        // --------------------------------------------------------------

        else {

          if (
            crossing.side === 'MEDA' &&
            train.arrivalTs
          ) {

            eventTs =
              train.arrivalTs - offsetMs;
          }

          if (
            crossing.side === 'CESANO' &&
            train.departureTs
          ) {

            eventTs =
              train.departureTs + offsetMs;
          }
        }

        if (!eventTs) {
          return;
        }

        intervals.push({

          start:
            eventTs -
            (WINDOWS.PRE_ALERT * 1000),

          closing:
            eventTs -
            (WINDOWS.CLOSING * 1000),

          closed:
            eventTs -
            (WINDOWS.CLOSED * 1000),

          end:
            eventTs -
            (WINDOWS.END * 1000),

          trainIds: train.id
        });
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

      // --------------------------------------------------------------
      // STALE
      // --------------------------------------------------------------

      if (isStale) {

        return {

          ...crossing,

          status: 'INCERTO',

          color: 'gray',

          reason: 'Dati obsoleti',

          timer: null,

          confidence: 0
        };
      }

      // --------------------------------------------------------------
      // OPEN
      // --------------------------------------------------------------

      if (!active) {

        let timer = null;

        if (next) {

          const sec =
            Math.ceil(
              (next.closing - currentTime) / 1000
            );

          if (sec < 600) {

            const m =
              Math.floor(sec / 60);

            const s =
              sec % 60;

            timer =
              `Chiude tra ${m > 0 ? `${m}m ` : ''}${s}s`;
          }
        }

        return {

          ...crossing,

          status: 'APERTO',

          color: 'green',

          reason: 'Circolazione regolare',

          timer,

          confidence: 100
        };
      }

      // --------------------------------------------------------------
      // CLOSED
      // --------------------------------------------------------------

      if (
        currentTime >= active.closed
      ) {

        const sec =
          Math.ceil(
            (active.end - currentTime) / 1000
          );

        return {

          ...crossing,

          status: 'CHIUSO',

          color: 'red',

          reason:
            `Treno ${active.trainIds}`,

          timer:
            `Riapre tra ${sec}s`,

          confidence: 95
        };
      }

      // --------------------------------------------------------------
      // CLOSING
      // --------------------------------------------------------------

      if (
        currentTime >= active.closing
      ) {

        const sec =
          Math.ceil(
            (active.closed - currentTime) / 1000
          );

        return {

          ...crossing,

          status: 'IN CHIUSURA',

          color: 'yellow',

          reason:
            `Treno ${active.trainIds}`,

          timer:
            `Chiuso tra ${sec}s`,

          confidence: 95
        };
      }

      // --------------------------------------------------------------
      // PRE ALERT
      // --------------------------------------------------------------

      const sec =
        Math.ceil(
          (active.closing - currentTime) / 1000
        );

      return {

        ...crossing,

        status: 'PREALLERTA',

        color: 'blue',

        reason: 'Treno imminente',

        timer:
          `Barriere giù tra ${sec}s`,

        confidence: 90
      };
    });

  return {

    crossings: results,

    trains
  };
};