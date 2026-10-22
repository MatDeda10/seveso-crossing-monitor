import { VERIFICATION_LABELS } from '../../config/crossings.geo';
import { formatClock, formatDuration, formatWindow } from '../../utils/timeFormat';

const STATUS_LABELS = {
  APERTO: 'Probabilmente aperto',
  PREALLERTA: 'Possibile chiusura imminente',
  'IN CHIUSURA': 'Possibile chiusura in corso',
  CHIUSO: 'Probabilmente chiuso',
  INCERTO: 'Stato incerto',
  OFFLINE: 'Dati non aggiornati',
};

const confidenceLabel = (confidence) => {
  if (confidence >= 75) return 'alta';
  if (confidence >= 50) return 'media';
  return 'bassa';
};

const CrossingDetail = ({ crossing, onClose, nowMs }) => {
  if (!crossing) return null;

  const isClosed = crossing.status === 'CHIUSO' || crossing.status === 'IN CHIUSURA';
  const geo = crossing.geo;

  return (
    <section className={`detail-card tone-${crossing.color}`} aria-label={`Dettaglio ${crossing.name}`}>
      <header className="detail-head">
        <div>
          <h2>{crossing.name}</h2>
          <p className="detail-sub">
            {crossing.locality} · {crossing.side === 'CESANO' ? 'lato Cesano' : 'lato Meda'}
          </p>
        </div>
        <button type="button" className="detail-close" onClick={onClose} aria-label="Chiudi dettaglio">
          ✕
        </button>
      </header>

      <div className="detail-status">
        <span className={`detail-status-label tone-${crossing.color}`}>
          {STATUS_LABELS[crossing.status] ?? crossing.status}
        </span>
        <span className="detail-reason">{crossing.reason}</span>
      </div>

      <div className="detail-timers">
        {isClosed && crossing.timerSec !== null && (
          <div className="detail-timer">
            <span className="mini-label">Riapertura stimata</span>
            <strong>{formatDuration(crossing.timerSec)}</strong>
          </div>
        )}
        {crossing.status === 'PREALLERTA' && crossing.timerSec !== null && (
          <div className="detail-timer">
            <span className="mini-label">Chiusura stimata</span>
            <strong>{formatDuration(crossing.timerSec)}</strong>
          </div>
        )}
        {!isClosed && crossing.status !== 'PREALLERTA' && crossing.nextClosureInSec !== null && (
          <div className="detail-timer">
            <span className="mini-label">Prossima chiusura</span>
            <strong>{formatDuration(crossing.nextClosureInSec)}</strong>
          </div>
        )}
        {crossing.windowFrom && crossing.windowTo && (
          <div className="detail-timer">
            <span className="mini-label">Finestra transito</span>
            <strong>{formatWindow(crossing.windowFrom, crossing.windowTo)}</strong>
          </div>
        )}
      </div>

      <dl className="detail-grid">
        <div>
          <dt>Affidabilità</dt>
          <dd>
            {crossing.confidence}% <span className="muted">({confidenceLabel(crossing.confidence)})</span>
          </dd>
        </div>
        <div>
          <dt>Dati</dt>
          <dd>{crossing.dataAgeSec > 0 ? `${crossing.dataAgeSec}s fa` : 'adesso'}</dd>
        </div>
        <div>
          <dt>Treni</dt>
          <dd>
            {crossing.reason.includes('Transito')
              ? crossing.reason.replace('Transito ', '')
              : crossing.nextTrainIds?.length
                ? crossing.nextTrainIds.join(' + ')
                : '—'}
          </dd>
        </div>
        <div>
          <dt>Prossimo transito</dt>
          <dd>{crossing.nextWindowFrom ? formatClock(crossing.nextWindowFrom) : '—'}</dd>
        </div>
      </dl>

      {crossing.isUncertain && (
        <p className="detail-warning">
          Percorso del treno non determinato: la chiusura è calcolata in modo prudente e può
          riguardare un ramo diverso da quello reale.
        </p>
      )}

      {crossing.theoryOnly && (
        <p className="detail-warning">
          Previsione basata sull’orario ufficiale: i ritardi in tempo reale non sono disponibili.
        </p>
      )}

      <footer className="detail-foot">
        <span className={`verification-badge ${crossing.verification === 'verified' ? 'ok' : 'warn'}`}>
          {VERIFICATION_LABELS[crossing.verification] ?? 'Posizione da verificare'}
        </span>
        {geo?.source && <span className="detail-source">{geo.source}</span>}
        {geo?.lastVerified && <span className="detail-source">verificato il {geo.lastVerified}</span>}
      </footer>

      <p className="detail-disclaimer">
        Stima predittiva basata su dati ferroviari pubblici: non certifica lo stato fisico delle
        sbarre. Rispetta sempre segnaletica e codice della strada.
      </p>

      <span className="sr-only">Ora attuale {formatClock(nowMs)}</span>
    </section>
  );
};

export default CrossingDetail;
