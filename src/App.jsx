import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import CrossingCard from './components/CrossingCard';
import Disclaimer from './components/Disclaimer';
import TrainCard from './components/TrainCard';
import { RUNTIME, hasConfiguredProxy } from './config/runtime';
import { CROSSINGS_CONFIG, SIDE_LABELS, SIDES } from './config/topology';
import { WINDOWS } from './config/windows';
import { buildTrains, predictCrossings } from './engine/predictionEngine';
import { useClock } from './hooks/useClock';
import { useLogs } from './hooks/useLogs';
import { useTrainData } from './hooks/useTrainData';
import { formatClock, formatRelative } from './utils/timeFormat';

const TABS = [
  { id: 'viabilita', label: 'Passaggi' },
  { id: 'treni', label: 'Treni' },
  { id: 'log', label: 'Log' },
];

const readFlag = (key, fallback = false) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
};

function App() {
  const [activeTab, setActiveTab] = useState('viabilita');
  const [showPassed, setShowPassed] = useState(() => readFlag(RUNTIME.storageKeys.showPassed));

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

  const groupedCrossings = useMemo(() => {
    const groups = new Map(Object.values(SIDES).map((side) => [side, []]));
    crossings.forEach((crossing) => groups.get(crossing.side)?.push(crossing));
    return [...groups.entries()].filter(([, list]) => list.length > 0);
  }, [crossings]);

  const { upcoming, passed } = useMemo(() => {
    const cutoff = nowMs - WINDOWS.trainList.keepPastMs;
    const horizon = nowMs + WINDOWS.trainList.horizonMs;
    return {
      upcoming: trains
        .filter((t) => t.stationTs >= cutoff && t.stationTs <= horizon)
        .sort((a, b) => a.stationTs - b.stationTs),
      passed: trains.filter((t) => t.stationTs < cutoff).sort((a, b) => b.stationTs - a.stationTs),
    };
  }, [trains, nowMs]);

  const closedCount = crossings.filter((c) => c.status === 'CHIUSO' || c.status === 'IN CHIUSURA').length;

  const indicatorClass = useMemo(() => {
    if (!data.fetchedAt || syncAgeMs > WINDOWS.staleHardMs) return 'offline';
    if (data.dataState === 'timetable' || data.dataState === 'cached') return 'stale';
    if (syncAgeMs > WINDOWS.liveIndicatorMs) return 'stale';
    return 'live';
  }, [data.fetchedAt, data.dataState, syncAgeMs]);

  /**
   * Un solo punto per spiegare all'utente DA DOVE vengono i dati quando non
   * sono in tempo reale: un monitor che mostra numeri senza dire che sono
   * teorici e' peggio di un monitor che si dichiara degradato.
   */
  const dataNotice = useMemo(() => {
    if (data.dataState === 'timetable') {
      return {
        level: 'warn',
        title: 'Orario teorico',
        text: 'Dati in tempo reale non raggiungibili: le chiusure sono stimate dall’orario ufficiale e non includono i ritardi del giorno. Attendibilità ridotta.',
      };
    }

    if (data.dataState === 'cached') {
      return {
        level: 'warn',
        title: 'Dati non aggiornati',
        text: `Ultimo contatto riuscito ${formatRelative(data.fetchedAt, nowMs)}. Le stime si basano su quei dati.`,
      };
    }

    if (data.dataState === 'offline') {
      return {
        level: 'error',
        title: 'Dati non disponibili',
        text: hasConfiguredProxy
          ? 'Il proxy configurato non risponde e non c’è un dato salvato utilizzabile. Dettagli nella scheda Log.'
          : 'Nessun proxy configurato e nessun ripiego pubblico utilizzabile. Pubblica il Worker (istruzioni nel README) e imposta VITE_PROXY_URL.',
      };
    }

    return null;
  }, [data.dataState, data.fetchedAt, nowMs]);

  const exportLogs = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      dataState: data.dataState,
      transport: data.transport,
      fetchedAt: data.fetchedAt ? new Date(data.fetchedAt).toISOString() : null,
      error: data.error,
      stats,
      crossings: crossings.map((c) => ({
        id: c.id,
        status: c.status,
        confidence: c.confidence,
        reason: c.reason,
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
  }, [data, stats, crossings, logs, addLog]);

  return (
    <div className="app-shell">
      <div className="app-card">
        <header className="main-header">
          <div className="status-bar">
            <span className={`indicator ${indicatorClass}`} aria-hidden="true" />
            <span className="station-label">
              {RUNTIME.stationName.toUpperCase()} · {formatClock(nowMs)}
            </span>
            <button type="button" className="refresh-button" onClick={refresh}>
              Aggiorna
            </button>
          </div>

          <h1>Seveso PL Monitor</h1>
          <p className="sub-header">
            {data.source === 'timetable'
              ? 'Orario teorico · nessun dato in tempo reale'
              : `Ultimo aggiornamento ${formatRelative(data.fetchedAt, nowMs)}`}
            {data.source === 'cache' ? ' (dati in cache)' : ''}
            {data.transport ? ` · via ${data.transport}` : ''}
          </p>

          <Disclaimer />
        </header>

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
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {dataNotice && (
          <div className={`data-notice ${dataNotice.level}`} role="status">
            <strong>{dataNotice.title}</strong>
            <span>{dataNotice.text}</span>
          </div>
        )}

        <p className="sr-only" aria-live="polite">
          {closedCount} passaggi a livello chiusi o in chiusura su {crossings.length}.
        </p>

        <main className="view-container">
          {activeTab === 'viabilita' && (
            <div className="view-content" role="tabpanel" id="panel-viabilita" aria-labelledby="tab-viabilita">
              {groupedCrossings.map(([side, list]) => (
                <section key={side} className="side-group">
                  <div className="station-divider">
                    <div className="divider-line" />
                    <div className="divider-label">{SIDE_LABELS[side].toUpperCase()}</div>
                    <div className="divider-line" />
                  </div>
                  {list.map((crossing) => (
                    <CrossingCard key={crossing.id} crossing={crossing} />
                  ))}
                </section>
              ))}
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
                  <div className="station-divider">
                    <div className="divider-line" />
                    <div className="divider-label">TRANSITATI ({passed.length})</div>
                    <div className="divider-line" />
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
                  <dt>Record duplicati fra arrivi e partenze</dt>
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
        </main>
      </div>
    </div>
  );
}

export default App;
