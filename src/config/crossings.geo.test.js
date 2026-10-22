import { describe, expect, it } from 'vitest';
import { CROSSING_GEO, STATION_GEO, VERIFICATION_LABELS } from './crossings.geo';
import { CROSSINGS_CONFIG } from './topology';

/**
 * Questi test difendono il vincolo piu' importante del catalogo geografico:
 * sulla mappa non devono comparire coordinate inventate o non tracciabili.
 */
describe('catalogo geografico dei passaggi a livello', () => {
  it('copre tutti i passaggi presenti nella topologia', () => {
    for (const crossing of CROSSINGS_CONFIG) {
      expect(CROSSING_GEO[crossing.id], `manca la geo per ${crossing.id}`).toBeDefined();
    }
  });

  it('non contiene passaggi sconosciuti alla topologia', () => {
    const known = new Set(CROSSINGS_CONFIG.map((crossing) => crossing.id));
    for (const id of Object.keys(CROSSING_GEO)) {
      expect(known.has(id), `${id} non e' nella topologia`).toBe(true);
    }
  });

  it('ha coordinate dentro l\'area di Seveso e dintorni', () => {
    for (const [id, geo] of Object.entries(CROSSING_GEO)) {
      expect(geo.lat, id).toBeGreaterThan(45.6);
      expect(geo.lat, id).toBeLessThan(45.68);
      expect(geo.lon, id).toBeGreaterThan(9.1);
      expect(geo.lon, id).toBeLessThan(9.18);
    }
  });

  it('dichiara una verifica nota per ogni posizione', () => {
    for (const [id, geo] of Object.entries(CROSSING_GEO)) {
      expect(VERIFICATION_LABELS[geo.verification], id).toBeDefined();
    }
  });

  it('le posizioni verificate citano il nodo OSM e la data del controllo', () => {
    for (const [id, geo] of Object.entries(CROSSING_GEO)) {
      if (geo.verification !== 'verified') continue;
      expect(Number.isInteger(geo.osmNodeId), id).toBe(true);
      expect(geo.osmNodeId, id).toBeGreaterThan(0);
      expect(geo.lastVerified, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('le posizioni stimate non fingono un nodo OSM', () => {
    for (const [id, geo] of Object.entries(CROSSING_GEO)) {
      if (geo.verification !== 'estimated') continue;
      expect(geo.osmNodeId, id).toBeUndefined();
      expect(geo.lastVerified, id).toBeNull();
    }
  });

  it('la stazione ha coordinate coerenti con la mappa', () => {
    expect(STATION_GEO.lat).toBeCloseTo(45.6483, 3);
    expect(STATION_GEO.lon).toBeCloseTo(9.1402, 3);
  });
});
