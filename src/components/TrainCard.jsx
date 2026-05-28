import React, {
  useMemo
} from 'react';

/* ============================================================================
 * LABELS
 * ========================================================================== */

const BRANCH_LABELS = {

  COMMON: 'Tronco Comune',

  CAMNAGO: 'Camnago',

  ASSO: 'Asso',

  UNKNOWN: 'Da verificare'
};

const CATEGORY_LABELS = {

  S: 'Suburbano',

  REG: 'Regionale',

  DIR: 'Diretto'
};

/* ============================================================================
 * HELPERS
 * ========================================================================== */

const formatClock = ts => {

  if (!ts) {
    return '--:--';
  }

  return new Date(ts)
    .toLocaleTimeString([], {

      hour: '2-digit',

      minute: '2-digit'
    });
};

const formatCountdown = (
  ts,
  now
) => {

  if (!ts) {
    return '--';
  }

  const deltaSec =
    Math.floor(
      (ts - now.getTime()) / 1000
    );

  if (deltaSec <= 0) {
    return 'ORA';
  }

  const m =
    Math.floor(deltaSec / 60);

  const s =
    deltaSec % 60;

  if (m <= 0) {
    return `${s}s`;
  }

  if (m < 60) {
    return `${m}m ${s}s`;
  }

  const h =
    Math.floor(m / 60);

  return `${h}h ${m % 60}m`;
};

const getRealtimeStatus = (
  train,
  now
) => {

  const ts =
    train.arrivalTs ||
    train.departureTs;

  if (!ts) {

    return {

      label: 'NON DISPONIBILE',

      className: 'unknown'
    };
  }

  const deltaSec =
    Math.floor(
      (ts - now.getTime()) / 1000
    );

  /*
   * già passato
   */

  if (deltaSec < -90) {

    return {

      label: 'TRANSITATO',

      className: 'passed'
    };
  }

  /*
   * imminente
   */

  if (deltaSec <= 60) {

    return {

      label: 'IMMINENTE',

      className: 'imminent'
    };
  }

  /*
   * in arrivo
   */

  if (deltaSec <= 240) {

    return {

      label: 'IN ARRIVO',

      className: 'incoming'
    };
  }

  /*
   * regolare
   */

  return {

    label: 'PROGRAMMATO',

    className: 'scheduled'
  };
};

const getDelayLabel = delay => {

  if (!delay || delay <= 0) {

    return {

      label: 'IN ORARIO',

      className: 'ontime'
    };
  }

  if (delay <= 5) {

    return {

      label: `+${delay} min`,

      className: 'minor'
    };
  }

  if (delay <= 15) {

    return {

      label: `+${delay} min`,

      className: 'medium'
    };
  }

  return {

    label: `+${delay} min`,

    className: 'major'
  };
};

const computeConfidence = train => {

  let score = 100;

  if (train.delay > 5) {
    score -= 8;
  }

  if (train.delay > 10) {
    score -= 12;
  }

  if (train.routeBranch === 'UNKNOWN') {
    score -= 15;
  }

  return Math.max(40, score);
};

/* ============================================================================
 * COMPONENT
 * ========================================================================== */

function TrainCard({

  train,

  now
}) {

  const ts =
    train.arrivalTs ||
    train.departureTs;

  const realtime =
    useMemo(() => {

      return getRealtimeStatus(
        train,
        now
      );

    }, [train, now]);

  const delay =
    useMemo(() => {

      return getDelayLabel(
        train.delay || 0
      );

    }, [train]);

  const confidence =
    useMemo(() => {

      return computeConfidence(train);

    }, [train]);

  return (

    <div
      className={`
        train-card
        ${train.direction.toLowerCase()}
        ${realtime.className}
      `}
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

            <div className="train-category-label">

              {CATEGORY_LABELS[train.category] ||
                'Servizio ferroviario'}

            </div>

          </div>

          <div className="train-right">

            <div className={`
              train-status
              ${realtime.className}
            `}>

              {realtime.label}

            </div>

            <div className={`
              direction-chip
              ${train.direction.toLowerCase()}
            `}>

              {train.direction === 'NORD'
                ? '▲ NORD'
                : '▼ SUD'}

            </div>

          </div>

        </div>

        {/* ===================================================== */}
        {/* INFO GRID */}
        {/* ===================================================== */}

        <div className="train-info-grid">

          {/* ORARIO */}

          <div className="train-info-box">

            <span className="mini-label">
              ORARIO
            </span>

            <span className="main-value">

              {formatClock(ts)}

            </span>

          </div>

          {/* COUNTDOWN */}

          <div className="train-info-box">

            <span className="mini-label">
              ETA
            </span>

            <span className="countdown-value">

              {formatCountdown(ts, now)}

            </span>

          </div>

          {/* RITARDO */}

          <div className="train-info-box">

            <span className="mini-label">
              RITARDO
            </span>

            <span className={`
              delay-value
              ${delay.className}
            `}>

              {delay.label}

            </span>

          </div>

          {/* RAMO */}

          <div className="train-info-box">

            <span className="mini-label">
              RAMO
            </span>

            <span className="branch-value">

              {BRANCH_LABELS[train.routeBranch]}

            </span>

          </div>

        </div>

        {/* ===================================================== */}
        {/* FOOTER */}
        {/* ===================================================== */}

        <div className="train-card-footer">

          <div className="confidence-box">

            <span className="mini-label">
              AFFIDABILITÀ
            </span>

            <span className="confidence-value">

              {confidence}%

            </span>

          </div>

          <div className="train-meta">

            realtime • viaggiatreno

          </div>

        </div>

      </div>

    </div>
  );
}

export default TrainCard;