import { useMemo } from 'react';
import { BRANCH_LABELS } from '../config/topology';
import {
  computeScheduleConfidence,
  formatClock,
  formatCountdown,
  getDelayLabel,
  getRealtimeStatus,
} from '../utils/timeFormat';

const BRANCH_FALLBACK = 'Tronco comune';

const DIRECTION_LABEL = { NORD: 'NORD', SUD: 'SUD' };

const TrainCard = ({ train, nowMs }) => {
  // `stationTs` e' l'istante in cui il treno e' a Seveso (arrivo o transito).
  const ts = train.stationTs;

  const delayInfo = useMemo(() => getDelayLabel(train.delay), [train.delay]);
  const statusInfo = useMemo(() => getRealtimeStatus(ts, nowMs), [ts, nowMs]);
  const confidence = useMemo(() => computeScheduleConfidence(train), [train]);

  const directionClass = DIRECTION_LABEL[train.direction]
    ? train.direction.toLowerCase()
    : 'unknown';

  return (
    <article className={`train-card ${directionClass} ${statusInfo.className}`}>
      <div className="train-card-accent" aria-hidden="true" />

      <div className="train-card-body">
        <header className="train-card-header">
          <div className="train-left">
            <div className="train-top-row">
              <span className="train-category">{train.category}</span>
              <span className="train-number">#{train.id}</span>
              <span className={`direction-chip ${directionClass}`}>
                {DIRECTION_LABEL[train.direction] ?? '?'}
              </span>
            </div>
            <p className="train-destination">{train.destination ?? 'Destinazione non nota'}</p>
            <p className="train-origin">da {train.origin ?? 'origine non nota'}</p>
          </div>

          <span className={`status-badge ${statusInfo.className}`}>{statusInfo.label}</span>
        </header>

        <div className="train-card-mid">
          <div className="train-info-box emphasis">
            <span className="mini-label">FRA</span>
            <span className="countdown-value">{formatCountdown(ts, nowMs)}</span>
          </div>

          <div className="train-info-box">
            <span className="mini-label">{train.stopsAtStation ? 'FERMATA' : 'TRANSITO'}</span>
            <span className="main-value">{formatClock(ts)}</span>
          </div>

          <div className="train-info-box">
            <span className="mini-label">RITARDO</span>
            <span className={`delay-value ${delayInfo.className}`}>{delayInfo.label}</span>
          </div>

          <div className="train-info-box">
            <span className="mini-label">RAMO</span>
            <span className="branch-value">{BRANCH_LABELS[train.routeBranch] ?? BRANCH_FALLBACK}</span>
          </div>
        </div>

        <footer className="train-card-footer">
          <div className="confidence-section">
            <div className="confidence-header">
              <span className="mini-label">AFFIDABILITÀ ORARIO</span>
              <span className="confidence-percent">{confidence}%</span>
            </div>
            <div className="confidence-bar-container">
              <div
                className={`confidence-bar-fill ${confidence >= 80 ? 'good' : confidence >= 55 ? 'warn' : 'bad'}`}
                style={{ width: `${confidence}%` }}
              />
            </div>
          </div>
          <span className="data-source">{train.categoryLabel}</span>
        </footer>
      </div>
    </article>
  );
};

export default TrainCard;
