import { useEffect, useState } from 'react';

/** Un solo timer condiviso: `nowMs` aggiornato ogni secondo. */
export const useClock = (intervalMs = 1000) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNowMs(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return nowMs;
};
