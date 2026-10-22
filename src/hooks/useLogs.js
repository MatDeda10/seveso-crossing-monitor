import { useCallback, useEffect, useState } from 'react';
import { RUNTIME } from '../config/runtime';

const readStoredLogs = () => {
  try {
    const raw = localStorage.getItem(RUNTIME.storageKeys.logs);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Log applicativo persistito: prima viveva solo in memoria e spariva
 * ad ogni refresh (inutile per capire cosa e' andato storto ieri).
 */
export const useLogs = () => {
  const [logs, setLogs] = useState(readStoredLogs);

  useEffect(() => {
    try {
      localStorage.setItem(RUNTIME.storageKeys.logs, JSON.stringify(logs));
    } catch {
      /* storage non disponibile */
    }
  }, [logs]);

  const addLog = useCallback((message, type = 'info') => {
    setLogs((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          ts: Date.now(),
          level: type,
          msg: message,
        },
        ...prev,
      ].slice(0, RUNTIME.maxLogEntries),
    );
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, addLog, clearLogs };
};
