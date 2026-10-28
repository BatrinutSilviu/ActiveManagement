import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

export function useApi(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    if (!url) return;
    setLoading(true);
    api.get(url).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [url]);
  useEffect(load, [load]);
  return { data, error, loading, reload: load };
}

const read = () => {
  const s = getComputedStyle(document.documentElement);
  const v = (n) => s.getPropertyValue(n).trim();
  return {
    income: v('--income'), expense: v('--expense'), founders: v('--founders'), sportfund: v('--sportfund'), general: v('--general'), reinvested: v('--reinvested'), pos: v('--profit-pos'), neg: v('--profit-neg'), series: v('--series'),
    grid: v('--grid'), axis: v('--axis'), muted: v('--muted'), surface: v('--surface'), text: v('--text'),
  };
};

// Resolved chart colours, refreshed when the OS or the in-app theme changes.
export function useChartColors() {
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const update = () => setColors(read());
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    window.addEventListener('am:theme', update);
    return () => { mq.removeEventListener('change', update); window.removeEventListener('am:theme', update); };
  }, []);
  return colors;
}

export function usePersistentState(key, initial) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s == null ? initial : JSON.parse(s); } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }, [key, v]);
  return [v, setV];
}
