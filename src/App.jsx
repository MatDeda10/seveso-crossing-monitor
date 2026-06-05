import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './App.css';
import { CROSSINGS_CONFIG } from './config/topology';
import { predictCrossings } from './engine/predictionEngine';
import TrainCard from './components/TrainCard';

function App() {
  const [activeTab, setActiveTab] = useState('viabilita');
  const [data, setData] = useState({ arrivals: [], departures: [], lastSync: 0 });
  const [logs, setLogs] = useState([]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const addLog = useCallback((message, type = 'info') => {
    const entry = { id: Date.now() + Math.random(), ts: new Date().toLocaleTimeString(), msg: message, type };
    setLogs(prev => [entry, ...prev].slice(0, 50));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const dateStr = new Date().toString().split(' (')[0];
      const buildUrl = (type) => {
        const target = `http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/${type}/S01925/${encodeURIComponent(dateStr)}`;
        return `https://corsproxy.io/?${encodeURIComponent(target)}`;
      };
      const [depRes, arrRes] = await Promise.all([fetch(buildUrl('partenze')), fetch(buildUrl('arrivi'))]);
      const departures = await depRes.json();
      const arrivals = await arrRes.json();
      setData({ departures: departures || [], arrivals: arrivals || [], lastSync: Date.now() });
      addLog('Dati aggiornati', 'success');
    } catch (err) {
      addLog(`Errore Sync: ${err.message}`, 'error');
    }
  }, [addLog]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const { crossings, trains } = useMemo(() => {
    return predictCrossings({
      arrivals: data.arrivals,
      departures: data.departures,
      crossings: CROSSINGS_CONFIG,
      now,
      lastSyncTs: data.lastSync
    });
  }, [data, now]);

  const renderPL = (pl) => (
    <div key={pl.id} className={`pl-box ${pl.color}`}>
      <div className="traffic-light">
        <div className={`lamp red ${pl.color === 'red' ? 'on' : ''}`}></div>
        <div className={`lamp yellow ${['yellow', 'blue'].includes(pl.color) ? 'on' : ''} ${pl.color === 'blue' ? 'blue-mode' : ''}`}></div>
        <div className={`lamp green ${pl.color === 'green' ? 'on' : ''}`}></div>
      </div>
      <div className="pl-text">
        <div className="pl-title">{pl.name} <span className="conf-tag">{Math.round(pl.confidence)}%</span></div>
        <div className="pl-status-label">{pl.status}</div>
        <div className="pl-area">{pl.reason}</div>
        {pl.timer && <div className="pl-timer-badge">{pl.timer}</div>}
      </div>
    </div>
  );

  return (
    <div className="app-shell">
      <div className="app-card">
        <header className="main-header">
          <div className="status-bar">
            <span className={`indicator ${Date.now() - data.lastSync < 95000 ? 'live' : 'stale'}`}></span>
            <span className="station-label">CONTROL UNIT • {now.toLocaleTimeString()}</span>
          </div>
          <h1>Seveso PL Monitor</h1>
        </header>

        <nav className="tab-bar">
          <button className={activeTab === 'viabilita' ? 'active' : ''} onClick={() => setActiveTab('viabilita')}>Passaggi</button>
          <button className={activeTab === 'treni' ? 'active' : ''} onClick={() => setActiveTab('treni')}>Treni</button>
          <button className={activeTab === 'logs' ? 'active' : ''} onClick={() => setActiveTab('logs')}>Log</button>
        </nav>

        <main className="view-container">
          {activeTab === 'viabilita' && (
            <div className="view-content">
              {crossings.slice(0, 3).map(renderPL)}
              <div className="station-divider"><div className="divider-line"></div><div className="divider-label">STAZIONE SEVESO</div><div className="divider-line"></div></div>
              {crossings.slice(3).map(renderPL)}
            </div>
          )}

          {activeTab === 'treni' && (
            <div className="view-content">
              {trains
                .filter(t => {
                  const ts = t.arrivalTs || t.departureTs;
                  const deltaMinutes = (ts - now.getTime()) / 60000;
                  // MOSTRA: Treni futuri (delta > 0) e treni passati da meno di 5 minuti (delta > -5)
                  return deltaMinutes > -5;
                })
                .sort((a, b) => (a.arrivalTs || a.departureTs) - (b.arrivalTs || b.departureTs))
                .map(train => <TrainCard key={train.id} train={train} now={now} />)
              }
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="view-content log-page">
              {logs.map(log => <div key={log.id} className={`log-entry ${log.type}`}><span className="log-time">{log.ts}</span>{log.msg}</div>)}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
