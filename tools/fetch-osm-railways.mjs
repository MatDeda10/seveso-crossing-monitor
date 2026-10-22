/**
 * Rigenera `public/geo/railways.geojson` dai dati OpenStreetMap.
 *
 * Uso: `node tools/fetch-osm-railways.mjs`
 *
 * Perche' non Overpass: da molte reti l'istanza pubblica di Overpass e' lenta o
 * in timeout. L'API "map" di OSM copre un'area piccola e va interrogata a
 * riquadri (limite ~0,25 gradi quadri e ~50.000 nodi per richiesta), quindi qui
 * scarichiamo una griglia di riquadri intorno a Seveso.
 *
 * Rispetta la policy OSM: nessun uso massivo, User-Agent identificativo, una
 * sola esecuzione quando serve aggiornare la geometria. I dati derivati sono
 * © OpenStreetMap contributors, licenza ODbL.
 */

import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'public', 'geo', 'railways.geojson');

/** Riquadri [minLon, minLat, maxLon, maxLat] intorno a Seveso. */
const TILES = [
  [9.11, 45.62, 9.14, 45.64],
  [9.14, 45.62, 9.17, 45.64],
  [9.11, 45.64, 9.14, 45.66],
  [9.14, 45.64, 9.17, 45.66],
  [9.11, 45.66, 9.14, 45.68],
  [9.14, 45.66, 9.17, 45.68],
];

const USER_AGENT = 'seveso-crossing-monitor/1.1 (aggiornamento geometria ferroviaria)';
const API = 'https://api.openstreetmap.org/api/0.6/map';

const tagRe = /<tag k="([^"]+)" v="([^"]*)"\/>/g;

const parseTags = (block) => {
  const tags = {};
  for (const match of block.matchAll(tagRe)) tags[match[1]] = match[2];
  return tags;
};

const download = async ([minLon, minLat, maxLon, maxLat]) => {
  const url = `${API}?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}`;
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} su ${url}`);
  return response.text();
};

const nodes = new Map();
const ways = new Map();
let crossings = 0;

for (const tile of TILES) {
  const label = tile.join(',');
  process.stdout.write(`Scarico ${label} … `);
  const xml = await download(tile);
  console.log(`${Math.round(xml.length / 1024)} KB`);

  for (const match of xml.matchAll(/<node\b([^>]*?)\/>/g)) {
    const id = /id="(-?\d+)"/.exec(match[1])?.[1];
    const lat = Number(/lat="([\d.-]+)"/.exec(match[1])?.[1]);
    const lon = Number(/lon="([\d.-]+)"/.exec(match[1])?.[1]);
    if (id && Number.isFinite(lat) && Number.isFinite(lon) && !nodes.has(id)) {
      nodes.set(id, { id, lat, lon });
    }
  }

  for (const match of xml.matchAll(/<node\b([^>]*)>([\s\S]*?)<\/node>/g)) {
    const id = /id="(-?\d+)"/.exec(match[1])?.[1];
    const lat = Number(/lat="([\d.-]+)"/.exec(match[1])?.[1]);
    const lon = Number(/lon="([\d.-]+)"/.exec(match[1])?.[1]);
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const tags = parseTags(match[2]);
    nodes.set(id, { id, lat, lon, tags });
    if (tags.railway === 'level_crossing') crossings += 1;
  }

  for (const match of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const id = /id="(-?\d+)"/.exec(match[1])?.[1];
    if (!id || ways.has(id)) continue;
    const tags = parseTags(match[2]);
    if (tags.railway !== 'rail' && tags.railway !== 'light_rail') continue;
    const refs = [...match[2].matchAll(/<nd ref="(-?\d+)"\/>/g)].map((item) => item[1]);
    if (refs.length < 2) continue;
    ways.set(id, { id, tags, refs });
  }
}

const features = [];
for (const way of ways.values()) {
  const coordinates = way.refs
    .map((ref) => nodes.get(ref))
    .filter(Boolean)
    .map((node) => [Number(node.lon.toFixed(6)), Number(node.lat.toFixed(6))]);
  if (coordinates.length < 2) continue;

  features.push({
    type: 'Feature',
    properties: {
      id: way.id,
      name: way.tags.name ?? null,
      usage: way.tags.usage ?? null,
      service: way.tags.service ?? null,
      electrified: way.tags.electrified ?? null,
      gauge: way.tags.gauge ?? null,
      maxspeed: way.tags.maxspeed ?? null,
    },
    geometry: { type: 'LineString', coordinates },
  });
}

await writeFile(OUT, JSON.stringify({ type: 'FeatureCollection', features }), 'utf8');

console.log(`\nNodi: ${nodes.size}`);
console.log(`Passaggi a livello nell'area: ${crossings}`);
console.log(`Linee ferroviarie: ${features.length} → ${OUT}`);
