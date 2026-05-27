export const BRANCHES = {
  CESANO: 'CESANO',     // Lato Sud
  COMMON: 'COMMON',     // Tronco comune Meda (Montello)
  BRENNERO: 'BRENNERO', // Ramo Camnago
  FARGA: 'FARGA'        // Ramo Asso
};

export const WINDOWS = { 
  preAlert: 120, 
  closing: 90, 
  closed: 50, 
  reopening: -30, 
  end: -60 
};

export const PRIORITY = { CLOSED: 4, CLOSING: 3, PREALERT: 2, REOPENING: 1, OPEN: 0 };

export const CROSSINGS_CONFIG = [
  // LATO CESANO
  { id: 'como', name: "Via Como (Cesano M.)", branch: BRANCHES.CESANO, side: 'CESANO', offset: 120 },
  { id: 'isonzo', name: "Corso Isonzo", branch: BRANCHES.CESANO, side: 'CESANO', offset: 80 },
  { id: 'manzoni', name: "Via Manzoni", branch: BRANCHES.CESANO, side: 'CESANO', offset: 40 },
  // LATO MEDA
  { id: 'montello', name: "Corso Montello", branch: BRANCHES.COMMON, side: 'MEDA', offset: 30 },
  { id: 'brennero', name: "Via Brennero (Camnago)", branch: BRANCHES.BRENNERO, side: 'MEDA', offset: 60 },
  { id: 'farga', name: "Via Farga (Asso)", branch: BRANCHES.FARGA, side: 'MEDA', offset: 90 },
  { id: 'sancarlo', name: "Via San Carlo (Asso)", branch: BRANCHES.FARGA, side: 'MEDA', offset: 120 }
];
