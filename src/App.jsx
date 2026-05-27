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

import TrainCard from './components/TrainCard';

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

      {/* =============================================================== */}
      {/* TRAFFIC LIGHT */}
      {/* =============================================================== */}

      <div className="traffic-light">

        <div className={`lamp red ${
          pl.color === 'red'
            ? 'on'
            : ''
        }`}></div>

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

      {/* =============================================================== */}
      {/* TEXT */}
      {/* =============================================================== */}

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

            <div>

              <h1>Seveso PL Monitor</h1>

              <div className="subtitle">
                Monitoraggio Passaggi a Livello
              </div>

            </div>

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

              {/* ===================================================== */}
              {/* CESANO SIDE */}
              {/* ===================================================== */}

              {crossings
                .slice(0, 3)
                .map(renderPL)}

              {/* ===================================================== */}
              {/* STATION */}
              {/* ===================================================== */}

              <div className="station-divider">

                <div className="divider-line"></div>

                <div className="divider-label">
                  STAZIONE SEVESO
                </div>

                <div className="divider-line"></div>

              </div>

              {/* ===================================================== */}
              {/* MEDA SIDE */}
              {/* ===================================================== */}

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

                .map(train => (

                  <TrainCard
                    key={train.uniqueKey || train.id}
                    train={train}
                    now={now}
                  />

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