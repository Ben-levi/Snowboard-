import { useEffect, useState } from 'react';
import { fetchWeather } from '../lib/weather.js';

// { data, error }: data is null until loaded. Refreshes every 30 minutes while the app is open.
export function useWeather() {
  const [state, setState] = useState({ data: null, error: false });
  useEffect(() => {
    const ctrl = new AbortController();
    const load = () =>
      fetchWeather({ signal: ctrl.signal })
        .then((data) => setState({ data, error: false }))
        .catch((e) => {
          if (e.name !== 'AbortError') setState((s) => ({ data: s.data, error: true }));
        });
    load();
    const id = setInterval(load, 30 * 60 * 1000);
    return () => {
      ctrl.abort();
      clearInterval(id);
    };
  }, []);
  return state;
}
