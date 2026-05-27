import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CROSSINGS_CONFIG, WINDOWS, BRANCHES } from './config/topology';
import { normalizeTrains, isBranchCompatible } from './engine/predictionEngine';
import './App.css';

const STATION_ID = "S01925";

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
    const newLog = { id: Date.now() + Math.random(), ts: new Date().toLocaleTimeString(), msg: message, type };
    setLogs(prev => [newLog, ...prev].slice(0, 30));
  }, []);

  const fetchData = useCallback(async () => {
    const dateStr = new Date().toString().split(' (')[0];
    const baseUrl = "http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno";
    const getProxyUrl = (type) => `https://corsproxy.io/?${encodeURIComponent(`${baseUrl}/${type}/${STATION_ID}/${encodeURIComponent(dateStr)}`)}`;

    try {
      const [resDep, resArr] = await Promise.all([fetch(getProxyUrl('partenze')), fetch(getProxyUrl('arrivi'))]);
      const d = await resDep.json();
      const a = await resArr.json();
      setData({ departures: d || [], arrivals: a || [], lastSync: Date.now() });
      addLog("Sincronizzazione completata", "success");
    } catch (e) {
      addLog(`Errore Sync: ${e.message}`, "error");
    }
  }, [addLog]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const { plStates, trainList } = useMemo(() => {
    const currentTime = now.getTime();
    const isStale = (currentTime - data.lastSync) > 95000;
    const trainArray = normalizeTrains(data.arrivals, data.departures);

    const states = CROSSINGS_CONFIG.map(pl => {
      let intervals = [];
      trainArray.forEach(t => {
        if (!isBranchCompatible(t.routeBranch, pl.branch)) return;

        const speedFactor = t.cat.includes('S') ? 0.85 : 1.1;
        const offsetMs = pl.offset * speedFactor * 1000;
        let eventTs = null;

        if (t.direction === "NORD") {
          if (t.arrivalTs && pl.side === 'CESANO') eventTs = t.arrivalTs - offsetMs;
          if (t.departureTs && pl.side === 'MEDA') eventTs = t.departureTs + offsetMs;
        } else {
          if (t.arrivalTs && pl.side === 'MEDA') eventTs = t.arrivalTs - offsetMs;
          if (t.departureTs && pl.side === 'CESANO') eventTs = t.departureTs + offsetMs;
        }

        if (eventTs) {
          intervals.push({
            start: eventTs - (WINDOWS.preAlert * 1000),
            end: eventTs - (WINDOWS.end * 1000),
            closing: eventTs - (WINDOWS.closing * 1000),
            closed: eventTs - (WINDOWS.closed * 1000),
            id: t.id,
            conf: isStale ? 0.3 : (t.delay !== null ? 0.95 : 0.7)
          });
        }
      });

      const sortedIntervals = intervals.sort((a,b) => a.start - b.start);
      const merged = sortedIntervals.reduce((acc, curr) => {
        if (!acc.length) return [curr];
        let last = acc[acc.length-1];
        if (curr.start <= last.end + 8000) {
          last.end = Math.max(last.end, curr.end);
          last.id = `${last.id}+${curr.id}`;
          return acc;
        }
        return [...acc, curr];
      }, []);

      const active = merged.find(i => currentTime >= i.start && currentTime <= i.end);
      const next = merged.find(i => i.start > currentTime);

      let res = { ...pl, status: 'APERTO', color: 'green', conf: 100, reason: 'Circolazione fluida', timer: null };

      if (isStale) {
        res = { ...pl, status: 'INCERTO', color: 'gray', conf: 0, reason: 'Dati obsoleti', timer: null };
      } else if (active) {
        if (currentTime >= active.closed) {
          const sec = Math.ceil((active.end - currentTime) / 1000);
          res = { ...pl, status: 'CHIUSO', color: 'red', conf: active.conf*100, reason: `Treno ${active.id}`, timer: `Riapre tra ${sec}s` };
        } else if (currentTime >= active.closing) {
          const sec = Math.ceil((active.closed - currentTime) / 1000);
          res = { ...pl, status: 'IN CHIUSURA', color: 'yellow', conf: active.conf*100, reason: `Treno ${active.id}`, timer: `Chiuso tra ${sec}s` };
        } else {
          const sec = Math.ceil((active.closing - currentTime) / 1000);
          res = { ...pl, status: 'PREALLERTA', color: 'blue', conf: active.conf*100, reason: 'Treno imminente', timer: `Barriere giù tra ${sec}s` };
        }
      } else if (next) {
        const secTotal = Math.ceil((next.closing - currentTime) / 1000);
        if (secTotal < 600) { // Mostra countdown solo se mancano meno di 10 minuti
          const m = Math.floor(secTotal / 60);
          const s = secTotal % 60;
          res.timer = `Chiude tra ${m > 0 ? `${m}m ` : ''}${s}s`;
        }
      }
      return res;
    });

    return { plStates: states, trainList: trainArray };
  }, [data, now]);

  const renderPL = (pl) => (
    <div key={pl.id} className={`pl-box ${pl.color}`}>
      <div className="traffic-light">
        <div className={`lamp red ${pl.color === 'red' ? 'on' : ''}`}></div>
        <div className={`lamp yellow ${['yellow', 'blue'].includes(pl.color) ? 'on' : ''} ${pl.color === 'blue' ? 'blue-mode' : ''}`}></div>
        <div className={`lamp green ${pl.color === 'green' ? 'on' : ''}`}></div>
      </div>
      <div className="pl-text">
        <div className="pl-title">{pl.name} <span className="conf-tag">{pl.conf.toFixed(0)}%</span></div>
        <div className="pl-status-label">{pl.status}</div>
        <div className="pl-area">{pl.reason}</div>
        {pl.timer && <div className="pl-timer-badge">{pl.timer}</div>}
      </div>
    </div>
  );

  return (
    <div className="app-shell light-theme">
      <div className="app-card">
        <header className="main-header">
          <div className="status-bar">
            <span className={`indicator ${Date.now() - data.lastSync < 95000 ? 'live' : 'stale'}`}></span>
            <span className="station-label">SEVESO MONITOR • {now.toLocaleTimeString()}</span>
          </div>
          <h1>Monitor Stazione</h1>
        </header>

        <nav className="tab-bar">
          <button className={activeTab === 'viabilita' ? 'active' : ''} onClick={() => setActiveTab('viabilita')}>Passaggi</button>
          <button className={activeTab === 'treni' ? 'active' : ''} onClick={() => setActiveTab('treni')}>Treni</button>
          <button className={activeTab === 'logs' ? 'active' : ''} onClick={() => setActiveTab('logs')}>Log</button>
        </nav>

        <main className="view-container">
          {activeTab === 'viabilita' && (
            <div className="view-content">
              {plStates.slice(0, 3).map(renderPL)}
              <div className="station-divider">
                <div className="divider-line"></div>
                <div className="divider-label">STAZIONE SEVESO</div>
                <div className="divider-line"></div>
              </div>
              {plStates.slice(3).map(renderPL)}
            </div>
          )}

          {activeTab === 'treni' && (
            <div className="view-content">
              {trainList
                .filter(t => (Math.max(t.arrivalTs, t.departureTs) - now.getTime()) / 60000 > -10)
                .sort((a,b) => (a.arrivalTs || a.departureTs) - (b.arrivalTs || b.departureTs))
                .map(t => (
                  <div key={t.id} className={`train-tile ${t.direction === 'NORD' ? 'nord' : 'sud'}`}>
                    <div className="tile-accent"></div>
                    <div className="tile-body">
                      <div className="tile-header">
                        <div className="train-meta"><span className="train-cat">{t.cat}</span><span className="train-id">{t.id}</span></div>
                        <span className={`direction-badge ${t.direction.toLowerCase()}`}>{t.direction === 'NORD' ? '▲ NORD' : '▼ SUD'}</span>
                      </div>
                      <div className="tile-main">
                        <div className="destination-group"><span className="label-tiny">DESTINAZIONE</span><span className="destination-name">{t.dest}</span></div>
                        <div className="time-group"><span className="scheduled-time">{t.schedTime}</span>
                          <span className={`delay-pill ${t.delay > 0 ? 'late' : 'ontime'}`}>{t.delay > 0 ? `+${t.delay}'` : 'OK'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="view-content log-page">
              {logs.map(l => (
                <div key={l.id} className={`log-entry ${l.type}`}><span className="log-time">{l.ts}</span> {l.msg}</div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
