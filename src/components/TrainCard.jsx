import React from 'react';
import { formatClock, formatCountdown, getDelayLabel } from '../utils/timeFormat';

function TrainCard({ train, now }) {
  const ts = train.arrivalTs || train.departureTs;
  const delayInfo = getDelayLabel(train.delay);
  
  return (
    <div className={`train-card ${train.direction.toLowerCase()}`}>
      <div className="train-card-accent"></div>
      <div className="train-card-body">
        <div className="train-card-header">
          <div className="train-left">
            <div className="train-top-row">
              <span className="train-category">{train.category}</span>
              <span className="train-number">{train.id}</span>
            </div>
            <div className="train-destination">{train.destination}</div>
          </div>
          <div className="train-right">
            <div className={`direction-chip ${train.direction.toLowerCase()}`}>
              {train.direction === 'NORD' ? '▲ NORD' : '▼ SUD'}
            </div>
          </div>
        </div>

        <div className="train-card-mid">
          <div className="train-info-box">
            <span className="mini-label">ORARIO</span>
            <span className="main-value">{formatClock(ts)}</span>
          </div>
          <div className="train-info-box">
            <span className="mini-label">ETA</span>
            <span className="countdown-value">{formatCountdown(ts, now)}</span>
          </div>
          <div className="train-info-box">
            <span className="mini-label">RITARDO</span>
            <span className={`delay-value ${delayInfo.className}`}>
              {delayInfo.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TrainCard;
