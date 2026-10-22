/* ============================================================================
 * TOPOLOGIA FERROVIARIA E CONFIGURAZIONE DEI PASSAGGI A LIVELLO
 * ========================================================================== */

/**
 * Diramazioni che interessano Seveso.
 *
 * ATTENZIONE: sono due diramazioni SEPARATE, non una contenuta nell'altra.
 * Un treno diretto a Camnago-Lentate attraversa i PL del ramo Camnago e non
 * quelli del ramo Asso, e viceversa. (Verificato con il gestore del progetto.)
 */
export const BRANCHES = Object.freeze({
  /** Tronco comune Milano–Seveso. */
  COMMON: 'COMMON',
  /** Diramazione S4 verso Camnago-Lentate. */
  CAMNAGO: 'CAMNAGO',
  /** Diramazione S2 verso Asso (via Erba). */
  ASSO: 'ASSO',
  /** Non determinabile: trattato in modo prudente. */
  UNKNOWN: 'UNKNOWN',
});

export const BRANCH_LABELS = Object.freeze({
  [BRANCHES.COMMON]: 'Tronco comune',
  [BRANCHES.CAMNAGO]: 'Ramo S4 Camnago',
  [BRANCHES.ASSO]: 'Ramo S2 Asso',
  [BRANCHES.UNKNOWN]: 'Da verificare',
});

/**
 * Parametri del modello di stima per categoria di treno.
 *
 * NOTA: `avgSpeedKmh` non e' la velocita' massima ma la velocita' media
 * sostenibile fra la stazione e i passaggi a livello. Da tarare con dati reali.
 */
const SUBURBAN = Object.freeze({
  label: 'Suburbano',
  avgSpeedKmh: 45,
  accelerationFactor: 0.82,
  uncertaintyFactor: 1.22,
});

export const CATEGORY_CONFIG = Object.freeze({
  REG: { label: 'Regionale', avgSpeedKmh: 62, accelerationFactor: 0.9, uncertaintyFactor: 1.15 },
  RV: { label: 'Regionale veloce', avgSpeedKmh: 72, accelerationFactor: 0.94, uncertaintyFactor: 1.1 },
  DIR: { label: 'Diretto', avgSpeedKmh: 85, accelerationFactor: 0.96, uncertaintyFactor: 1.08 },
  IC: { label: 'Intercity', avgSpeedKmh: 95, accelerationFactor: 0.97, uncertaintyFactor: 1.06 },
  EC: { label: 'Eurocity', avgSpeedKmh: 100, accelerationFactor: 0.97, uncertaintyFactor: 1.05 },
  default: { label: 'Standard', avgSpeedKmh: 55, accelerationFactor: 0.88, uncertaintyFactor: 1.25 },
});

/**
 * Risolve la configurazione di categoria a partire dal codice di Viaggiatreno.
 * Le linee suburbane arrivano come "S1", "S2", "S4", ... mentre la vecchia
 * mappatura usava la chiave "S", che non corrispondeva mai a nulla.
 */
export const resolveCategoryConfig = (categoria) => {
  const code = String(categoria ?? '').trim().toUpperCase();
  if (/^S\d{1,2}$/.test(code)) return { ...SUBURBAN, label: `Suburbano ${code}` };
  return CATEGORY_CONFIG[code] ?? CATEGORY_CONFIG.default;
};

/** Lati della stazione rispetto ai quali e' definita la posizione dei PL. */
export const SIDES = Object.freeze({ CESANO: 'CESANO', MEDA: 'MEDA' });

/**
 * Passaggi a livello.
 *
 * - `side`: lato della stazione verso cui si trova il PL. Un treno in
 *   direzione NORD attraversa prima i PL lato CESANO (arrivando) e poi quelli
 *   lato MEDA (partendo), e viceversa.
 * - `distanceMeters`: distanza stimata dalla stazione.
 * - `closureLeadSec`: anticipo medio con cui l'impianto inizia la chiusura.
 * - `fullClosureSec`: tempo medio per avere le barriere completamente chiuse.
 * - `reopenBufferSec`: sicurezza aggiuntiva prima di considerare il PL riaperto.
 *
 * Questi tre tempi sono STIME: per migliorarle serve una campagna di
 * osservazione reale (vedi sezione "Calibrazione" nel README).
 */
export const CROSSINGS_CONFIG = Object.freeze([
  { id: 'como', name: 'Via Como', locality: 'Cesano Maderno', branch: BRANCHES.COMMON, side: SIDES.CESANO, distanceMeters: 950, closureLeadSec: 78, fullClosureSec: 52, reopenBufferSec: 42 },
  { id: 'isonzo', name: 'Corso Isonzo', locality: 'Cesano Maderno', branch: BRANCHES.COMMON, side: SIDES.CESANO, distanceMeters: 650, closureLeadSec: 70, fullClosureSec: 48, reopenBufferSec: 38 },
  { id: 'manzoni', name: 'Via Manzoni', locality: 'Seveso', branch: BRANCHES.COMMON, side: SIDES.CESANO, distanceMeters: 320, closureLeadSec: 62, fullClosureSec: 44, reopenBufferSec: 35 },
  { id: 'montello', name: 'Corso Montello', locality: 'Seveso', branch: BRANCHES.COMMON, side: SIDES.MEDA, distanceMeters: 280, closureLeadSec: 58, fullClosureSec: 42, reopenBufferSec: 34 },
  { id: 'brennero', name: 'Via Brennero', locality: 'Camnago', branch: BRANCHES.CAMNAGO, side: SIDES.MEDA, distanceMeters: 780, closureLeadSec: 82, fullClosureSec: 55, reopenBufferSec: 45 },
  { id: 'farga', name: 'Via Farga', locality: 'Seveso', branch: BRANCHES.ASSO, side: SIDES.MEDA, distanceMeters: 1200, closureLeadSec: 96, fullClosureSec: 60, reopenBufferSec: 48 },
  { id: 'sancarlo', name: 'Via San Carlo', locality: 'Seveso', branch: BRANCHES.ASSO, side: SIDES.MEDA, distanceMeters: 1700, closureLeadSec: 108, fullClosureSec: 65, reopenBufferSec: 52 },
]);

/** Etichette dei lati, usate per raggruppare i PL nella UI. */
export const SIDE_LABELS = Object.freeze({
  [SIDES.CESANO]: 'Lato Cesano Maderno',
  [SIDES.MEDA]: 'Lato Meda',
});
