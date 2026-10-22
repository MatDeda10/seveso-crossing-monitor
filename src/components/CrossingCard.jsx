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
    <article className={`crossing-card tone-${color}`}>
      <TrafficLight color={color} />

      <div className="cc-content">
        <div className="cc-head">
          <div className="cc-titles">
            <h3>{name}</h3>
            <p className="cc-locality">
              {locality} · {reason}
            </p>
          </div>

          <span className={`status-pill tone-${color}`}>{status}</span>
        </div>

        <div className="cc-foot">
          <div className="cc-badges">
            {isClosingNow && timerSec !== null && (
              <span className={`cc-timer tone-${color}`}>riapre tra {formatDuration(timerSec)}</span>
            )}

            {status === 'PREALLERTA' && timerSec !== null && (
              <span className={`cc-timer tone-${color}`}>chiude tra {formatDuration(timerSec)}</span>
            )}

            {!isClosingNow && status !== 'PREALLERTA' && closesInSec !== null && (
              <span className="cc-timer ghost">prossima tra {formatDuration(closesInSec)}</span>
            )}

            {windowFrom && windowTo && (
              <span className="cc-window" title="Intervallo stimato della chiusura">
                {formatWindow(windowFrom, windowTo)}
              </span>
            )}

            {showUncertaintyBadge && <span className="cc-uncertain">percorso da verificare</span>}
          </div>

          <span
            className={`conf-tag ${confidenceClass(confidence)}`}
            title="Affidabilità della stima, non una probabilità"
          >
            {confidence}%
          </span>
        </div>
      </div>
    </article>
  );
};

export default CrossingCard;
