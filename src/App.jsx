import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import CrossingCard from './components/CrossingCard';
import TrainCard from './components/TrainCard';
import { RUNTIME } from './config/runtime';
import { CROSSINGS_CONFIG, SIDE_LABELS, SIDES } from './config/topology';
import { WINDOWS } from './config/windows';
import { buildTrains, predictCrossings } from './engine/predictionEngine';
import { useClock } from './hooks/useClock';
import { useLogs } from './hooks/useLogs';
import { useTrainData } from './hooks/useTrainData';
import { formatClock, formatDuration, formatRelative } from './utils/timeFormat';

const TABS = [
  { id: 'viabilita', label: 'Passaggi' },
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

  /** Conteggi e stato complessivo mostrati nel riepilogo in alto. */
  const summary = useMemo(() => {
    const closed = crossings.filter((c) => CLOSED_STATUSES.has(c.status));
    const alerting = crossings.filter((c) => c.status === 'PREALLERTA');
    const unknown = crossings.filter((c) => UNKNOWN_STATUSES.has(c.status));
    const open = crossings.filter((c) => c.status === 'APERTO');

    const nextClosing = crossings
      .filter((c) => !CLOSED_STATUSES.has(c.status) && c.closesInSec !== null)
      .sort((a, b) => a.closesInSec - b.closesInSec)[0];

    return {
      closed: closed.length,
      alerting: alerting.length,
      unknown: unknown.length,
      open: open.length,
      nextClosing: nextClosing ?? null,
    };
  }, [crossings]);

  const indicatorClass = useMemo(() => {
    if (!data.fetchedAt || syncAgeMs > WINDOWS.staleHardMs) return 'offline';
    if (data.dataState === 'timetable' || data.dataState === 'cached') return 'stale';
    if (syncAgeMs > WINDOWS.liveIndicatorMs) return 'stale';
    return 'live';
  }, [data.fetchedAt, data.dataState, syncAgeMs]);

  /** Primo caricamento: nessun dato e nessun errore ancora registrato. */
  const isInitialLoading = !data.fetchedAt && data.dataState === 'offline' && !data.error;

  /**
   * Stato complessivo a colpo d'occhio. Il dettaglio per singolo PL resta
   * sotto; qui serve solo a rispondere a "posso passare?".
   */
  const overall = useMemo(() => {
    if (isInitialLoading) {
      return { tone: 'muted', label: 'Caricamento dati…', hint: 'Connessione ai sistemi ferroviari' };
    }

    if (indicatorClass === 'offline' || summary.unknown > 0) {
      return { tone: 'muted', label: 'Dati non disponibili', hint: 'Rete non raggiungibile' };
    }

    if (summary.closed > 0) {
      const allEstimated = crossings.filter((c) => CLOSED_STATUSES.has(c.status)).every((c) => c.isUncertain);

      if (allEstimated) {
        return {
          tone: 'warning',
          label: summary.closed === 1 ? '1 chiusura stimata' : `${summary.closed} chiusure stimate`,
          hint: 'Percorso del treno da verificare: prudenzialmente chiuse',
        };
      }

      return {
        tone: 'danger',
        label: summary.closed === 1 ? '1 chiusura in corso' : `${summary.closed} chiusure in corso`,
        hint: summary.nextClosing
          ? `Prossima chiusura tra ${formatDuration(summary.nextClosing.closesInSec)}`
          : 'Attendi la riapertura',
      };
    }

    if (summary.alerting > 0) {
      return {
        tone: 'warning',
        label: summary.alerting === 1 ? 'Treno in avvicinamento' : 'Treni in avvicinamento',
        hint: 'Chiusura imminente',
      };
    }

    return {
      tone: 'ok',
      label: 'Tutti aperti',
      hint: summary.nextClosing
        ? `Prossima chiusura tra ${formatDuration(summary.nextClosing.closesInSec)} · ${summary.nextClosing.name}`
        : 'Nessun transito previsto',
    };
  }, [indicatorClass, summary, isInitialLoading, crossings]);

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
        <header className="app-header">
          <div className="header-row">
            <div className="brand">
              <span className={`live-dot ${indicatorClass}`} aria-hidden="true" />
              <div className="brand-text">
                <span className="brand-name">{RUNTIME.stationName}</span>
                <span className="brand-meta">Passaggi a livello</span>
              </div>
            </div>

            <div className="header-actions">
              <span className="clock">{formatClock(nowMs)}</span>
              <button
                type="button"
                className="icon-button"
                onClick={refresh}
                aria-label="Aggiorna i dati"
                title="Aggiorna i dati"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z"
                  />
                </svg>
              </button>
            </div>
          </div>

          <section className={`hero ${overall.tone}`} aria-live="polite">
            <div className="hero-main">
              <span className="hero-label">{overall.label}</span>
              <span className="hero-hint">{overall.hint}</span>
            </div>

            <div className="hero-stats">
              <div className="hero-stat">
                <span className="hero-stat-value">{summary.closed}</span>
                <span className="hero-stat-label">chiusi</span>
              </div>
              <div className="hero-stat">
                <span className="hero-stat-value">{summary.alerting}</span>
                <span className="hero-stat-label">in arrivo</span>
              </div>
              <div className="hero-stat">
                <span className="hero-stat-value">{summary.open}</span>
                <span className="hero-stat-label">aperti</span>
              </div>
            </div>
          </section>

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
          {summary.closed} passaggi a livello chiusi o in chiusura su {crossings.length}.
        </p>

        <main className="view-container">
          {activeTab === 'viabilita' && (
            <div className="view-content" role="tabpanel" id="panel-viabilita" aria-labelledby="tab-viabilita">
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
                      <CrossingCard key={crossing.id} crossing={crossing} />
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
        </main>

        <footer className="app-footer">
          Stima non ufficiale, non è un dispositivo di sicurezza: rispetta sempre barriere e
          segnaletica.
        </footer>
      </div>
    </div>
  );
}

export default App;
