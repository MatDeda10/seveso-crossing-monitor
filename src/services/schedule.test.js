import { describe, expect, it } from 'vitest';
import { scheduleKindFor, timetableToRecords } from './schedule';

const at = (y, m, d, h = 12, min = 0) => new Date(y, m, d, h, min, 0).getTime();
const clock = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

describe('scheduleKindFor', () => {
  it('distingue feriale, sabato e domenica', () => {
    expect(scheduleKindFor(new Date(2026, 9, 16))).toBe('feriale'); // venerdi'
    expect(scheduleKindFor(new Date(2026, 9, 17))).toBe('sabato');
    expect(scheduleKindFor(new Date(2026, 9, 18))).toBe('festivo'); // domenica
    expect(scheduleKindFor(new Date(2026, 9, 19))).toBe('feriale'); // lunedi'
  });

  it('tratta le festivita\' come servizio festivo anche in mezzo alla settimana', () => {
    expect(scheduleKindFor(new Date(2026, 11, 25))).toBe('festivo'); // Natale, venerdi'
    expect(scheduleKindFor(new Date(2026, 7, 15))).toBe('festivo'); // Ferragosto, sabato
    expect(scheduleKindFor(new Date(2026, 3, 6))).toBe('festivo'); // Lunedi' dell'Angelo
  });
});

describe('timetableToRecords', () => {
  it('emette un record di arrivo e uno di partenza per un treno che sosta', () => {
    const payload = {
      trains: [{ n: 640, c: 'REG', o: 'ASSO', d: 'MILANO CADORNA', a: '12:26', p: '12:28' }],
    };

    const { arrivals, departures } = timetableToRecords(payload, at(2026, 9, 16, 12));

    expect(arrivals).toHaveLength(1);
    expect(departures).toHaveLength(1);
    expect(clock(arrivals[0].orarioArrivo)).toBe('12:26');
    expect(clock(departures[0].orarioPartenza)).toBe('12:28');
    // Origine e destinazione sono note su entrambi i record: l'engine le usa
    // per dedurre direzione e ramo anche quando ne vede solo una delle due.
    expect(arrivals[0].origine).toBe('ASSO');
    expect(arrivals[0].destinazione).toBe('MILANO CADORNA');
    expect(departures[0].ritardo).toBe(0);
  });

  it('emette un solo record per un transito senza fermata', () => {
    const payload = { trains: [{ n: 24241, c: 'REG', o: null, d: 'MILANO ROGOREDO', p: '13:05' }] };

    const { arrivals, departures } = timetableToRecords(payload, at(2026, 9, 16, 13));

    expect(arrivals).toHaveLength(0);
    expect(departures).toHaveLength(1);
  });

  it('gestisce i treni a cavallo della mezzanotte', () => {
    const payload = {
      trains: [{ n: 795, c: 'REG', o: 'MILANO CADORNA', d: 'CAMNAGO-LENTATE', a: '23:58', p: '00:00' }],
    };

    const { arrivals, departures } = timetableToRecords(payload, at(2026, 9, 16, 23, 30));

    // La partenza appartiene al giorno successivo, non a quello corrente.
    expect(departures[0].orarioPartenza - arrivals[0].orarioArrivo).toBe(2 * 60_000);
  });

  it('non esplode con un payload vuoto o malformato', () => {
    expect(timetableToRecords(null, Date.now())).toEqual({ arrivals: [], departures: [] });
    expect(timetableToRecords({ trains: [] }, Date.now())).toEqual({ arrivals: [], departures: [] });
  });
});
