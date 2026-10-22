/**
 * Genera l'ORARIO TEORICO di Seveso a partire da Viaggiatreno, da usare come
 * ripiego quando il proxy non e' configurato o la rete non risponde.
 *
 * Perche' funziona: l'endpoint `partenze`/`arrivi` accetta una data arbitraria
 * e, se la data e' nel futuro, restituisce l'orario PROGRAMMATO di quel giorno.
 * Quindi interrogando le 24 ore di un lunedi', di un sabato e di una domenica
 * si ricostruisce l'intero orario dei tre tipi di servizio.
 *
 * Uso: npm run schedule:update
 *
 * Nota: i file prodotti stanno in `public/schedule/` e vengono serviti
 * direttamente dal sito statico, senza bisogno di alcun proxy.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UPSTREAM = 'https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno';
const STATION = 'S01925'; // Seveso
const GIORNI = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MESI = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAUSA_MS = 150;

const pad = (n) => String(n).padStart(2, '0');

/** Formato richiesto da Viaggiatreno, con l'offset locale valido per quella data. */
function formatRequestDate(date) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return (
    `${GIORNI[date.getDay()]} ${MESI[date.getMonth()]} ${pad(date.getDate())} ` +
    `${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ` +
    `GMT${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Prossimo giorno feriale/sabato/domenica a partire da domani. */
function nextDayOfKind(kind) {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 1; i <= 8; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const day = d.getDay(); // 0 dom, 6 sab
    if (kind === 'sabato' && day === 6) return d;
    if (kind === 'festivo' && day === 0) return d;
    if (kind === 'feriale' && day >= 1 && day <= 5) return d;
  }
  throw new Error(`Nessun giorno trovato per ${kind}`);
}

const fetchJson = async (type, date) => {
  const url = `${UPSTREAM}/${type}/${STATION}/${encodeURIComponent(formatRequestDate(date))}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${type} -> HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim().startsWith('[')) throw new Error(`${type} -> risposta non JSON`);
  return JSON.parse(text);
};

const tsOf = (value) => {
  const ts = Number(value);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
};

/**
 * Da record Viaggiatreno a treni unici.
 * `partenze` fornisce la destinazione, `arrivi` l'origine: le due meta' dello
 * stesso treno vengono unite quando distano meno di 30 minuti.
 */
function mergeRecords(records) {
  const byNumber = new Map();

  for (const raw of records) {
    const n = String(raw?.numeroTreno ?? '').trim();
    if (!n) continue;
    const a = tsOf(raw.orarioArrivo);
    const p = tsOf(raw.orarioPartenza);
    const ts = a ?? p;
    if (ts === null) continue;

    if (!byNumber.has(n)) byNumber.set(n, []);
    byNumber.get(n).push({
      n,
      c: raw.categoria ?? 'REG',
      o: raw.origine ?? null,
      d: raw.destinazione ?? null,
      a: a,
      p: p,
      ts,
    });
  }

  const trains = [];

  for (const list of byNumber.values()) {
    list.sort((x, y) => x.ts - y.ts);
    let current = null;

    for (const item of list) {
      if (current && item.ts - current.lastTs < 30 * 60_000) {
        current.o = current.o ?? item.o;
        current.d = current.d ?? item.d;
        current.a = current.a ?? item.a;
        current.p = current.p ?? item.p;
        current.lastTs = Math.max(current.lastTs, item.ts);
        continue;
      }

      if (current) trains.push(current);
      current = { ...item, lastTs: item.ts };
    }

    if (current) trains.push(current);
  }

  const seen = new Set();
  return trains
    .filter((t) => {
      const key = `${t.n}|${t.a}|${t.p}|${t.o}|${t.d}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((x, y) => x.ts - y.ts);
}

const orario = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

async function buildDay(kind) {
  const day = nextDayOfKind(kind);
  const records = [];

  for (let hour = 0; hour < 24; hour += 1) {
    const at = new Date(day);
    at.setHours(hour, 0, 0, 0);

    for (const type of ['partenze', 'arrivi']) {
      try {
        const data = await fetchJson(type, at);
        records.push(...data);
      } catch (error) {
        console.warn(`  ! ${kind} ${pad(hour)}:00 ${type}: ${error.message}`);
      }
      await sleep(PAUSA_MS);
    }
  }

  const trains = mergeRecords(records).map((t) => {
    const row = { n: Number(t.n), c: t.c, o: t.o, d: t.d };
    if (t.a) row.a = orario(t.a);
    if (t.p) row.p = orario(t.p);
    return row;
  });

  const source = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
  console.log(`  ${kind}: ${trains.length} treni (da ${source}, ${records.length} record grezzi)`);

  return {
    kind,
    generatedAt: new Date().toISOString(),
    sourceDate: source,
    station: STATION,
    trains,
  };
}

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(here, '..', 'public', 'schedule');

await mkdir(outputDir, { recursive: true });

for (const kind of ['feriale', 'sabato', 'festivo']) {
  console.log(`Genero l'orario ${kind}...`);
  const payload = await buildDay(kind);
  const file = resolve(outputDir, `${kind}.json`);
  await writeFile(file, `${JSON.stringify(payload)}\n`, 'utf8');
  console.log(`  scritto ${file}`);
}

console.log('Fatto.');
