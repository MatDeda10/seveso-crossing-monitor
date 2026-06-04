/* ============================================================================
 * TIME FORMAT UTILITIES - Centralized
 * ========================================================================== */

export const formatClock = (ts, options = {}) => {
  if (!ts) {
    return '--:--';
  }

  const locale = options.locale || [];
  const hour2digit = options.hour2digit !== false;

  return new Date(ts).toLocaleTimeString(locale, {
    hour: hour2digit ? '2-digit' : 'numeric',
    minute: '2-digit'
  });
};

export const formatCountdown = (ts, now) => {
  if (!ts) {
    return '--';
  }

  const deltaSec = Math.floor((ts - now.getTime()) / 1000);

  // C12 FIX: Ridotto range da -90 a +60 a -30 a +60
  if (deltaSec <= 0 && deltaSec > -30) {
    return 'ORA';
  }

  if (deltaSec < -30) {
    return 'PASSATO';
  }

  const m = Math.floor(deltaSec / 60);
  const s = deltaSec % 60;

  if (m <= 0) {
    return `${s}s`;
  }

  if (m < 60) {
    return `${m}m ${s}s`;
  }

  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

export const getRealtimeStatus = (train, now) => {
  const ts = train.arrivalTs || train.departureTs;

  if (!ts) {
    return {
      label: 'NON DISPONIBILE',
      className: 'unknown'
    };
  }

  const deltaSec = Math.floor((ts - now.getTime()) / 1000);

  if (deltaSec < -60) {
    return {
      label: 'TRANSITATO',
      className: 'passed'
    };
  }

  if (deltaSec <= 60) {
    return {
      label: 'IMMINENTE',
      className: 'imminent'
    };
  }

  if (deltaSec <= 240) {
    return {
      label: 'IN ARRIVO',
      className: 'incoming'
    };
  }

  return {
    label: 'PROGRAMMATO',
    className: 'scheduled'
  };
};

export const getDelayLabel = (delay) => {
  const value = delay || 0;

  // T1 FIX: Gestire anticipi (negativi)
  if (value < -5) {
    return {
      label: `${value}min (ANTICIPO)`,
      className: 'early'
    };
  }

  if (value <= 0) {
    return {
      label: 'IN ORARIO',
      className: 'ontime'
    };
  }

  if (value <= 5) {
    return {
      label: `+${value}min`,
      className: 'minor'
    };
  }

  if (value <= 15) {
    return {
      label: `+${value}min`,
      className: 'medium'
    };
  }

  return {
    label: `+${value}min`,
    className: 'major'
  };
};

export const computeConfidence = (train) => {
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
