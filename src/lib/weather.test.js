import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dayVerdict, describeCode, fetchWeather, parseWeather, snowIntensity, WEATHER_URL, windFactor } from './weather.js';

const sample = {
  current: { temperature_2m: -4.4, apparent_temperature: -9.6, weather_code: 73, wind_speed_10m: 22.3, snowfall: 0.8, is_day: 1 },
  daily: {
    time: ['2026-12-01', '2026-12-02'],
    weather_code: [73, 0],
    temperature_2m_max: [-2.1, 1],
    temperature_2m_min: [-8.4, -6],
    snowfall_sum: [12.34, 0],
    wind_speed_10m_max: [40, 20],
  },
};

beforeEach(() => {
  globalThis.localStorage = (() => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  })();
});

describe('weather', () => {
  it('points at Pas de la Casa', () => {
    const url = WEATHER_URL();
    expect(url).toContain('latitude=42.5428');
    expect(url).toContain('longitude=1.7336');
  });

  it('maps weather codes', () => {
    expect(describeCode(73).kind).toBe('snow');
    expect(describeCode(0).kind).toBe('clear');
    expect(describeCode(999).kind).toBe('cloud');
  });

  it('parses the API response', () => {
    const w = parseWeather(sample);
    expect(w.now).toMatchObject({ temp: -4, feels: -10, wind: 22, kind: 'snow', isDay: true });
    expect(w.days).toHaveLength(2);
    expect(w.days[0]).toMatchObject({ max: -2, min: -8, snow: 12.3 });
  });

  it('rejects malformed responses', () => {
    expect(() => parseWeather({})).toThrow();
  });

  it('scales snow intensity with conditions', () => {
    const snowy = parseWeather(sample).now;
    expect(snowIntensity(snowy)).toBeGreaterThan(snowIntensity({ kind: 'clear', snowfall: 0 }));
    expect(snowIntensity({ kind: 'storm', snowfall: 99 })).toBeCloseTo(0.9);
    expect(snowIntensity(null)).toBeGreaterThan(0);
    expect(windFactor({ wind: 120 })).toBe(1);
  });

  it('gives a verdict per day', () => {
    const [snow, clear] = parseWeather(sample).days;
    expect(dayVerdict(snow).label).toBe('יום פודרה');
    expect(dayVerdict(clear).emoji).toBe('😎');
  });

  it('caches a successful fetch', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => sample }));
    await fetchWeather({ fetchImpl, now: 1000 });
    await fetchWeather({ fetchImpl, now: 2000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await fetchWeather({ fetchImpl, now: 1000 + 31 * 60 * 1000 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws on HTTP errors', async () => {
    await expect(fetchWeather({ fetchImpl: async () => ({ ok: false, status: 500 }) })).rejects.toThrow('500');
  });
});
