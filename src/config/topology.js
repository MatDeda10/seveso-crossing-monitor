export const BRANCHES = Object.freeze({

  COMMON: 'COMMON',

  CAMNAGO: 'CAMNAGO',

  ASSO: 'ASSO',

  UNKNOWN: 'UNKNOWN'
});

export const WINDOWS = Object.freeze({

  PRE_ALERT: 120,
  CLOSING: 90,
  CLOSED: 50,

  REOPENING: -30,
  END: -60
});

export const CATEGORY_CONFIG = Object.freeze({

  S: {
    speedFactor: 0.85,
    avgSpeedKmh: 45
  },

  REG: {
    speedFactor: 1.0,
    avgSpeedKmh: 65
  },

  DIR: {
    speedFactor: 1.25,
    avgSpeedKmh: 90
  },

  default: {
    speedFactor: 1.0,
    avgSpeedKmh: 60
  }
});

export const CROSSINGS_CONFIG = [

  // ------------------------------------------------------------------------
  // TRONCO COMUNE
  // ------------------------------------------------------------------------

  {
    id: 'como',
    name: 'Via Como (Cesano M.)',

    branch: BRANCHES.COMMON,
    side: 'CESANO',

    distanceMeters: 950
  },

  {
    id: 'isonzo',
    name: 'Corso Isonzo',

    branch: BRANCHES.COMMON,
    side: 'CESANO',

    distanceMeters: 650
  },

  {
    id: 'manzoni',
    name: 'Via Manzoni',

    branch: BRANCHES.COMMON,
    side: 'CESANO',

    distanceMeters: 320
  },

  {
    id: 'montello',
    name: 'Corso Montello',

    branch: BRANCHES.COMMON,
    side: 'MEDA',

    distanceMeters: 280
  },

  // ------------------------------------------------------------------------
  // RAMO CAMNAGO
  // ------------------------------------------------------------------------

  {
    id: 'brennero',
    name: 'Via Brennero (Camnago)',

    branch: BRANCHES.CAMNAGO,
    side: 'MEDA',

    distanceMeters: 780
  },

  // ------------------------------------------------------------------------
  // RAMO ASSO
  // ------------------------------------------------------------------------

  {
    id: 'farga',
    name: 'Via Farga (Asso)',

    branch: BRANCHES.ASSO,
    side: 'MEDA',

    distanceMeters: 1200
  },

  {
    id: 'sancarlo',
    name: 'Via San Carlo (Asso)',

    branch: BRANCHES.ASSO,
    side: 'MEDA',

    distanceMeters: 1700
  }
];