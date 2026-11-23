import { PAS_DE_LA_CASA, dayVerdict } from '../lib/weather.js';
import { snowBurst } from './Snowfall.jsx';

const dayName = (iso, i) => (i === 0 ? 'היום' : new Intl.DateTimeFormat('he-IL', { weekday: 'short' }).format(new Date(`${iso}T12:00:00`)));

// Live conditions + 7-day outlook for the resort. Tap the card for a puff of snow.
export default function WeatherCard({ weather }) {
  const { data, error } = weather;
  if (!data) {
    return (
      <section className="card weather-card" aria-busy={!error}>
        <p className="muted small">{error ? '☁️ לא הצלחנו לטעון את מזג האוויר כרגע' : '🌨️ טוען מזג אוויר…'}</p>
      </section>
    );
  }
  const { now, days } = data;
  const today = days[0];
  return (
    <section
      className="card weather-card"
      data-kind={now.kind}
      onPointerDown={(e) => snowBurst(e.clientX, e.clientY)}
    >
      <div className="weather-now">
        <span className="weather-emoji" aria-hidden>{now.emoji}</span>
        <div>
          <div className="weather-temp" dir="ltr">{now.temp}°</div>
          <div className="muted small">{now.label} · מרגיש {now.feels}°</div>
        </div>
        <div className="weather-meta muted small">
          <span>📍 {PAS_DE_LA_CASA.name}</span>
          <span>💨 {now.wind} קמ״ש</span>
          {today && <span>❄️ {today.snow} ס״מ היום</span>}
        </div>
      </div>
      <ul className="weather-days">
        {days.map((d, i) => {
          const v = dayVerdict(d);
          return (
            <li key={d.date} title={`${d.label} · ${v.label}`}>
              <span className="small">{dayName(d.date, i)}</span>
              <span aria-hidden>{d.emoji}</span>
              <b dir="ltr">{d.max}°</b>
              <span className="muted small" dir="ltr">{d.min}°</span>
              <span className={`snow-amt${d.snow >= 1 ? ' on' : ''}`}>{d.snow >= 1 ? `❄️${Math.round(d.snow)}` : '·'}</span>
              <span aria-hidden title={v.label}>{v.emoji}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
