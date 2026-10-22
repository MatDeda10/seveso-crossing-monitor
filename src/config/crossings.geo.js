/**
 * Coordinate e provenienza dei passaggi a livello.
 *
 * FONTI E METODO (leggere prima di modificare):
 *
 * 1. `verification: 'verified'` → il punto è un nodo OpenStreetMap con tag
 *    `railway=level_crossing` che giace sulla strada indicata. Il campo
 *    `osmNodeId` permette di ricontrollare il dato su
 *    https://www.openstreetmap.org/node/<id>. `lastVerified` è la data del
 *    controllo.
 *
 * 2. `verification: 'estimated'` → non è stato possibile associare in modo
 *    univoco il passaggio a un nodo OSM (nomi locali non coincidenti, nodi
 *    duplicati per binario, incroci non mappati). La posizione è calcolata
 *    lungo la linea ferroviaria (geometria OSM) alla distanza usata dal
 *    modello, e viene mostrata come "posizione stimata" con bordo tratteggiato.
 *    Non va presentata come verificata.
 *
 * Le coordinate NON vanno inventate: se un passaggio viene rimosso o spostato,
 * aggiornare qui e lasciare `verification: 'estimated'` finché non esiste un
 * riscontro verificabile.
 */

const VERIFIED_ON = '2026-10-22';

export const CROSSING_GEO = Object.freeze({
  como: {
    lat: 45.641421,
    lon: 9.141699,
    verification: 'estimated',
    source: 'OSM (geometria ferroviaria) + distanza del modello',
    lastVerified: null,
  },
  isonzo: {
    lat: 45.642646,
    lon: 9.141611,
    osmNodeId: 30951289,
    verification: 'verified',
    source: 'OpenStreetMap · Corso Isonzo',
    lastVerified: VERIFIED_ON,
  },
  manzoni: {
    lat: 45.645834,
    lon: 9.140901,
    osmNodeId: 2064649464,
    verification: 'verified',
    source: 'OpenStreetMap · Via Alessandro Manzoni',
    lastVerified: VERIFIED_ON,
  },
  montello: {
    lat: 45.650838,
    lon: 9.140226,
    verification: 'estimated',
    source: 'OSM (geometria ferroviaria) + distanza del modello',
    lastVerified: null,
  },
  brennero: {
    lat: 45.656075,
    lon: 9.139669,
    osmNodeId: 394934094,
    verification: 'verified',
    source: 'OpenStreetMap · Via Brennero',
    lastVerified: VERIFIED_ON,
  },
  farga: {
    lat: 45.657341,
    lon: 9.148772,
    verification: 'estimated',
    source: 'OSM (geometria ferroviaria) + distanza del modello',
    lastVerified: null,
  },
  sancarlo: {
    lat: 45.660278,
    lon: 9.155095,
    verification: 'estimated',
    source: 'OSM (geometria ferroviaria) + distanza del modello',
    lastVerified: null,
  },
});

/** Posizione della stazione di Seveso (nodo OSM railway=station). */
export const STATION_GEO = Object.freeze({
  lat: 45.6483174,
  lon: 9.1401838,
  name: 'Seveso',
  osmNodeId: 3389522930,
});

/** Etichette leggibili per lo stato di verifica. */
export const VERIFICATION_LABELS = Object.freeze({
  verified: 'Posizione verificata su OpenStreetMap',
  estimated: 'Posizione stimata · da verificare',
});
