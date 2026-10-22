/* ============================================================================
 * FORMATTAZIONE DATE, COUNTDOWN E GIUDIZI DI STATO
 * Ogni funzione qui dentro e' definita UNA SOLA VOLTA.
 * ========================================================================== */

import { WINDOWS } from '../config/windows';

const clockFormatter = new Intl.DateTimeFormat('it-IT', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "12:34" — orario locale a due cifre. */
export const formatClock = (ts) => (ts ? clockFormatter.format(new Date(ts)) : '--:--');

/** "12:34–12:37" — intervallo orario (per mostrare l'incertezza della stima). */
export const formatWindow = (fromTs, toTs) => {
  if (!fromTs || !toTs) return '--:--';
  if (Math.abs(toTs - fromTs) < 60_000) return formatClock(fromTs);
  return `${formatClock(fromTs)}–${formatClock(toTs)}`;
};

/** "2m 05s", "45s", "ORA", "PASSATO". */
export const formatCountdown = (ts, nowMs) => {
  if (!ts) return '--';

  const deltaSec = Math.floor((ts - nowMs) / 1000);

  if (deltaSec <= 0 && deltaSec > -WINDOWS.countdown.nowWindowSec) return 'ORA';
  if (deltaSec <= -WINDOWS.countdown.pastAfterSec) return 'PASSATO';

  const absSec = Math.abs(deltaSec);
  const m = Math.floor(absSec / 60);
  const s = absSec % 60;

  if (m <= 0) return `${s}s`;
  if (m < 60) return `${m}m ${String(s).padStart(2, '0')}s`;

  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
};

/** Durata da un numero di secondi: "1m 12s". */
export const formatDuration = (totalSec) => {
  if (totalSec === null || totalSec === undefined || Number.isNaN(totalSec)) return '--';
  const sec = Math.max(0, Math.round(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m <= 0) return `${s}s`;
  if (m < 60) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

/** "12s fa", "3m fa". */
export const formatRelative = (ts, nowMs) => {
  if (!ts) return 'mai';
  const sec = Math.max(0, Math.round((nowMs - ts) / 1000));
  if (sec < 60) return `${sec}s fa`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m fa`;
  return `${Math.floor(sec / 3600)}h fa`;
};

/** Etichetta del ritardo. */
export const getDelayLabel = (delay) => {
  const value = delay || 0;

  if (value < -5) return { label: `${value} min (anticipo)`, className: 'early' };
  if (value <= 0) return { label: 'In orario', className: 'ontime' };
  if (value <= 5) return { label: `+${value} min`, className: 'minor' };
  if (value <= 15) return { label: `+${value} min`, className: 'medium' };
  return { label: `+${value} min`, className: 'major' };
};

/**
 * Stato temporale di un evento ferroviario.
 * @param {number|null} ts istante dell'evento
 * @param {number} nowMs
 */
export const getRealtimeStatus = (ts, nowMs) => {
  if (!ts) return { label: 'N.D.', className: 'unknown' };

  const deltaSec = Math.floor((ts - nowMs) / 1000);

  if (deltaSec < -WINDOWS.countdown.pastAfterSec) return { label: 'TRANSITATO', className: 'passed' };
  if (deltaSec <= WINDOWS.realtime.imminentSec) return { label: 'IMMINENTE', className: 'imminent' };
  if (deltaSec <= WINDOWS.realtime.incomingSec) return { label: 'IN ARRIVO', className: 'incoming' };
  return { label: 'PROGRAMMATO', className: 'scheduled' };
};

/**
 * Attendibilita' dell'orario di un treno (0-100), con fattori espliciti.
 * Non e' una probabilita': e' solo una sintesi leggibile dei segnali disponibili.
 */
export const computeScheduleConfidence = (train) => {
  let score = 100;
  if (train.delay > 5) score -= 8;
  if (train.delay > 10) score -= 14;
  if (train.routeBranch === 'UNKNOWN' || train.direction === 'UNKNOWN') score -= 18;
  if (!train.destination) score -= 10;
  return Math.max(30, Math.min(100, Math.round(score)));
};
