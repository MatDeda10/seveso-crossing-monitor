// Configurazione parametri temporali (in secondi)
export const WINDOWS = {
  preAlertStart: 120,
  closingStart: 90,
  closedStart: 50,
  reopeningStart: -30,
  reopeningEnd: -60
};

export const PRIORITY = {
  CLOSED: 4,
  CLOSING: 3,
  PREALERT: 2,
  REOPENING: 1,
  OPEN: 0
};

const CATEGORY_SPEED = {
  'S': 0.8,    // Suburbano (più lento/fermate frequenti)
  'REG': 1.0,  // Regionale standard
  'DIR': 1.3,  // Diretto/Espresso (veloce)
  'default': 1.0
};

/**
 * Motore di predizione dei Passaggi a Livello
 */
export const predictCrossings = ({ arrivals, departures, crossings, now, lastSyncTs }) => {
  const currentTime = now.getTime();
  const dataAgeSec = (currentTime - lastSyncTs) / 1000;
  const isDataStale = dataAgeSec > 90;

  // 1. Normalizzazione Treni
  const trains = normalizeTrains([...arrivals, ...departures]);

  // 2. Generazione Timeline per ogni PL
  const results = crossings.map(pl => {
    let plIntervals = [];

    trains.forEach(train => {
      const events = getPLEventsForTrain(train, pl);
      
      events.forEach(eventTs => {
        // Calcolo finestre temporali basate sull'evento
        plIntervals.push({
          start: eventTs - (WINDOWS.preAlertStart * 1000),
          end: eventTs - (WINDOWS.reopeningEnd * 1000),
          closedStart: eventTs - (WINDOWS.closedStart * 1000),
          closingStart: eventTs - (WINDOWS.closingStart * 1000),
          reopeningStart: eventTs - (WINDOWS.reopeningStart * 1000),
          trainId: train.id,
          trainCat: train.cat,
          confidence: calculateConfidence(train, isDataStale)
        });
      });
    });

    // 3. Merge Intervalli (Blocco Continuo)
    const mergedIntervals = mergeIntervals(plIntervals);
    
    // 4. Determinazione Stato Attuale
    return determineCurrentState(pl, mergedIntervals, currentTime, isDataStale);
  });

  return results;
};

const normalizeTrains = (rawList) => {
  const map = new Map();
  rawList.forEach(t => {
    if (t.provvedimento === 1) return;
    
    const type = t.orarioArrivo ? 'ARRIVO' : 'PARTENZA';
    const baseTs = t.orarioArrivo || t.orarioPartenza;
    const realTs = new Date(baseTs).getTime() + ((t.ritardo || 0) * 60000);
    
    const dest = (t.destinazione || t.origine || "").toUpperCase();
    const direction = (dest.includes("ASSO") || dest.includes("CAMNAGO") || dest.includes("MARIANO") || dest.includes("MEDA")) ? "NORD" : "SUD";
    
    const catKey = t.categoriaDescrizione || t.categoria || 'REG';
    const speedFactor = CATEGORY_SPEED[catKey[0]] || CATEGORY_SPEED.default;

    if (!map.has(t.numeroTreno)) {
      map.set(t.numeroTreno, {
        id: t.numeroTreno,
        cat: catKey,
        dir: direction,
        speedFactor,
        hasArrival: false,
        hasDeparture: false,
        arrivalTs: null,
        departureTs: null,
        hasDelayData: t.ritardo !== null
      });
    }

    const train = map.get(t.numeroTreno);
    if (type === 'ARRIVO') { train.hasArrival = true; train.arrivalTs = realTs; }
    if (type === 'PARTENZA') { train.hasDeparture = true; train.departureTs = realTs; }
  });
  return Array.from(map.values());
};

const getPLEventsForTrain = (train, pl) => {
  const events = [];
  const effectiveOffset = pl.offset * train.speedFactor * 1000;

  // Logica Direzionale NORD: Entra da Cesano, Esce da Meda
  if (train.dir === "NORD") {
    if (train.hasArrival && pl.side === 'CESANO') events.push(train.arrivalTs - effectiveOffset);
    if (train.hasDeparture && pl.side === 'MEDA') events.push(train.departureTs + effectiveOffset);
  } else {
    // SUD: Entra da Meda, Esce da Cesano
    if (train.hasArrival && pl.side === 'MEDA') events.push(train.arrivalTs - effectiveOffset);
    if (train.hasDeparture && pl.side === 'CESANO') events.push(train.departureTs + effectiveOffset);
  }
  return events;
};

const mergeIntervals = (intervals) => {
  if (intervals.length <= 1) return intervals;
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const current = sorted[i];

    if (current.start <= last.end + 10000) { // 10s di tolleranza per evitare flip-flop
      last.end = Math.max(last.end, current.end);
      last.confidence = Math.min(last.confidence, current.confidence);
      last.trainId = `${last.trainId} + ${current.trainId}`;
    } else {
      merged.push(current);
    }
  }
  return merged;
};

const calculateConfidence = (train, isDataStale) => {
  let score = 0.95;
  if (!train.hasDelayData) score -= 0.25;
  if (isDataStale) score -= 0.40;
  return Math.max(0.1, score);
};

const determineCurrentState = (pl, intervals, now, isDataStale) => {
  const active = intervals.find(i => now >= i.start && now <= i.end);
  
  if (isDataStale) {
    return { ...pl, status: 'NON AFFIDABILE', color: 'gray', confidence: 0, reason: 'Dati ViaggiaTreno obsoleti' };
  }

  if (!active) {
    return { ...pl, status: 'APERTO', color: 'green', confidence: 1.0, reason: 'Circolazione regolare' };
  }

  if (now >= active.closedStart && now <= active.reopeningStart) 
    return { ...pl, status: 'CHIUSO', color: 'red', confidence: active.confidence, reason: `Treno ${active.trainId}` };
  
  if (now >= active.closingStart) 
    return { ...pl, status: 'IN CHIUSURA', color: 'yellow', confidence: active.confidence, reason: `Treno ${active.trainId}` };
  
  if (now >= active.start) 
    return { ...pl, status: 'PREALLERTA', color: 'blue', confidence: active.confidence, reason: 'Chiusura imminente' };

  return { ...pl, status: 'IN RIAPERTURA', color: 'orange', confidence: active.confidence, reason: 'Treno transitato' };
};
