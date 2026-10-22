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

const TrainCard = ({ train, nowMs }) => {
  // `stationTs` e' l'istante in cui il treno e' a Seveso (arrivo o transito).
  const ts = train.stationTs;

  const delayInfo = useMemo(() => getDelayLabel(train.delay), [train.delay]);
  const statusInfo = useMemo(() => getRealtimeStatus(ts, nowMs), [ts, nowMs]);
  const confidence = useMemo(() => computeScheduleConfidence(train), [train]);

  const directionClass = train.direction === 'NORD' ? 'nord' : train.direction === 'SUD' ? 'sud' : 'unknown';

  return (
    <article className={`train-card ${directionClass} ${statusInfo.className}`}>
      <div className="train-card-accent" />

      <div className="train-card-body">
        <header className="train-card-header">
          <div className="train-left">
            <div className="train-top-row">
              <span className="train-category">{train.category}</span>
              <span className="train-number">#{train.id}</span>
            </div>
            <p className="train-destination">{train.destination ?? 'Destinazione non nota'}</p>
            <p className="train-origin">da {train.origin ?? 'origine non nota'}</p>
          </div>

          <div className="train-right">
            <span className={`status-badge ${statusInfo.className}`}>{statusInfo.label}</span>
            <span className={`direction-chip ${directionClass}`}>
              {train.direction === 'NORD'
                ? '▲ NORD'
                : train.direction === 'SUD'
                  ? '▼ SUD'
                  : '? DIREZIONE'}
            </span>
          </div>
        </header>

        <div className="train-card-mid">
          <div className="train-info-box">
            <span className="mini-label">{train.stopsAtStation ? 'FERMATA' : 'TRANSITO'}</span>
            <span className="main-value">{formatClock(ts)}</span>
          </div>

          <div className="train-info-box">
            <span className="mini-label">FRA</span>
            <span className="countdown-value">{formatCountdown(ts, nowMs)}</span>
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
