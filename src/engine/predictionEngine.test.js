import { describe, expect, it } from 'vitest';
import { BRANCHES, SIDES, resolveCategoryConfig } from '../config/topology';
import {
  buildTrains,
  estimateCrossingTs,
  inferRouteBranch,
  mergeIntervals,
  predictCrossings,
} from './predictionEngine';

/** Istante di riferimento usato da tutti i test. */
const T = Date.UTC(2026, 9, 16, 10, 0, 0);

/**
 * Record nella forma reale di Viaggiatreno.
 * Nota: nelle risposte `arrivi` la `destinazione` e' SEMPRE null e nelle
 * `partenze` l'`origine` e' SEMPRE null. Questo e' il motivo per cui i due
 * record dello stesso treno vanno uniti.
 */
const arrivalRecord = (over = {}) => ({
  numeroTreno: 1234,
  categoria: 'REG',
  origine: 'ASSO',
  destinazione: null,
  orarioArrivo: T,
  orarioPartenza: null,
  ritardo: 0,
  provvedimento: 0,
  ...over,
});

const departureRecord = (over = {}) => ({
  numeroTreno: 1234,
  categoria: 'REG',
  origine: null,
  destinazione: 'MILANO CADORNA',
  orarioArrivo: null,
  orarioPartenza: T + 120_000,
  ritardo: 0,
  provvedimento: 0,
  ...over,
});

const crossing = (over = {}) => ({
  id: 'test',
  name: 'PL di test',
  locality: 'Seveso',
  branch: BRANCHES.COMMON,
  side: SIDES.CESANO,
  distanceMeters: 600,
  closureLeadSec: 60,
  fullClosureSec: 40,
  reopenBufferSec: 30,
  ...over,
});

describe('buildTrains', () => {
  it('unisce arrivo e partenza dello stesso treno in un unico record', () => {
    const { trains, stats } = buildTrains({
      arrivals: [arrivalRecord()],
      departures: [departureRecord()],
    });

    expect(trains).toHaveLength(1);
    expect(stats.duplicatedRecords).toBe(1);
    expect(trains[0].destination).toBe('MILANO CADORNA');
    expect(trains[0].origin).toBe('ASSO');
    expect(trains[0].stopsAtStation).toBe(true);
  });

  it('riconosce il ramo Asso da un treno in arrivo, la cui destinazione e\' null', () => {
    const { trains } = buildTrains({ arrivals: [arrivalRecord()] });

    expect(trains[0].destination).toBeNull();
    expect(trains[0].routeBranch).toBe(BRANCHES.ASSO);
    expect(trains[0].direction).toBe('SUD');
  });

  it('classifica come NORD un treno che arriva da Milano', () => {
    const { trains } = buildTrains({
      arrivals: [arrivalRecord({ origine: 'MILANO ROGOREDO' })],
    });

    expect(trains[0].direction).toBe('NORD');
  });

  it('somma il ritardo agli orari programmati', () => {
    const { trains } = buildTrains({ departures: [departureRecord({ ritardo: 12 })] });

    expect(trains[0].scheduledStationTs).toBe(T + 120_000);
    expect(trains[0].stationTs).toBe(T + 120_000 + 12 * 60_000);
  });

  it('scarta le corse soppresse e i record senza orario', () => {
    const { trains, stats } = buildTrains({
      arrivals: [
        arrivalRecord({ numeroTreno: 1, provvedimento: 1 }),
        arrivalRecord({ numeroTreno: 2, orarioArrivo: null, orarioPartenza: null }),
        arrivalRecord({ numeroTreno: 3 }),
      ],
    });

    expect(trains.map((t) => t.id)).toEqual(['3']);
    expect(stats.suppressed).toBe(1);
    expect(stats.withoutTime).toBe(1);
  });

  it('marca come non determinato il ramo quando l\'unico capo noto e\' a sud', () => {
    const { trains } = buildTrains({
      arrivals: [arrivalRecord({ origine: 'MILANO ROGOREDO' })],
    });

    expect(trains[0].routeBranch).toBe(BRANCHES.UNKNOWN);
  });
});

describe('inferRouteBranch', () => {
  it('riconosce il ramo Camnago dal nome della destinazione', () => {
    expect(inferRouteBranch('CAMNAGO-LENTATE', null)).toBe(BRANCHES.CAMNAGO);
  });

  it('assegna al tronco comune le stazioni intermedie', () => {
    expect(inferRouteBranch('MEDA', null)).toBe(BRANCHES.COMMON);
  });

  it('usa il codice linea (S2/S4) quando i nomi delle stazioni non bastano', () => {
    expect(inferRouteBranch('MILANO CADORNA', null, 'S2')).toBe(BRANCHES.ASSO);
    expect(inferRouteBranch('MILANO CADORNA', null, 'S4')).toBe(BRANCHES.CAMNAGO);
    expect(inferRouteBranch('MILANO CADORNA', null, 'REG')).toBe(BRANCHES.UNKNOWN);
  });
});

describe('resolveCategoryConfig', () => {
  it('riconosce le linee suburbane (prima la chiave "S" non matchava mai)', () => {
    expect(resolveCategoryConfig('S4').label).toBe('Suburbano S4');
    expect(resolveCategoryConfig('REG').label).toBe('Regionale');
    expect(resolveCategoryConfig('XYZ').label).toBe('Standard');
  });
});

describe('mergeIntervals', () => {
  const first = {
    trainIds: ['1646'],
    start: 0,
    likelyClosed: 10,
    end: 100,
    delay: 0,
    uncertain: false,
  };
  const second = {
    trainIds: ['3311'],
    start: 200,
    likelyClosed: 210,
    end: 300,
    delay: 0,
    uncertain: false,
  };

  it('mantiene interi gli id dei treni (non li spezza in caratteri)', () => {
    const merged = mergeIntervals([first, second]);

    expect(merged).toHaveLength(1);
    expect(merged[0].trainIds).toEqual(['1646', '3311']);
  });

  it('non modifica gli intervalli ricevuti', () => {
    mergeIntervals([first, second]);

    expect(first.trainIds).toEqual(['1646']);
    expect(first.end).toBe(100);
  });

  it('non fonde chiusure distanti fra loro', () => {
    const far = { ...second, start: 40_000, likelyClosed: 40_500, end: 41_000 };

    expect(mergeIntervals([first, far])).toHaveLength(2);
  });
});

describe('estimateCrossingTs', () => {
  it('non stima nulla se la direzione non e\' nota', () => {
    const train = {
      direction: 'UNKNOWN',
      arrivalTs: T,
      departureTs: T,
      config: { avgSpeedKmh: 62, accelerationFactor: 0.9 },
    };

    expect(estimateCrossingTs(train, crossing())).toBeNull();
  });
});

describe('predictCrossings', () => {
  it('non dichiara mai "aperto" quando i dati mancano', () => {
    const offline = predictCrossings({
      trains: [],
      crossings: [crossing()],
      nowMs: T,
      syncAgeMs: 10_000,
      dataState: 'offline',
    });
    expect(offline.crossings[0].status).toBe('OFFLINE');
    expect(offline.crossings[0].color).toBe('gray');

    const empty = predictCrossings({
      trains: [],
      crossings: [crossing()],
      nowMs: T,
      syncAgeMs: 10_000,
      dataState: 'empty',
    });
    expect(empty.crossings[0].status).toBe('INCERTO');
  });

  it('passa a OFFLINE quando i dati sono troppo vecchi', () => {
    const { crossings } = predictCrossings({
      trains: [],
      crossings: [crossing()],
      nowMs: T,
      syncAgeMs: 10 * 60_000,
      dataState: 'ok',
    });

    expect(crossings[0].status).toBe('OFFLINE');
  });

  it('chiude prima il lato di provenienza e poi quello opposto', () => {
    const { trains } = buildTrains({
      departures: [departureRecord({ destinazione: 'ASSO', orarioPartenza: T })],
    });
    expect(trains[0].direction).toBe('NORD');

    const { crossings } = predictCrossings({
      trains,
      crossings: [crossing({ id: 'cesano', side: SIDES.CESANO }), crossing({ id: 'meda', side: SIDES.MEDA })],
      nowMs: T - 50_000,
      syncAgeMs: 1_000,
      dataState: 'ok',
    });

    // Cinquantamila ms prima del passaggio a Seveso il treno proviene dal lato
    // Cesano (barriere gia' chiuse) e non ha ancora raggiunto il lato Meda.
    expect(crossings[0].status).toBe('CHIUSO');
    expect(crossings[0].color).toBe('red');
    expect(crossings[1].status).not.toBe('CHIUSO');
  });

  it('sposta la chiusura stimata in avanti con il ritardo', () => {
    const onTime = buildTrains({ departures: [departureRecord({ orarioPartenza: T })] }).trains;
    const delayed = buildTrains({
      departures: [departureRecord({ orarioPartenza: T, ritardo: 20 })],
    }).trains;

    const options = {
      crossings: [crossing()],
      nowMs: T - 120_000,
      syncAgeMs: 1_000,
      dataState: 'ok',
    };

    const a = predictCrossings({ trains: onTime, ...options }).crossings[0];
    const b = predictCrossings({ trains: delayed, ...options }).crossings[0];

    // Il punto medio dell'intervallo non dipende dall'incertezza: un ritardo
    // di 20 minuti deve spostarlo esattamente di 20 minuti.
    const midpoint = (pl) => (pl.nextWindowFrom + pl.nextWindowTo) / 2;

    expect(midpoint(b) - midpoint(a)).toBe(20 * 60_000);
    expect(b.nextWindowFrom).toBeGreaterThan(a.nextWindowFrom);
  });

  it('include in modo prudente i treni con ramo non determinato', () => {
    const { trains } = buildTrains({
      arrivals: [arrivalRecord({ origine: 'MILANO ROGOREDO' })],
    });

    const { crossings } = predictCrossings({
      trains,
      crossings: [crossing({ branch: BRANCHES.ASSO })],
      nowMs: T - 120_000,
      syncAgeMs: 1_000,
      dataState: 'ok',
    });

    expect(crossings[0].isUncertain).toBe(true);
    expect(crossings[0].confidence).toBeLessThan(100);
  });

  it('non attiva i PL di un ramo che il treno non percorre', () => {
    const { trains } = buildTrains({
      departures: [departureRecord({ destinazione: 'CAMNAGO-LENTATE' })],
    });

    const { crossings } = predictCrossings({
      trains,
      crossings: [crossing({ branch: BRANCHES.ASSO })],
      nowMs: T,
      syncAgeMs: 1_000,
      dataState: 'ok',
    });

    expect(crossings[0].status).toBe('APERTO');
    expect(crossings[0].nextClosureInSec).toBeNull();
  });

  it('espone un intervallo di chiusura piu\' largo della stima puntuale', () => {
    const { trains } = buildTrains({ departures: [departureRecord({ orarioPartenza: T })] });

    const { crossings } = predictCrossings({
      trains,
      crossings: [crossing()],
      nowMs: T,
      syncAgeMs: 1_000,
      dataState: 'ok',
    });

    const [pl] = crossings;
    if (pl.windowFrom !== null) {
      expect(pl.windowTo - pl.windowFrom).toBeGreaterThan(pl.fullClosureSec * 2 * 1000);
    }
  });

  it('tiene utilizzabili i dati salvati in cache finche\' non sono troppo vecchi', () => {
    const { trains } = buildTrains({ departures: [departureRecord({ orarioPartenza: T + 120_000 })] });

    const cached = predictCrossings({
      trains,
      crossings: [crossing()],
      nowMs: T,
      syncAgeMs: 60_000,
      dataState: 'cached',
    });
    expect(cached.crossings[0].status).not.toBe('OFFLINE');
    expect(cached.crossings[0].usingCached).toBe(true);

    // Oltre la soglia dura la cache non e' piu' affidabile: si torna OFFLINE.
    const tooOld = predictCrossings({
      trains,
      crossings: [crossing()],
      nowMs: T,
      syncAgeMs: 10 * 60_000,
      dataState: 'cached',
    });
    expect(tooOld.crossings[0].status).toBe('OFFLINE');
  });

  it('usa l\'orario teorico senza dichiararlo "vecchio", ma con attendibilita\' ridotta', () => {
    const { trains } = buildTrains({ departures: [departureRecord({ orarioPartenza: T })] });

    const options = { crossings: [crossing()], nowMs: T - 120_000, dataState: 'ok' };

    const live = predictCrossings({ trains, ...options });
    const theoretical = predictCrossings({ trains, ...options, dataState: 'timetable' });

    // Un orario teorico molto "vecchio" non deve diventare OFFLINE: e' un dato
    // strutturale, non una misura scaduta.
    const ancientTimetable = predictCrossings({
      trains,
      crossings: [crossing()],
      nowMs: T - 120_000,
      syncAgeMs: 10 * 60_000,
      dataState: 'timetable',
    });

    expect(theoretical.meta.theoryOnly).toBe(true);
    expect(theoretical.crossings[0].status).not.toBe('OFFLINE');
    expect(theoretical.crossings[0].theoryOnly).toBe(true);
    expect(ancientTimetable.crossings[0].status).not.toBe('OFFLINE');
    expect(theoretical.crossings[0].confidence).toBeLessThan(live.crossings[0].confidence);
  });
});
