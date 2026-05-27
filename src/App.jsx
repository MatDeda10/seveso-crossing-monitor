import React, {
  useState,
  useEffect,
  useCallback,
  useMemo
} from 'react';

import './App.css';

import {
  CROSSINGS_CONFIG
} from './config/topology';

import {
  predictCrossings
} from './engine/predictionEngine';

/* ============================================================================
 * CONFIG
 * ========================================================================== */

const STATION_ID = 'S01925';

const BASE_URL =
  'http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno';

/* ============================================================================
 * APP
 * ========================================================================== */

function App() {

  /* ==========================================================================
   * STATE
   * ========================================================================= */

  const [activeTab, setActiveTab] =
    useState('viabilita');

  const [data, setData] =
    useState({

      arrivals: [],
      departures: [],

      lastSync: 0
    });

  const [logs, setLogs] =
    useState([]);

  const [now, setNow] =
    useState(new Date());

  /* ==========================================================================
   * CLOCK
   * ========================================================================= */

  useEffect(() => {

    const timer =
      setInterval(() => {

        setNow(new Date());

      }, 1000);

    return () =>
      clearInterval(timer);

  }, []);

  /* ==========================================================================
   * LOGGER
   * ========================================================================= */

  const addLog = useCallback((
    message,
    type = 'info'
  ) => {

    const entry = {

      id:
        Date.now() +
        Math.random(),

      ts:
        new Date()
          .toLocaleTimeString(),

      msg: message,

      type
    };

    setLogs(prev =>
      [entry, ...prev].slice(0, 50)
    );

  }, []);

  /* ==========================================================================
   * FETCH
   * ========================================================================= */

  const fetchData =
    useCallback(async () => {

      try {

        const dateStr =
          new Date()
            .toString()
            .split(' (')[0];

        const buildUrl = (type) => {

          const target =

            `${BASE_URL}/${type}/${STATION_ID}/${encodeURIComponent(dateStr)}`;

          return `https://corsproxy.io/?${encodeURIComponent(target)}`;
        };

        const [
          depRes,
          arrRes
        ] = await Promise.all([

          fetch(buildUrl('partenze')),
          fetch(buildUrl('arrivi'))
        ]);

        if (
          !depRes.ok ||
          !arrRes.ok
        ) {

          throw new Error(
            'Errore HTTP'
          );
        }

        const departures =
          await depRes.json();

        const arrivals =
          await arrRes.json();

        setData({

          departures:
            departures || [],

          arrivals:
            arrivals || [],

          lastSync:
            Date.now()
        });

        addLog(
          'Sincronizzazione completata',
          'success'
        );

      } catch (err) {

        addLog(
          `Errore Sync: ${err.message}`,
          'error'
        );
      }

    }, [addLog]);

  /* ==========================================================================
   * AUTO REFRESH
   * ========================================================================= */

  useEffect(() => {

    fetchData();

    const interval =
      setInterval(
        fetchData,
        30000
      );

    return () =>
      clearInterval(interval);

  }, [fetchData]);

  /* ==========================================================================
   * ENGINE
   * ========================================================================= */

  const {
    crossings,
    trains
  } = useMemo(() => {

    return predictCrossings({

      arrivals:
        data.arrivals,

      departures:
        data.departures,

      crossings:
        CROSSINGS_CONFIG,

      now,

      lastSyncTs:
        data.lastSync
    });

  }, [data, now]);

  /* ==========================================================================
   * RENDER PL
   * ========================================================================= */

  const renderPL = (pl) => (

    <div
      key={pl.id}
      className={`pl-box ${pl.color}`}
    >

      <div className="traffic-light">

        <div className={`lamp red ${pl.color === 'red' ? 'on' : ''}`}></div>

        <div className={`lamp yellow ${
          ['yellow', 'blue'].includes(pl.color)
            ? 'on'
            : ''
        } ${
          pl.color === 'blue'
            ? 'blue-mode'
            : ''
        }`}></div>

        <div className={`lamp green ${
          pl.color === 'green'
            ? 'on'
            : ''
        }`}></div>

      </div>

      <div className="pl-text">

        <div className="pl-title">

          {pl.name}

          <span className="conf-tag">
            {Math.round(pl.confidence)}%
          </span>

        </div>

        <div className="pl-status-label">
          {pl.status}
        </div>

        <div className="pl-area">
          {pl.reason}
        </div>

        {pl.timer && (

          <div className="pl-timer-badge">
            {pl.timer}
          </div>
        )}

      </div>
    </div>
  );

  /* ==========================================================================
   * JSX
   * ========================================================================= */

  return (

    <div className="app-shell light-theme">

      <div className="app-card">

        {/* ================================================================
         * HEADER
         * ============================================================== */}

        <header className="main-header">

          <div className="status-bar">

            <span className={`indicator ${
              Date.now() - data.lastSync < 95000
                ? 'live'
                : 'stale'
            }`}></span>

            <span className="station-label">

              CONTROL UNIT • {now.toLocaleTimeString()}

            </span>

          </div>

          <div className="title-wrapper">

            <img
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Seveso-Stemma.png/100px-Seveso-Stemma.png"
              alt="Stemma Seveso"
              className="city-logo"
            />

            <h1>Seveso PL Monitor</h1>

          </div>

        </header>

        {/* ================================================================
         * TABS
         * ============================================================== */}

        <nav className="tab-bar">

          <button
            className={
              activeTab === 'viabilita'
                ? 'active'
                : ''
            }
            onClick={() =>
              setActiveTab('viabilita')
            }
          >
            Passaggi
          </button>

          <button
            className={
              activeTab === 'treni'
                ? 'active'
                : ''
            }
            onClick={() =>
              setActiveTab('treni')
            }
          >
            Treni
          </button>

          <button
            className={
              activeTab === 'logs'
                ? 'active'
                : ''
            }
            onClick={() =>
              setActiveTab('logs')
            }
          >
            Log
          </button>

        </nav>

        {/* ================================================================
         * CONTENT
         * ============================================================== */}

        <main className="view-container">

          {/* ============================================================
           * VIABILITA
           * ========================================================== */}

          {activeTab === 'viabilita' && (

            <div className="view-content">

              {/* LATO CESANO */}

              {crossings
                .slice(0, 3)
                .map(renderPL)}

              <div className="station-divider">

                <div className="divider-line"></div>

                <div className="divider-label">
                  STAZIONE SEVESO
                </div>

                <div className="divider-line"></div>

              </div>

              {/* LATO MEDA */}

              {crossings
                .slice(3)
                .map(renderPL)}

            </div>
          )}

          {/* ============================================================
           * TRENI
           * ========================================================== */}

          {activeTab === 'treni' && (

            <div className="view-content">

              {trains

                .filter(t => {

                  const ts =
                    t.arrivalTs ||
                    t.departureTs;

                  return (
                    (ts - now.getTime()) / 60000 > -10
                  );
                })

                .sort((a, b) => {

                  const ta =
                    a.arrivalTs ||
                    a.departureTs;

                  const tb =
                    b.arrivalTs ||
                    b.departureTs;

                  return ta - tb;
                })

                .map(t => (

                  <div
                    key={t.uniqueKey || t.id}
                    className={`train-tile ${
                      t.direction === 'NORD'
                        ? 'nord'
                        : 'sud'
                    }`}
                  >

                    <div className="tile-accent"></div>

                    <div className="tile-body">

                      <div className="tile-header">

                        <div className="train-meta">

                          <span className="train-cat">
                            {t.category}
                          </span>

                          <span className="train-id">
                            {t.id}
                          </span>

                        </div>

                        <span className={`direction-badge ${
                          t.direction.toLowerCase()
                        }`}>

                          {t.direction === 'NORD'
                            ? '▲ NORD'
                            : '▼ SUD'}

                        </span>

                      </div>

                      <div className="tile-main">

                        <div className="destination-group">

                          <span className="label-tiny">
                            DESTINAZIONE
                          </span>

                          <span className="destination-name">
                            {t.destination}
                          </span>

                        </div>

                        <div className="time-group">

                          <span className="scheduled-time">
                            {t.schedTime}
                          </span>

                          <span className={`delay-pill ${
                            t.delay > 0
                              ? 'late'
                              : 'ontime'
                          }`}>

                            {t.delay > 0
                              ? `+${t.delay}'`
                              : 'OK'}

                          </span>

                        </div>

                      </div>

                    </div>

                  </div>
                ))}

            </div>
          )}

          {/* ============================================================
           * LOGS
           * ========================================================== */}

          {activeTab === 'logs' && (

            <div className="view-content log-page">

              {logs.map(log => (

                <div
                  key={log.id}
                  className={`log-entry ${log.type}`}
                >

                  <span className="log-time">
                    {log.ts}
                  </span>

                  {log.msg}

                </div>
              ))}

            </div>
          )}

        </main>

      </div>

    </div>
  );
}

export default App;