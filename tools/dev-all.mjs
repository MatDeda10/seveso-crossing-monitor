/**
 * Avvia insieme il proxy CORS locale e il server di sviluppo, impostando
 * `VITE_PROXY_URL` al volo.
 *
 * Serve a togliere di mezzo il passaggio piu' fragile della messa in funzione:
 * senza proxy il browser non puo' leggere Viaggiatreno (che non invia header
 * CORS) e l'app sembra "rotta" mostrando tutto offline.
 *
 * Uso: npm run dev:all
 */

import { spawn } from 'node:child_process';
import process from 'node:process';

const PROXY_PORT = Number(process.env.PROXY_PORT ?? 8787);
const children = [];
let stopping = false;

const stopAll = (code = 0) => {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => {
    if (!child.killed) child.kill();
  });
  process.exit(code);
};

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

const start = (label, args, env = {}) => {
  const child = spawn(process.execPath, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });

  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`[dev:all] ${label} e' terminato (codice ${code}).`);
      stopAll(code ?? 0);
    }
  });

  children.push(child);
  return child;
};

start('proxy', ['tools/dev-proxy.mjs'], { PORT: String(PROXY_PORT) });

start('vite', ['node_modules/vite/bin/vite.js'], {
  VITE_PROXY_URL: `http://localhost:${PROXY_PORT}/?url={url}`,
});
