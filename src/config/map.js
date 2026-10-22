/**
 * Configurazione della mappa.
 *
 * Provider di tile: OpenFreeMap (https://openfreemap.org) — stile vettoriale
 * completo, nessuna chiave API, nessuna registrazione, nessuna carta di
 * credito. I dati derivano da OpenStreetMap (ODbL) ed è possibile sostituire
 * lo stile con `VITE_MAP_STYLE_URL` (anche un tile server self-hosted).
 *
 * Nota: NON usiamo tile.openstreetmap.org per la produzione. Il server
 * pubblico OSM è volontario e la relativa politica d'uso non copre un'app
 * distribuita con traffico continuativo.
 */

const env = import.meta.env ?? {};

export const MAP_CONFIG = Object.freeze({
  styleUrl: env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty',

  /** Centro: stazione di Seveso. */
  center: Object.freeze({ lon: 9.1401838, lat: 45.6483174 }),
  zoom: 15.1,
  pitch: 55,
  bearing: -18,
  minZoom: 12.5,
  maxZoom: 19,

  /** GeoJSON delle linee ferroviarie (generato da OSM, vedi tools/fetch-osm-railways.mjs). */
  railwaysUrl: `${env.BASE_URL ?? '/'}geo/railways.geojson`,

  attribution:
    'Dati mappa © OpenStreetMap contributors · tile OpenFreeMap · sbarre: stima, non fonte ufficiale',
});
