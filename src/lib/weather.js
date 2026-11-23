// Pas de la Casa (Grandvalira, Andorra) weather from Open-Meteo: free, no API key, CORS-enabled.
export const PAS_DE_LA_CASA = { name: 'פאס דה לה קאסה, אנדורה', lat: 42.5428, lon: 1.7336, elevation: 2100 };

export const WEATHER_URL = ({ lat, lon, elevation } = PAS_DE_LA_CASA) =>
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${lat}&longitude=${lon}&elevation=${elevation}&timezone=auto&forecast_days=7&wind_speed_unit=kmh` +
  '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,snowfall,is_day' +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,snowfall_sum,wind_speed_10m_max';

// WMO weather codes -> emoji, Hebrew label and a coarse kind used by the snow effects.
const CODES = [
  [[0], '☀️', 'שמיים בהירים', 'clear'],
  [[1, 2], '🌤️', 'מעונן חלקית', 'cloud'],
  [[3], '☁️', 'מעונן', 'cloud'],
  [[45, 48], '🌫️', 'ערפל', 'fog'],
  [[51, 53, 55, 56, 57], '🌦️', 'טפטוף', 'rain'],
  [[61, 63, 65, 66, 67, 80, 81, 82], '🌧️', 'גשם', 'rain'],
  [[71, 73, 75, 77, 85, 86], '🌨️', 'שלג', 'snow'],
  [[95, 96, 99], '⛈️', 'סופת רעמים', 'storm'],
];

export function describeCode(code) {
  const hit = CODES.find(([codes]) => codes.includes(code));
  return hit ? { emoji: hit[1], label: hit[2], kind: hit[3] } : { emoji: '❔', label: 'לא ידוע', kind: 'cloud' };
}

const round = (n) => (Number.isFinite(n) ? Math.round(n) : null);

export function parseWeather(json) {
  const c = json?.current;
  const d = json?.daily;
  if (!c || !d?.time) throw new Error('bad weather response');
  return {
    now: {
      temp: round(c.temperature_2m),
      feels: round(c.apparent_temperature),
      wind: round(c.wind_speed_10m),
      snowfall: c.snowfall ?? 0, // cm in the last hour
      code: c.weather_code,
      isDay: c.is_day !== 0,
      ...describeCode(c.weather_code),
    },
    days: d.time.map((date, i) => ({
      date,
      code: d.weather_code[i],
      max: round(d.temperature_2m_max[i]),
      min: round(d.temperature_2m_min[i]),
      snow: Math.round((d.snowfall_sum[i] ?? 0) * 10) / 10, // cm
      wind: round(d.wind_speed_10m_max[i]),
      ...describeCode(d.weather_code[i]),
    })),
  };
}

// 0..1 drives how heavy the background snow is: a calm drizzle of flakes by default, a blizzard in a storm.
export function snowIntensity(now) {
  if (!now) return 0.35;
  const base = { snow: 0.7, storm: 0.6, clear: 0.25, cloud: 0.35, fog: 0.4, rain: 0.3 }[now.kind] ?? 0.35;
  return Math.min(1, base + Math.min(0.3, (now.snowfall ?? 0) / 3));
}

// 0..1 horizontal wind push for the flakes.
export const windFactor = (now) => Math.min(1, (now?.wind ?? 8) / 60);

// A short skier-friendly verdict for a day.
export function dayVerdict(day) {
  if (day.snow >= 10) return { emoji: '🤩', label: 'יום פודרה' };
  if (day.wind >= 50) return { emoji: '💨', label: 'רוח חזקה' };
  if (day.kind === 'storm') return { emoji: '⚠️', label: 'סופה' };
  if (day.kind === 'clear' || day.kind === 'cloud') return { emoji: '😎', label: 'יום טוב לגלוש' };
  return { emoji: '🙂', label: 'סביר' };
}

const CACHE_KEY = 'snowcrew:weather:v1';
const TTL = 30 * 60 * 1000;

function readCache(now) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (c && now - c.at < TTL) return c.data;
  } catch {
    /* no cache */
  }
  return null;
}

// Cached for 30 minutes so reloads don't hit the API. Rejects on network errors; callers show a quiet fallback.
export async function fetchWeather({ fetchImpl = fetch, now = Date.now(), signal } = {}) {
  const cached = readCache(now);
  if (cached) return cached;
  const res = await fetchImpl(WEATHER_URL(), { signal });
  if (!res.ok) throw new Error(`weather ${res.status}`);
  const data = parseWeather(await res.json());
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: now, data }));
  } catch {
    /* storage blocked */
  }
  return data;
}
