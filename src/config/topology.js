/* ============================================================================
 * BRANCHES
 * ========================================================================== */

export const BRANCHES = Object.freeze({

  COMMON: 'COMMON',

  CAMNAGO: 'CAMNAGO',

  ASSO: 'ASSO',

  UNKNOWN: 'UNKNOWN'
});

/* ============================================================================
 * GLOBAL WINDOWS
 * ========================================================================== */

export const WINDOWS = Object.freeze({

  /*
   * Sotto questo valore
   * il PL entra in modalità imminente
   */

  IMMINENT_THRESHOLD: 180,

  /*
   * Timeout massimo validità dati
   */

  STALE_SOFT: 45000,

  STALE_HARD: 120000,

  /*
   * Merge intervalli ravvicinati
   */

  MERGE_GAP_MS: 25000,

  /*
   * Sicurezza extra riapertura
   */

  REOPEN_BUFFER_SEC: 35
});

/* ============================================================================
 * TRAIN CATEGORY CONFIG
 * ========================================================================== */

export const CATEGORY_CONFIG = Object.freeze({

  S: {

    label: 'Suburbano',

    avgSpeedKmh: 45,

    accelerationFactor: 0.82,

    brakingFactor: 0.92,

    uncertaintyFactor: 1.22
  },

  REG: {

    label: 'Regionale',

    avgSpeedKmh: 62,

    accelerationFactor: 0.9,

    brakingFactor: 0.95,

    uncertaintyFactor: 1.15
  },

  DIR: {

    label: 'Diretto',

    avgSpeedKmh: 85,

    accelerationFactor: 0.96,

    brakingFactor: 1,

    uncertaintyFactor: 1.08
  },

  default: {

    label: 'Standard',

    avgSpeedKmh: 55,

    accelerationFactor: 0.88,

    brakingFactor: 0.93,

    uncertaintyFactor: 1.25
  }
});

/* ============================================================================
 * CROSSINGS CONFIG
 * ========================================================================== */

export const CROSSINGS_CONFIG = [

  {
    id: 'como',

    name: 'Via Como (Cesano M.)',

    branch: BRANCHES.COMMON,

    side: 'CESANO',

    distanceMeters: 950,

    /*
     * Tempo medio reale
     * anticipo chiusura PL
     */

    closureLeadSec: 78,

    /*
     * Tempo medio barriera giù
     */

    fullClosureSec: 52,

    /*
     * Buffer riapertura
     */

    reopenBufferSec: 42
  },

  {
    id: 'isonzo',

    name: 'Corso Isonzo',

    branch: BRANCHES.COMMON,

    side: 'CESANO',

    distanceMeters: 650,

    closureLeadSec: 70,

    fullClosureSec: 48,

    reopenBufferSec: 38
  },

  {
    id: 'manzoni',

    name: 'Via Manzoni',

    branch: BRANCHES.COMMON,

    side: 'CESANO',

    distanceMeters: 320,

    closureLeadSec: 62,

    fullClosureSec: 44,

    reopenBufferSec: 35
  },

  {
    id: 'montello',

    name: 'Corso Montello',

    branch: BRANCHES.COMMON,

    side: 'MEDA',

    distanceMeters: 280,

    closureLeadSec: 58,

    fullClosureSec: 42,

    reopenBufferSec: 34
  },

  {
    id: 'brennero',

    name: 'Via Brennero (Camnago)',

    branch: BRANCHES.CAMNAGO,

    side: 'MEDA',

    distanceMeters: 780,

    closureLeadSec: 82,

    fullClosureSec: 55,

    reopenBufferSec: 45
  },

  {
    id: 'farga',

    name: 'Via Farga (Asso)',

    branch: BRANCHES.ASSO,

    side: 'MEDA',

    distanceMeters: 1200,

    closureLeadSec: 96,

    fullClosureSec: 60,

    reopenBufferSec: 48
  },

  {
    id: 'sancarlo',

    name: 'Via San Carlo (Asso)',

    branch: BRANCHES.ASSO,

    side: 'MEDA',

    distanceMeters: 1700,

    closureLeadSec: 108,

    fullClosureSec: 65,

    reopenBufferSec: 52
  }
];