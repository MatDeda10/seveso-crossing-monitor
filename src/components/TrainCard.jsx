import React from 'react';

const branchLabel = {
  COMMON: 'TRONCO COMUNE',
  BRENNERO: 'CAMNAGO',
  FARGA: 'ASSO',
  CESANO: 'CESANO',
  UNKNOWN: 'SCONOSCIUTO'
};

const getRealtimeStatus = (train, now) => {

  const ts =
    train.arrivalTs ||
    train.departureTs;

  const deltaSec =
    Math.floor((ts - now.getTime()) / 1000);

  // già passato
  if (deltaSec < -60) {
    return {
      label: 'TRANSITATO',
      className: 'passed'
    };
  }

  // in arrivo
  if (deltaSec <= 120) {
    return {
      label: 'IN ARRIVO',
      className: 'incoming'
    };
  }

  // prossimo
  return {
    label: 'PROGRAMMATO',
    className: 'scheduled'
  };
};

const formatCountdown = (ts, now) => {

  const sec =
    Math.max(
      0,
      Math.floor((ts - now.getTime()) / 1000)
    );

  const m =
    Math.floor(sec / 60);

  const s =
    sec % 60;

  if (m <= 0) {
    return `${s}s`;
  }

  return `${m}m ${s}s`;
};

function TrainCard({ train, now }) {

  const ts =
    train.arrivalTs ||
    train.departureTs;

  const realtime =
    getRealtimeStatus(train, now);

  return (

    <div
      className={`train-card ${train.direction.toLowerCase()}`}
    >

      {/* ========================================================= */}
      {/* ACCENT */}
      {/* ========================================================= */}

      <div className="train-card-accent"></div>

      {/* ========================================================= */}
      {/* BODY */}
      {/* ========================================================= */}

      <div className="train-card-body">

        {/* ===================================================== */}
        {/* HEADER */}
        {/* ===================================================== */}

        <div className="train-card-header">

          <div className="train-left">

            <div className="train-top-row">

              <span className="train-category">
                {train.category}
              </span>

              <span className="train-number">
                {train.id}
              </span>

            </div>

            <div className="train-destination">
              {train.destination}
            </div>

          </div>

          <div className="train-right">

            <div className={`train-status ${realtime.className}`}>
              {realtime.label}
            </div>

            <div className={`direction-chip ${train.direction.toLowerCase()}`}>

              {train.direction === 'NORD'
                ? '▲ NORD'
                : '▼ SUD'}

            </div>

          </div>

        </div>

        {/* ===================================================== */}
        {/* MID */}
        {/* ===================================================== */}

        <div className="train-card-mid">

          <div className="train-info-box">

            <span className="mini-label">
              ORARIO
            </span>

            <span className="main-value">
              {train.schedTime}
            </span>

          </div>

          <div className="train-info-box">

            <span className="mini-label">
              RITARDO
            </span>

            <span className={`delay-value ${
              train.delayMin > 0
                ? 'late'
                : 'ontime'
            }`}>

              {train.delayMin > 0
                ? `+${train.delayMin}'`
                : 'OK'}

            </span>

          </div>

          <div className="train-info-box">

            <span className="mini-label">
              RAMO
            </span>

            <span className="branch-value">
              {branchLabel[train.routeBranch]}
            </span>

          </div>

        </div>

        {/* ===================================================== */}
        {/* FOOTER */}
        {/* ===================================================== */}

        <div className="train-card-footer">

          <div className="countdown-box">

            <span className="mini-label">
              TRANSITO
            </span>

            <span className="countdown-value">
              {formatCountdown(ts, now)}
            </span>

          </div>

          <div className="confidence-box">

            <span className="mini-label">
              AFFIDABILITÀ
            </span>

            <span className="confidence-value">
              {Math.round(train.confidence * 100)}%
            </span>

          </div>

        </div>

      </div>

    </div>
  );
}

export default TrainCard;