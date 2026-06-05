import React, { useMemo } from 'react';
import { 
  formatClock, 
  formatCountdown, 
  getDelayLabel, 
  getRealtimeStatus,
  computeConfidence 
} from '../utils/timeFormat';

// Mappa per i nomi dei rami
const BRANCH_LABELS = {
  COMMON: 'Tronco Comune',
  CAMNAGO: 'S4 Camnago',
  ASSO: 'S2 Asso',
  UNKNOWN: 'Da verificare'
};

function TrainCard({ train, now }) {
  const ts = train.arrivalTs || train.departureTs;
  
  // Calcolo dati arricchiti
  const delayInfo = useMemo(() => getDelayLabel(train.delay), [train.delay]);
  const statusInfo = useMemo(() => getRealtimeStatus(train, now), [train, now]);
  const confidence = useMemo(() => computeConfidence(train), [train]);

  return (
    <div className={`train-card ${train.direction.toLowerCase()} ${statusInfo.className}`}>
      {/* Accento laterale colorato (Blu per Nord, Rosso per Sud) */}
      <div className="train-card-accent"></div>
      
      <div className="train-card-body">
        {/* HEADER: Numero e Destinazione */}
        <div className="train-card-header">
          <div className="train-left">
            <div className="train-top-row">
              <span className="train-category">{train.category}</span>
              <span className="train-number">#{train.id}</span>
            </div>
            <div className="train-destination">{train.destination}</div>
          </div>
          
          <div className="train-right">
            <div className={`status-badge ${statusInfo.className}`}>
              {statusInfo.label}
            </div>
            <div className={`direction-chip ${train.direction.toLowerCase()}`}>
              {train.direction === 'NORD' ? '▲ NORD' : '▼ SUD'}
            </div>
          </div>
        </div>

        {/* GRID: Informazioni tecniche */}
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

          <div className="train-info-box">
            <span className="mini-label">RAMO</span>
            <span className="branch-value">{BRANCH_LABELS[train.routeBranch] || 'Comune'}</span>
          </div>
        </div>

        {/* FOOTER: Affidabilità e Sorgente */}
        <div className="train-card-footer">
          <div className="confidence-section">
            <div className="confidence-header">
              <span className="mini-label">AFFIDABILITÀ STIMA</span>
              <span className="confidence-percent">{confidence}%</span>
            </div>
            <div className="confidence-bar-container">
              <div 
                className="confidence-bar-fill" 
                style={{ 
                  width: `${confidence}%`,
                  backgroundColor: confidence > 80 ? '#22c55e' : confidence > 50 ? '#eab308' : '#ef4444'
                }}
              ></div>
            </div>
          </div>
          <div className="data-source">realtime • viaggiatreno</div>
        </div>
      </div>
    </div>
  );
}

export default TrainCard;
