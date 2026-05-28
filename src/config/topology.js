export const BRANCHES = Object.freeze({

  COMMON: 'COMMON',

  CAMNAGO: 'CAMNAGO',

  ASSO: 'ASSO',

  UNKNOWN: 'UNKNOWN'
});

/* ============================================================================
 * WINDOWS
 * ========================================================================== */

export const WINDOWS = Object.freeze({

  /*
   * Treno molto lontano
   */

  SAFE_OPEN: 240,

  /*
   * Possibile attivazione circuito PL
   */

  PRE_ALERT: 180,

  /*
   * Barriere probabilmente in movimento
   */

  CLOSING: 90,

  /*
   * PL quasi certamente chiuso
   */

  CLOSED: 55,

  /*
   * Margine riapertura reale
   */

  REOPEN_BUFFER: 45
});

/* ============================================================================
 * CATEGORY CONFIG
 * ========================================================================== */

export const CATEGORY_CONFIG = Object.freeze({

  S: {

    avgSpeedKmh: 42,

    uncertaintyFactor: 1.35
  },

  REG: {

    avgSpeedKmh: 58,

    uncertaintyFactor: 1.25
  },

  DIR: {

    avgSpeedKmh: 82,

    uncertaintyFactor: 1.15
  },

  default: {

    avgSpeedKmh: 55,

    uncertaintyFactor: 1.3
  }
});

/* ============================================================================
 * CROSSINGS
 * ========================================================================== */

export const CROSSINGS_CONFIG = [

  {
    id: 'como',
    name: 'Via Como (Cesano M.)',

    branch: BRANCHES.COMMON,
    side: 'CESANO',

    distanceMeters: 950,

    closureLeadSec: 75
  },

  {
    id: 'isonzo',
    name: 'Corso Isonzo',

    branch: BRANCHES.COMMON,
    side: 'CESANO',

    distanceMeters: 650,

    closureLeadSec: 70
  },

  {
    id: 'manzoni',
    name: 'Via Manzoni',

    branch: BRANCHES.COMMON,
    side: 'CESANO',

    distanceMeters: 320,

    closureLeadSec: 65
  },

  {
    id: 'montello',
    name: 'Corso Montello',

    branch: BRANCHES.COMMON,
    side: 'MEDA',

    distanceMeters: 280,

    closureLeadSec: 60
  },

  {
    id: 'brennero',
    name: 'Via Brennero (Camnago)',

    branch: BRANCHES.CAMNAGO,
    side: 'MEDA',

    distanceMeters: 780,

    closureLeadSec: 80
  },

  {
    id: 'farga',
    name: 'Via Farga (Asso)',

    branch: BRANCHES.ASSO,
    side: 'MEDA',

    distanceMeters: 1200,

    closureLeadSec: 90
  },

  {
    id: 'sancarlo',
    name: 'Via San Carlo (Asso)',

    branch: BRANCHES.ASSO,
    side: 'MEDA',

    distanceMeters: 1700,

    closureLeadSec: 100
  }
];