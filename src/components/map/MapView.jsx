import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_CONFIG } from '../../config/map';
import { STATION_GEO } from '../../config/crossings.geo';

const TONE_CLASS = {
  red: 'tone-red',
  yellow: 'tone-yellow',
  blue: 'tone-blue',
  green: 'tone-green',
  gray: 'tone-gray',
};

const isDesktop = () => window.matchMedia('(min-width: 900px)').matches;

/** Evita di inizializzare MapLibre su dispositivi senza WebGL. */
const supportsWebGL = () => {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
};

/** Aggiunge la rete ferroviaria come overlay vettoriale sopra lo stile base. */
const addRailways = (map) => {
  if (map.getSource('railways')) return;

  map.addSource('railways', { type: 'geojson', data: MAP_CONFIG.railwaysUrl });

  map.addLayer({
    id: 'railway-casing',
    type: 'line',
    source: 'railways',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#0b1526',
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 15, 7, 18, 14],
      'line-opacity': 0.32,
    },
  });

  map.addLayer({
    id: 'railway-core',
    type: 'line',
    source: 'railways',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#ffffff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.4, 15, 4.4, 18, 9],
    },
  });

  map.addLayer({
    id: 'railway-dash',
    type: 'line',
    source: 'railways',
    layout: { 'line-join': 'round', 'line-cap': 'butt' },
    paint: {
      'line-color': '#0f172a',
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 15, 1.7, 18, 2.6],
      'line-dasharray': [2, 3],
      'line-opacity': 0.9,
    },
  });
};

const addStation = (map) => {
  const el = document.createElement('div');
  el.className = 'station-marker';
  el.innerHTML = '<span class="station-icon" aria-hidden="true">▣</span><span class="station-label">Stazione di Seveso</span>';

  new maplibregl.Marker({ element: el, anchor: 'bottom' })
    .setLngLat([STATION_GEO.lon, STATION_GEO.lat])
    .addTo(map);
};

/**
 * Mappa MapLibre in stile navigatore.
 *
 * - vista 3D con edifici estrusi (lo stile contiene `building-3d`);
 * - rete ferroviaria evidenziata;
 * - marker HTML per i passaggi a livello, colorati per stato;
 * - i marker sono aggiornati senza essere ricreati, così il polling non fa
 *   "lampeggiare" la mappa.
 */
const MapView = ({ crossings, selectedId, onSelect, is3d, resetSignal }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const crossingsRef = useRef(crossings);
  const onSelectRef = useRef(onSelect);
  const [failure, setFailure] = useState(null);
  const [webglOk] = useState(() => supportsWebGL());

  useEffect(() => {
    crossingsRef.current = crossings;
  }, [crossings]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!webglOk || !containerRef.current || mapRef.current) return undefined;

    let map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_CONFIG.styleUrl,
        center: [MAP_CONFIG.center.lon, MAP_CONFIG.center.lat],
        zoom: MAP_CONFIG.zoom,
        pitch: MAP_CONFIG.pitch,
        bearing: MAP_CONFIG.bearing,
        minZoom: MAP_CONFIG.minZoom,
        maxZoom: MAP_CONFIG.maxZoom,
        maxPitch: 78,
        antialias: true,
        attributionControl: false,
      });
    } catch (error) {
      console.error('[mappa] inizializzazione fallita', error);
      window.setTimeout(() => setFailure('La mappa 3D non è disponibile su questo dispositivo.'), 0);
      return undefined;
    }

    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 80, unit: 'metric' }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    const loadTimeout = window.setTimeout(() => {
      if (!map.loaded()) {
        setFailure('Impossibile caricare le tile della mappa. Controlla la connessione e riprova.');
      }
    }, 20_000);

    map.on('load', () => {
      window.clearTimeout(loadTimeout);
      setFailure(null);

      try {
        map.setSky({
          'sky-color': '#a8cbf5',
          'horizon-color': '#edf4fd',
          'fog-color': '#dde8f6',
          'sky-horizon-blend': 0.5,
          'horizon-fog-blend': 0.4,
          'fog-ground-blend': 0.2,
          'atmosphere-blend': 0.65,
        });
      } catch {
        /* stile senza supporto sky: nessun problema */
      }

      addRailways(map);
      addStation(map);
    });

    map.on('error', (event) => {
      // Errori di tile singole: non sono fatali, li logghiamo soltanto.
      console.warn('[mappa]', event?.error?.message ?? event);
    });

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    const markers = markersRef.current;

    return () => {
      window.clearTimeout(loadTimeout);
      observer.disconnect();
      markers.forEach(({ marker }) => marker.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [webglOk]);

  // Marker: creazione alla prima comparsa, aggiornamento di classe/etichetta
  // a ogni polling senza ricreare l'elemento.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const alive = new Set();

    for (const crossing of crossings) {
      const geo = crossing.geo;
      if (!geo) continue;
      alive.add(crossing.id);

      let entry = markersRef.current.get(crossing.id);
      if (!entry) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'map-marker';
        el.innerHTML =
          '<span class="map-marker-ring" aria-hidden="true"></span>' +
          '<span class="map-marker-dot" aria-hidden="true"></span>' +
          '<span class="map-marker-label"></span>';
        el.addEventListener('click', (event) => {
          event.stopPropagation();
          onSelectRef.current?.(crossing.id);
        });

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([geo.lon, geo.lat])
          .addTo(map);

        entry = { marker, el };
        markersRef.current.set(crossing.id, entry);
      } else {
        entry.marker.setLngLat([geo.lon, geo.lat]);
      }

      const { el, marker } = entry;
      const tone = TONE_CLASS[crossing.color] ?? 'tone-gray';
      el.className = [
        'map-marker',
        tone,
        crossing.verification === 'estimated' ? 'is-estimated' : '',
        crossing.id === selectedId ? 'is-selected' : '',
        crossing.status === 'CHIUSO' || crossing.status === 'IN CHIUSURA' ? 'is-closing' : '',
      ]
        .filter(Boolean)
        .join(' ');
      el.setAttribute(
        'aria-label',
        `${crossing.name}: ${crossing.status}${
          crossing.verification === 'estimated' ? ', posizione stimata' : ''
        }`,
      );
      const label = el.querySelector('.map-marker-label');
      if (label) label.textContent = crossing.name;
      marker.getElement().style.zIndex = crossing.id === selectedId ? '50' : '';
    }

    for (const [id, entry] of markersRef.current) {
      if (!alive.has(id)) {
        entry.marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [crossings, selectedId]);

  // Centra il passaggio selezionato (solo quando cambia la selezione).
  useEffect(() => {
    if (!selectedId) return;
    const map = mapRef.current;
    const target = crossingsRef.current.find((crossing) => crossing.id === selectedId);
    if (!map || !target?.geo) return;

    map.flyTo({
      center: [target.geo.lon, target.geo.lat],
      zoom: Math.max(map.getZoom(), 16.3),
      pitch: is3d ? 55 : 0,
      offset: isDesktop() ? [150, 40] : [0, -140],
      duration: 900,
      essential: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // 3D ↔ 2D.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ pitch: is3d ? MAP_CONFIG.pitch : 0, duration: 700 });
  }, [is3d]);

  // Pulsante "vista iniziale".
  useEffect(() => {
    if (!resetSignal) return;
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [MAP_CONFIG.center.lon, MAP_CONFIG.center.lat],
      zoom: MAP_CONFIG.zoom,
      pitch: is3d ? MAP_CONFIG.pitch : 0,
      bearing: MAP_CONFIG.bearing,
      duration: 900,
    });
  }, [resetSignal, is3d]);

  const failureMessage = webglOk
    ? failure
    : 'Questo browser non supporta WebGL, necessario per la mappa 3D.';

  return (
    <div className="map-wrap">
      <div className="map-canvas" ref={containerRef} />

      {failureMessage && (
        <div className="map-failure" role="status">
          <strong>Mappa non disponibile</strong>
          <p>{failureMessage}</p>
          <p>Gli stati dei passaggi restano consultabili nell’elenco.</p>
        </div>
      )}
    </div>
  );
};

export default MapView;
