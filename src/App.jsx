import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import CrossingCard from './components/CrossingCard';
import TrainCard from './components/TrainCard';
import MapView from './components/map/MapView';
import CrossingDetail from './components/map/CrossingDetail';
import { CROSSING_GEO } from './config/crossings.geo';
import { RUNTIME } from './config/runtime';
import { CROSSINGS_CONFIG, SIDE_LABELS, SIDES } from './config/topology';
import { WINDOWS } from './config/windows';
import { buildTrains, predictCrossings } from './engine/predictionEngine';
import { useClock } from './hooks/useClock';
import { useLogs } from './hooks/useLogs';
import { useTrainData } from './hooks/useTrainData';
import { formatClock, formatDuration, formatRelative } from './utils/timeFormat';

const TABS = [
  { id: 'passaggi', label: 'Passaggi' },
  { id: 'treni', label: 'Treni' },
  { id: 'log', label: 'Log' },
];

const CLOSED_STATUSES = new Set(['CHIUSO', 'IN CHIUSURA']);
const UNKNOWN_STATUSES = new Set(['INCERTO', 'OFFLINE']);

const readFlag = (key, fallback = false) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
};

const isDesktopViewport = () => window.matchMedia('(min-width: 900px)').matches;

function App() {
  const [activeTab, setActiveTab] = useState('passaggi');
  const [showPassed, setShowPassed] = useState(() => readFlag(RUNTIME.storageKeys.showPassed));
  const [is3d, setIs3d] = useState(true);
  const [panelOpen, setPanelOpen] = useState(isDesktopViewport);
  const [selectedId, setSelectedId] = useState(null);
  const [resetSignal, setResetSignal] = useState(0);

  const { logs, addLog, clearLogs } = useLogs();
  const { data, refresh } = useTrainData({ addLog });
  const nowMs = useClock();

  useEffect(() => {
    try {
      localStorage.setItem(RUNTIME.storageKeys.showPassed, showPassed ? '1' : '0');
    } catch {
      /* storage non disponibile */
    }
  }, [showPassed]);

  const { trains, stats } = useMemo(
    () => buildTrains({ arrivals: data.arrivals, departures: data.departures }),
    [data.arrivals, data.departures],
  );

  const syncAgeMs = data.fetchedAt ? nowMs - data.fetchedAt : Number.POSITIVE_INFINITY;

  const { crossings } = useMemo(
    () =>
      predictCrossings({
        trains,
        crossings: CROSSINGS_CONFIG,
        nowMs,
        syncAgeMs,
        dataState: data.dataState,
      }),
    [trains, nowMs, syncAgeMs, data.dataState],
  );

  /** Unisce stato previsto e coordinate/provenienza del catalogo. */
  const mapCrossings = useMemo(
    () =>
      crossings.map((crossing) => {
        const geo = CROSSING_GEO[crossing.id] ?? null;
        return {
          ...crossing,
          geo,
          verification: geo?.verification ?? 'estimated',
        };
      }),
    [crossings],
  );

  const selected = useMemo(
    () => mapCrossings.find((crossing) => crossing.id === selectedId) ?? null,
    [mapCrossings, selectedId],
  );

  const groupedCrossings = useMemo(() => {
    const groups = new Map(Object.values(SIDES).map((side) => [side, []]));
    mapCrossings.forEach((crossing) => groups.get(crossing.side)?.push(crossing));
    return [...groups.entries()].filter(([, list]) => list.length > 0);
  }, [mapCrossings]);

  const { upcoming, passed } = useMemo(() => {
    const cutoff = nowMs - WINDOWS.trainList.keepPastMs;
    const horizon = nowMs + WINDOWS.trainList.horizonMs;
    return {
      upcoming: trains
        .filter((train) => train.stationTs >= cutoff && train.stationTs <= horizon)
        .sort((a, b) => a.stationTs - b.stationTs),
      passed: trains
        .filter((train) => train.stationTs < cutoff)
        .sort((a, b) => b.stationTs - a.stationTs),
    };
  }, [trains, nowMs]);

  const summary = useMemo(() => {
    const closed = mapCrossings.filter((crossing) => CLOSED_STATUSES.has(crossing.status));
    const alerting = mapCrossings.filter((crossing) => crossing.status === 'PREALLERTA');
    const unknown = mapCrossings.filter((crossing) => UNKNOWN_STATUSES.has(crossing.status));
    const open = mapCrossings.filter((crossing) => crossing.status === 'APERTO');

    const nextClosing = mapCrossings
      .filter((crossing) => !CLOSED_STATUSES.has(crossing.status) && crossing.closesInSec !== null)
      .sort((a, b) => a.closesInSec - b.closesInSec)[0];

    const reopenAt = closed.reduce(
      (latest, crossing) =>
        crossing.windowTo && (!latest || crossing.windowTo > latest) ? crossing.windowTo : latest,
      null,
    );

    return {
      closed: closed.length,
      alerting: alerting.length,
      unknown: unknown.length,
      open: open.length,
      nextClosing: nextClosing ?? null,
      reopenAt,
      total: mapCrossings.length,
    };
  }, [mapCrossings]);

  const indicatorClass = useMemo(() => {
    if (!data.fetchedAt || syncAgeMs > WINDOWS.staleHardMs) return 'offline';
    if (data.dataState === 'timetable' || data.dataState === 'cached') return 'stale';
    if (syncAgeMs > WINDOWS.liveIndicatorMs) return 'stale';
    return 'live';
  }, [data.fetchedAt, data.dataState, syncAgeMs]);

  const isInitialLoading = !data.fetchedAt && data.dataState === 'offline' && !data.error;

  const overall = useMemo(() => {
    if (isInitialLoading) {
      return { tone: 'muted', label: 'Caricamento dati…', hint: 'Connessione ai sistemi ferroviari' };
    }

    if (indicatorClass === 'offline' || summary.unknown === summary.total) {
      return { tone: 'muted', label: 'Dati non disponibili', hint: 'Nessuno stato affidabile' };
    }

    if (summary.closed > 0) {
      const allEstimated = mapCrossings
        .filter((crossing) => CLOSED_STATUSES.has(crossing.status))
        .every((crossing) => crossing.isUncertain);

      if (allEstimated) {
        return {
          tone: 'warning',
          label: summary.closed === 1 ? '1 chiusura stimata' : `${summary.closed} chiusure stimate`,
          hint: 'Percorso del treno da verificare',
        };
      }

      return {
        tone: 'danger',
        label: summary.closed === 1 ? '1 chiusura in corso' : `${summary.closed} chiusure in corso`,
        hint: summary.reopenAt
          ? `Riapertura stimata verso le ${formatClock(summary.reopenAt)}`
          : 'Attendi la riapertura',
      };
    }

    if (summary.alerting > 0) {
      return {
        tone: 'warning',
        label: summary.alerting === 1 ? 'Treno in avvicinamento' : 'Treni in avvicinamento',
        hint: 'Possibile chiusura imminente',
      };
    }

    return {
      tone: 'ok',
      label: 'Tutti probabilmente aperti',
      hint: summary.nextClosing
        ? `Prossima chiusura tra ${formatDuration(summary.nextClosing.closesInSec)} · ${summary.nextClosing.name}`
        : 'Nessun transito previsto',
    };
  }, [indicatorClass, summary, isInitialLoading, mapCrossings]);

  const dataNotice = useMemo(() => {
    if (isInitialLoading) return null;
    if (data.dataState === 'offline') {
      return {
        level: 'error',
        title: 'Dati non disponibili',
        text: 'Nessun proxy raggiungibile e nessun dato salvato utilizzabile. Dettagli nella scheda Log.',
      };
    }
    return null;
  }, [data.dataState, isInitialLoading]);

  const handleSelect = useCallback((id) => {
    setSelectedId(id);
    if (!isDesktopViewport()) setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setSelectedId(null);
  }, []);

  const exportLogs = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      dataState: data.dataState,
      transport: data.transport,
      fetchedAt: data.fetchedAt ? new Date(data.fetchedAt).toISOString() : null,
      error: data.error,
      stats,
      crossings: mapCrossings.map((crossing) => ({
        id: crossing.id,
        status: crossing.status,
        confidence: crossing.confidence,
        reason: crossing.reason,
        verification: crossing.verification,
        geo: crossing.geo ? { lat: crossing.geo.lat, lon: crossing.geo.lon, osmNodeId: crossing.geo.osmNodeId ?? null } : null,
      })),
      rawResponses: { arrivals: data.arrivals, departures: data.departures },
      logs,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `seveso-monitor-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    addLog('Diagnostica esportata', 'info');
  }, [data, stats, mapCrossings, logs, addLog]);

  return (
    <div className="app">
      <MapView
        crossings={mapCrossings}
        selectedId={selectedId}
        onSelect={handleSelect}
        is3d={is3d}
        resetSignal={resetSignal}
      />

      <header className="hud hud-top">
        <div className="hud-brand">
          <span className={`live-dot ${indicatorClass}`} aria-hidden="true" />
          <div className="hud-brand-text">
            <strong>{RUNTIME.stationName}</strong>
            <span>Passaggi a livello · mappa 3D</span>
          </div>
        </div>

        <div className="hud-actions">
          <span className="clock">{formatClock(nowMs)}</span>
          <button type="button" className="hud-button" onClick={refresh} aria-label="Aggiorna i dati" title="Aggiorna i dati">
            ↻
          </button>
          <button
            type="button"
            className={`hud-button panel-toggle ${panelOpen ? 'is-active' : ''}`}
            onClick={() => (panelOpen && isDesktopViewport() ? closePanel() : setPanelOpen((value) => !value))}
            aria-label={panelOpen ? 'Chiudi pannello' : 'Apri elenco passaggi'}
            aria-expanded={panelOpen}
          >
            ☰
          </button>
        </div>
      </header>

      <div className="map-tools">
        <button
          type="button"
          className={`map-tool ${is3d ? 'is-active' : ''}`}
          onClick={() => setIs3d((value) => !value)}
          aria-pressed={is3d}
          title={is3d ? 'Passa alla vista dall’alto' : 'Passa alla vista 3D'}
        >
          {is3d ? '3D' : '2D'}
        </button>
        <button
          type="button"
          className="map-tool"
          onClick={() => setResetSignal((value) => value + 1)}
          title="Torna alla vista iniziale"
          aria-label="Torna alla vista iniziale"
        >
          ⌖
        </button>
      </div>

      <aside
        className={`panel ${panelOpen ? 'is-open' : ''}`}
        aria-label="Pannello informazioni"
        inert={!panelOpen}
      >
        <div className="panel-head">
          <div>
            <span className="panel-eyebrow">Stato attuale</span>
            <h1 className={`panel-title tone-${overall.tone}`}>{overall.label}</h1>
            <p className="panel-hint">{overall.hint}</p>
          </div>
          <button type="button" className="panel-close" onClick={closePanel} aria-label="Chiudi pannello">
            ✕
          </button>
        </div>

        <div className="stat-row">
          <div className="stat">
            <span className="stat-value">{summary.closed}</span>
            <span className="stat-label">chiusi</span>
          </div>
          <div className="stat">
            <span className="stat-value">{summary.alerting}</span>
            <span className="stat-label">in arrivo</span>
          </div>
          <div className="stat">
            <span className="stat-value">{summary.open}</span>
            <span className="stat-label">aperti</span>
          </div>
          <div className="stat">
            <span className="stat-value">{summary.unknown}</span>
            <span className="stat-label">incerti</span>
          </div>
        </div>

        <p className="sync-line">
          <span className={`sync-dot ${indicatorClass}`} aria-hidden="true" />
          {data.source === 'timetable'
            ? 'Orario ufficiale · senza ritardi in tempo reale'
            : data.fetchedAt
              ? `Aggiornato ${formatRelative(data.fetchedAt, nowMs)}`
              : 'In attesa del primo dato'}
          {data.source === 'cache' ? ' · ultimo dato salvato' : ''}
          {data.source === 'network' && data.transport ? ` · ${data.transport}` : ''}
        </p>

        {dataNotice && (
          <div className={`data-notice ${dataNotice.level}`} role="status">
            <strong>{dataNotice.title}</strong>
            <span>{dataNotice.text}</span>
          </div>
        )}

        <nav className="tab-bar" role="tablist" aria-label="Sezioni">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedId(null);
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="panel-body">
          {selected ? (
            <CrossingDetail crossing={selected} onClose={() => setSelectedId(null)} nowMs={nowMs} />
          ) : (
            <>
              {activeTab === 'passaggi' && (
                <div className="view-content" role="tabpanel" id="panel-passaggi" aria-labelledby="tab-passaggi">
                  <div className="legend">
                    <span className="legend-item"><i className="legend-dot tone-green" /> aperto</span>
                    <span className="legend-item"><i className="legend-dot tone-blue" /> imminente</span>
                    <span className="legend-item"><i className="legend-dot tone-yellow" /> in chiusura</span>
                    <span className="legend-item"><i className="legend-dot tone-red" /> chiuso</span>
                    <span className="legend-item"><i className="legend-dot tone-gray" /> incerto</span>
                  </div>

                  {isInitialLoading ? (
                    <div className="skeleton-list" aria-hidden="true">
                      <div className="skeleton-card" />
                      <div className="skeleton-card" />
                      <div className="skeleton-card" />
                    </div>
                  ) : (
                    groupedCrossings.map(([side, list]) => (
                      <section key={side} className="side-group">
                        <div className="section-label">
                          <span>{SIDE_LABELS[side]}</span>
                          <span className="section-count">{list.length}</span>
                        </div>
                        {list.map((crossing) => (
                          <CrossingCard
                            key={crossing.id}
                            crossing={crossing}
                            onSelect={handleSelect}
                            isSelected={crossing.id === selectedId}
                          />
                        ))}
                      </section>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'treni' && (
                <div className="view-content" role="tabpanel" id="panel-treni" aria-labelledby="tab-treni">
                  <div className="list-header">
                    <span className="mini-label">IN ARRIVO / IN TRANSITO ({upcoming.length})</span>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={showPassed}
                        onChange={(event) => setShowPassed(event.target.checked)}
                      />
                      Mostra transitati
                    </label>
                  </div>

                  {upcoming.length === 0 && (
                    <p className="empty-state">
                      Nessun treno nel range di dati ricevuto. Se l’orario è di notte è normale; se è
                      giorno controlla la sezione Log.
                    </p>
                  )}

                  {upcoming.map((train) => (
                    <TrainCard key={train.id} train={train} nowMs={nowMs} />
                  ))}

                  {showPassed && passed.length > 0 && (
                    <>
                      <div className="section-label">
                        <span>Transitati</span>
                        <span className="section-count">{passed.length}</span>
                      </div>
                      {passed.map((train) => (
                        <TrainCard key={`passed-${train.id}`} train={train} nowMs={nowMs} />
                      ))}
                    </>
                  )}
                </div>
              )}

              {activeTab === 'log' && (
                <div className="view-content" role="tabpanel" id="panel-log" aria-labelledby="tab-log">
                  <div className="list-header">
                    <span className="mini-label">DIAGNOSTICA E LOG</span>
                    <span className="log-actions">
                      <button type="button" onClick={exportLogs}>
                        Esporta
                      </button>
                      <button type="button" onClick={clearLogs}>
                        Pulisci
                      </button>
                    </span>
                  </div>

                  <dl className="diagnostics">
                    <div>
                      <dt>Stato dati</dt>
                      <dd>{data.dataState}</dd>
                    </div>
                    <div>
                      <dt>Transport</dt>
                      <dd>{data.transport ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Record ricevuti</dt>
                      <dd>{stats.records}</dd>
                    </div>
                    <div>
                      <dt>Treni unici</dt>
                      <dd>{stats.unique}</dd>
                    </div>
                    <div>
                      <dt>Duplicati arrivi/partenze</dt>
                      <dd>{stats.duplicatedRecords}</dd>
                    </div>
                    <div>
                      <dt>Treni senza orario</dt>
                      <dd>{stats.withoutTime}</dd>
                    </div>
                    <div>
                      <dt>Corse soppresse</dt>
                      <dd>{stats.suppressed}</dd>
                    </div>
                  </dl>

                  {data.error && <p className="log-error">{data.error}</p>}

                  <div className="log-page">
                    {logs.length === 0 && <p className="empty-state">Nessun evento registrato.</p>}
                    {logs.map((log) => (
                      <div key={log.id} className={`log-entry ${log.level}`}>
                        <span className="log-time">{new Date(log.ts).toLocaleTimeString('it-IT')}</span>
                        {log.msg}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="panel-foot">
          Stima non ufficiale, non è un dispositivo di sicurezza.
        </footer>
      </aside>

      <button
        type="button"
        className="mobile-summary"
        onClick={() => setPanelOpen(true)}
        aria-label="Apri elenco e stato dei passaggi a livello"
      >
        <span className="summary-text">
          <strong className={`tone-${overall.tone}`}>{overall.label}</strong>
          <span>{overall.hint}</span>
        </span>
        <span className="summary-counts" aria-hidden="true">
          <span className="count-closed">{summary.closed}</span>
          <span className="count-unknown">{summary.unknown}</span>
          <span className="count-open">{summary.open}</span>
        </span>
      </button>

      <p className="sr-only" aria-live="polite">
        {summary.closed} passaggi probabilmente chiusi su {summary.total}.
      </p>
    </div>
  );
}

export default App;
