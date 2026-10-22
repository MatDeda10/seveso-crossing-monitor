/**
 * Proxy CORS + cache per Viaggiatreno, da deployare su Cloudflare Workers.
 *
 * Perche' serve: l'API di Viaggiatreno non invia header `Access-Control-Allow-Origin`,
 * quindi il browser non puo' leggerla direttamente. I proxy pubblici gratuiti
 * (corsproxy.io, allorigins, ...) richiedono una API key oppure sono spesso in
 * rate limit: questo Worker e' tuo, gratuito e con cache inclusa.
 *
 * Deploy (2 minuti):
 *   1. https://dash.cloudflare.com -> Workers & Pages -> Create -> Worker
 *   2. incolla questo file, Deploy
 *   3. copia l'URL (es. https://viaggiatreno-proxy.TUONOME.workers.dev)
 *   4. mettilo in `.env` come VITE_PROXY_URL e nei secret di GitHub Actions
 *
 * In alternativa, dal repository basta attivare il workflow
 * `.github/workflows/deploy-worker.yml` (variabile WORKER_DEPLOY = true) con i
 * secret CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID: il Worker viene
 * pubblicato automaticamente a ogni modifica.
 *
 * Uso: GET https://<worker>/?url=<url-encoded viaggiatreno URL>
 *      GET https://<worker>/?type=partenze|arrivi   (usa l'ora corrente)
 */

const UPSTREAM_HOST = 'www.viaggiatreno.it';
const STATION_CODE = 'S01925'; // Seveso
const CACHE_SECONDS = 20;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const GIORNI = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MESI = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n) => String(n).padStart(2, '0');

/** Viaggiatreno vuole il formato "Fri Oct 16 2026 12:30:00 GMT+0200". */
function formatRequestDate(date = new Date()) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const gmt = `GMT${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
  return (
    `${GIORNI[date.getDay()]} ${MESI[date.getMonth()]} ${pad(date.getDate())} ` +
    `${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${gmt}`
  );
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...extraHeaders },
  });
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const rawTarget = url.searchParams.get('url');

    let target;
    if (rawTarget) {
      target = rawTarget;
    } else if (type === 'partenze' || type === 'arrivi') {
      target = `https://${UPSTREAM_HOST}/infomobilita/resteasy/viaggiatreno/${type}/${STATION_CODE}/${encodeURIComponent(formatRequestDate())}`;
    } else {
      return json({ error: 'Parametro mancante: usa ?type=partenze|arrivi oppure ?url=<url>' }, 400);
    }

    // Sicurezza: nessun open proxy, solo verso Viaggiatreno.
    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      return json({ error: 'URL non valido' }, 400);
    }
    if (parsed.hostname !== UPSTREAM_HOST || parsed.protocol !== 'https:') {
      return json({ error: `Host non consentito: ${parsed.hostname}` }, 403);
    }

    const cache = caches.default;
    const cacheKey = new Request(parsed.toString(), { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) {
      const hit = new Response(cached.body, cached);
      hit.headers.set('X-Proxy-Cache', 'HIT');
      hit.headers.set('Access-Control-Allow-Origin', '*');
      return hit;
    }

    let upstream;
    try {
      upstream = await fetch(parsed.toString(), {
        headers: { accept: 'application/json', 'user-agent': 'seveso-crossing-monitor/1.1 (+github.com/MatDeda10)' },
      });
    } catch (error) {
      return json({ error: `Upstream non raggiungibile: ${error.message}` }, 502);
    }

    if (!upstream.ok) {
      return json({ error: `Upstream ha risposto ${upstream.status}` }, 502);
    }

    const body = await upstream.text();
    const response = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
        ...CORS_HEADERS,
        'X-Proxy-Cache': 'MISS',
      },
    });

    // La cache del Worker ignora il Cache-Control della risposta in uscita,
    // quindi salviamo esplicitamente una copia con la scadenza voluta.
    const toCache = new Response(body, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `max-age=${CACHE_SECONDS}` },
    });
    await cache.put(cacheKey, toCache);

    return response;
  },
};
