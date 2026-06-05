import {
  WINDOWS,
  CATEGORY_CONFIG,
  BRANCHES
} from '../config/topology';

/* --- UTILS --- */
const normalizeStationName = (value = '') => {
  return String(value).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
};

const isSuppressed = (train) => {
  const suppressionCodes = [1, 2, 3];
  return suppressionCodes.includes(train.provvedimento) || 
         ['SOPPRESSO', 'CANCELLED'].includes(train.status);
};

/* --- SERVER LAG (C4 FIX) --- */
const calculateServerLag = (trains) => {
  const now = Date.now();
  if (!trains || trains.length === 0) return 0;
  
  const recent = trains.filter(t => {
    const ts = t.arrivalTs || t.departureTs;
    return ts && (now - ts) < 300000; 
  });

  if (recent.length === 0) return 0;
  const avgTs = recent.reduce((sum, t) => sum + (t.arrivalTs || t.departureTs), 0) / recent.length;
  return Math.max(0, now - avgTs - 5000); 
};

/* --- ROUTING & DIRECTION (C5 FIX) --- */
const NORTH_STATIONS = ['ASSO', 'ERBA', 'CANZO', 'MERONE', 'MARIANO', 'CAMNAGO', 'LENTATE', 'MEDA'];

const inferDirection = (train) => {
  const dest = normalizeStationName(train.destinazione || '');
  const orig = normalizeStationName(train.origine || '');
  
  // Se l'origine è a Nord, il treno sta scendendo a SUD (indipendentemente dalla destinazione)
  if (NORTH_STATIONS.some(s => orig.includes(s))) return 'SUD';
  if (NORTH_STATIONS.some(s => dest.includes(s))) return 'NORD';
  return 'SUD'; 
};

const inferRouteBranch = (destination = '') => {
  const d = normalizeStationName(destination);
  if (d.includes('CAMNAGO') || d.includes('LENTATE')) return BRANCHES.CAMNAGO;
  if (d.includes('ASSO') || d.includes('ERBA') || d.includes('MARIANO')) return BRANCHES.ASSO;
  return BRANCHES.COMMON;
};

/* --- ETA ENGINE (C2 FIX - Segmented Model) --- */
const calculateTravelMs = (train, crossing) => {
  let speedKmh = train.config.avgSpeedKmh;
  
  // Se il PL è < 400m dalla stazione (Manzoni/Montello), il treno è in accelerazione/frenata
  // Non può viaggiare alla velocità di crociera standard.
  if (crossing.distanceMeters < 400) {
    speedKmh = speedKmh * 0.55; 
  }

  const speedMs = (speedKmh * 1000) / 3600;
  const rawTravel = crossing.distanceMeters / speedMs;
  return (rawTravel / train.config.accelerationFactor) * 1000;
};

/* --- CONFIDENCE (C9 FIX - Multi-factor) --- */
const computeConfidence = (syncAge, delay, distance, mergedCount) => {
  let score = 100;
  if (syncAge > WINDOWS.STALE_SOFT) score -= 15;
  if (syncAge > WINDOWS.STALE_HARD) score -= 25;
  if (Math.abs(delay) > 10) score -= 15;
  if (distance > 1500) score -= 10;
  if (mergedCount > 1) score -= 8;
  return Math.max(25, score);
};

/* --- MERGE LOGIC (C1/C7 FIX) --- */
const mergeIntervals = (intervals) => {
  if (intervals.length <= 1) return intervals;
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const current = sorted[i];
    const gap = current.start - last.end;

    if (gap < 25000) { // Merge se gap < 25s
      last.end = Math.max(last.end, current.end);
      last.trainIds = [...(last.trainIds || [last.trainId]), current.trainId];
      last.trainId = last.trainIds.join(' + ');
    } else {
      merged.push(current);
    }
  }
  return merged;
};

/* --- MAIN ENGINE --- */
export const predictCrossings = ({ arrivals, departures, crossings, now, lastSyncTs }) => {
  const currentTime = now.getTime();
  const syncAge = currentTime - lastSyncTs;

  // 1. Pre-process trains
  const trains = [...arrivals, ...departures]
    .filter(t => t.numeroTreno && !isSuppressed(t))
    .map(t => {
      const baseTs = new Date(t.orarioArrivo || t.orarioPartenza).getTime();
      const realtimeTs = baseTs + (t.ritardo || 0) * 60000;
      const category = CATEGORY_CONFIG[t.categoria] ? t.categoria : 'default';
      
      return {
        id: t.numeroTreno,
        direction: inferDirection(t),
        routeBranch: inferRouteBranch(t.destinazione),
        arrivalTs: t.orarioArrivo ? realtimeTs : null,
        departureTs: t.orarioPartenza ? realtimeTs : null,
        delay: t.ritardo || 0,
        config: CATEGORY_CONFIG[category]
      };
    });

  const serverLag = calculateServerLag(trains);

  // 2. Process Crossings
  const results = crossings.map(crossing => {
    let intervals = [];

    trains.forEach(train => {
      if (crossing.branch !== BRANCHES.COMMON && train.routeBranch !== crossing.branch) return;

      const travelMs = calculateTravelMs(train, crossing);
      let eventTs = null;

      if (train.direction === 'NORD') {
        eventTs = crossing.side === 'CESANO' ? train.arrivalTs - serverLag - travelMs : train.departureTs - serverLag + travelMs;
      } else {
        eventTs = crossing.side === 'MEDA' ? train.arrivalTs - serverLag - travelMs : train.departureTs - serverLag + travelMs;
      }

      if (eventTs) {
        intervals.push({
          trainId: train.id,
          start: eventTs - (crossing.closureLeadSec * 1000),
          likelyClosed: eventTs - (crossing.fullClosureSec * 1000),
          end: eventTs + (crossing.reopenBufferSec * 1000),
          delay: train.delay
        });
      }
    });

    const merged = mergeIntervals(intervals);
    const active = merged.find(i => currentTime >= i.start && currentTime <= i.end);
    const next = merged.find(i => i.start > currentTime);

    let status = 'APERTO', color = 'green', reason = 'Viabilità regolare', timer = null;

    if (syncAge > WINDOWS.STALE_HARD) {
      status = 'INCERTO'; color = 'gray'; reason = 'Dati non aggiornati';
    } else if (active) {
      const isClosed = currentTime >= active.likelyClosed;
      status = isClosed ? 'CHIUSO' : 'IN CHIUSURA';
      color = isClosed ? 'red' : 'yellow';
      reason = isClosed ? `Transito ${active.trainId}` : 'Chiusura barriere';
      timer = `${Math.ceil((active.end - currentTime) / 1000)}s`;
    } else if (next && (next.start - currentTime) < WINDOWS.IMMINENT_THRESHOLD * 1000) {
      status = 'PREALLERTA'; color = 'blue'; reason = `Treno ${next.trainId} in arrivo`;
      timer = `${Math.ceil((next.start - currentTime) / 1000)}s`;
    }

    return {
      ...crossing,
      status,
      color,
      reason,
      timer,
      confidence: computeConfidence(syncAge, (active || next)?.delay || 0, crossing.distanceMeters, (active || next)?.trainIds?.length || 1)
    };
  });

  return { crossings: results, trains };
};
