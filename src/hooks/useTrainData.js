import { useCallback, useEffect, useRef, useState } from 'react';
import { RUNTIME } from '../config/runtime';
import { fetchTrainData } from '../services/viaggiatreno';

const EMPTY = {
  arrivals: [],
  departures: [],
  fetchedAt: 0,
  source: 'none',
  transport: null,
  dataState: 'offline',
  error: null,
};

/**
 * Scarica arrivi/partenze con polling, espone un refresh manuale e registra
 * ogni esito. Elimina le richieste concorrenti (es. StrictMode in dev) e
 * mette in pausa il polling quando la scheda non e' visibile.
 */
export const useTrainData = ({ addLog }) => {
  const [data, setData] = useState(EMPTY);
  const inFlightRef = useRef(false);
  const lastSuccessRef = useRef(0);

  const load = useCallback(
    async ({ force = false, reason = 'auto' } = {}) => {
      if (inFlightRef.current) return;
      if (!force && Date.now() - lastSuccessRef.current < RUNTIME.minRefetchIntervalMs) return;

      inFlightRef.current = true;
      try {
        const result = await fetchTrainData({ nowMs: Date.now() });
        setData(result);
        if (result.source === 'network') lastSuccessRef.current = result.fetchedAt;

        if (result.dataState === 'offline') {
          addLog(`Nessun dato disponibile: ${result.error}`, 'error');
        } else if (result.dataState === 'timetable') {
          addLog(`Rete non raggiungibile (${result.error}): uso l'orario teorico, ritardi esclusi`, 'warn');
        } else if (result.dataState === 'cached') {
          addLog(`Rete non raggiungibile (${result.error}): uso l'ultimo dato salvato`, 'warn');
        } else if (result.dataState === 'empty') {
          addLog('L\'API ha risposto con zero treni: dati considerati non attendibili', 'warn');
        } else if (result.dataState === 'partial') {
          addLog(`Dati parziali (${result.error})`, 'warn');
        } else if (reason === 'manual') {
          addLog(`Aggiornato a mano tramite ${result.transport}`, 'success');
        } else {
          addLog(
            `${result.arrivals.length} arrivi + ${result.departures.length} partenze via ${result.transport}`,
            'info',
          );
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [addLog],
  );

  useEffect(() => {
    load({ force: true, reason: 'startup' });

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load({ reason: 'auto' });
    }, RUNTIME.pollIntervalMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') load({ reason: 'resume' });
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const refresh = useCallback(() => load({ force: true, reason: 'manual' }), [load]);

  return { data, refresh };
};
