/**
 * Proxy CORS per lo SVILUPPO locale, senza dipendenze.
 *
 * Serve perche' Viaggiatreno non invia header CORS e i proxy pubblici sono
 * inaffidabili. In produzione usa il Worker in `workers/viaggiatreno-proxy.js`;
 * questo script fa la stessa cosa ma sulla tua macchina.
 *
 * Uso:
 *   npm run dev:proxy
 * e in `.env.local`:
 *   VITE_PROXY_URL=http://localhost:8787/?url={url}
 */

import http from 'node:http';

const PORT = Number(process.env.PORT ?? 8787);
const UPSTREAM_HOST = 'www.viaggiatreno.it';
const STATION_CODE = process.env.STATION_CODE ?? 'S01925';
const CACHE_SECONDS = 20;

const GIORNI = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MESI = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n) => String(n).padStart(2, '0');

/** Stessa formattazione richiesta da Viaggiatreno: "Fri Oct 16 2026 12:30:00 GMT+0200". */
function formatRequestDate(date = new Date()) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);

  return (
    `${GIORNI[date.getDay()]} ${MESI[date.getMonth()]} ${pad(date.getDate())} ` +
    `${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ` +
    `GMT${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`
  );
}

const cache = new Map();

const send = (res, status, payload) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
};

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://localhost:${PORT}`);
  const type = requestUrl.searchParams.get('type');
  const rawTarget = requestUrl.searchParams.get('url');

  let target = rawTarget;
  if (!target && (type === 'partenze' || type === 'arrivi')) {
    target = `https://${UPSTREAM_HOST}/infomobilita/resteasy/viaggiatreno/${type}/${STATION_CODE}/${encodeURIComponent(formatRequestDate())}`;
  }

  if (!target) {
    return send(res, 400, { error: 'Usa ?type=partenze|arrivi oppure ?url=<url>' });
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return send(res, 400, { error: 'URL non valido' });
  }

  if (parsed.hostname !== UPSTREAM_HOST) {
    return send(res, 403, { error: `Host non consentito: ${parsed.hostname}` });
  }

  const key = parsed.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_SECONDS * 1000) {
    console.log(`[cache] ${type ?? parsed.pathname}`);
    return send(res, 200, hit.body);
  }

  try {
    const upstream = await fetch(key, { headers: { accept: 'application/json' } });
    const text = await upstream.text();
    console.log(`[proxy] ${type ?? parsed.pathname} -> ${upstream.status} (${text.length} byte)`);

    if (!upstream.ok) {
      return send(res, 502, { error: `Upstream ${upstream.status}` });
    }

    const body = JSON.parse(text);
    cache.set(key, { at: Date.now(), body });
    return send(res, 200, body);
  } catch (error) {
    console.error(`[errore] ${error.message}`);
    return send(res, 502, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Proxy di sviluppo su http://localhost:${PORT}`);
  console.log(`Prova: http://localhost:${PORT}/?type=partenze`);
});
