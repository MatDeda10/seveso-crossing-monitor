import { formatDuration, formatWindow } from '../utils/timeFormat';

/** Semaforo puramente decorativo: lo stato reale e' sempre anche testuale. */
const TrafficLight = ({ color }) => (
  <div className="traffic-light" aria-hidden="true">
    <span className={`lamp red ${color === 'red' ? 'on' : ''}`} />
    <span className={`lamp yellow ${color === 'yellow' ? 'on' : ''}`} />
    <span className={`lamp blue ${color === 'blue' ? 'on' : ''}`} />
    <span className={`lamp green ${color === 'green' ? 'on' : ''}`} />
  </div>
);

const confidenceClass = (confidence) => {
  if (confidence >= 75) return 'high';
  if (confidence >= 50) return 'mid';
  return 'low';
};

const CrossingCard = ({ crossing }) => {
  const {
    name,
    locality,
    status,
    color,
    reason,
    confidence,
    timerSec,
    closesInSec,
    windowFrom,
    windowTo,
    isUncertain,
  } = crossing;

  const isClosingNow = status === 'CHIUSO' || status === 'IN CHIUSURA';

  // Il badge dell'incertezza serve solo quando una chiusura e' in corso o
  // imminente: mostrarlo anche per un transito fra 15 minuti sarebbe rumore.
  const showUncertaintyBadge = isUncertain && (isClosingNow || status === 'PREALLERTA');

  return (
    <article className={`pl-box ${color}`}>
      <TrafficLight color={color} />

      <div className="pl-text">
        <div className="pl-title">
          <h3>{name}</h3>
          <span
            className={`conf-tag ${confidenceClass(confidence)}`}
            title="Affidabilità della stima, non una probabilità"
          >
            {confidence}%
          </span>
        </div>

        <p className={`pl-status-label color-${color}`}>{status}</p>
        <p className="pl-area">
          {locality} · {reason}
        </p>

        <div className="pl-badges">
          {isClosingNow && timerSec !== null && (
            <span className="pl-timer-badge">riapertura tra {formatDuration(timerSec)}</span>
          )}

          {status === 'PREALLERTA' && timerSec !== null && (
            <span className="pl-timer-badge">chiusura tra {formatDuration(timerSec)}</span>
          )}

          {!isClosingNow && status !== 'PREALLERTA' && closesInSec !== null && (
            <span className="pl-timer-badge ghost">
              prossima chiusura tra {formatDuration(closesInSec)}
            </span>
          )}

          {windowFrom && windowTo && (
            <span className="pl-window" title="Intervallo stimato della chiusura">
              {formatWindow(windowFrom, windowTo)}
            </span>
          )}

          {showUncertaintyBadge && <span className="pl-warn">percorso non determinato</span>}
        </div>
      </div>
    </article>
  );
};

export default CrossingCard;
