import { t } from '../i18n/he.js';
import { PAS_DE_LA_CASA } from '../lib/weather.js';

const w = t.trip.weather;
const dayName = (iso, i) => (i === 0 ? w.today : new Intl.DateTimeFormat('he-IL', { weekday: 'short' }).format(new Date(`${iso}T12:00:00`)));
const clock = (ms) => new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));

// Live conditions and a 7-day outlook for Pas de la Casa (Open-Meteo, refreshed every 30 minutes).
export default function WeatherCard({ weather, id }) {
  const { data, error } = weather;
  return (
    <section className="card weather-card" id={id}>
      <div className="card-head">
        <h2>{w.title}</h2>
        {data?.fetchedAt && <span className="muted small">{w.updated(clock(data.fetchedAt))}</span>}
      </div>
      {!data ? (
        <p className="muted small" aria-busy={!error}>{error ? w.error : w.loading}</p>
      ) : (
        <>
          <div className="weather-now">
            <span className="weather-emoji" aria-hidden>{data.now.emoji}</span>
            <div className="weather-temp" dir="ltr">{data.now.temp}°</div>
            <div className="weather-meta">
              <b>{data.now.label}</b>
              <span className="muted small">
                {[w.feels(data.now.feels), w.wind(data.now.wind), data.days[0] && w.snowToday(data.days[0].snow)].filter(Boolean).join(' · ')}
              </span>
              <span className="muted small">{PAS_DE_LA_CASA.name}</span>
            </div>
          </div>
          <ul className="weather-days">
            {data.days.map((d, i) => (
              <li key={d.date} title={d.label}>
                <span className="small">{dayName(d.date, i)}</span>
                <span aria-hidden>{d.emoji}</span>
                <b dir="ltr">{d.max}°</b>
                <span className="muted small" dir="ltr">{d.min}°</span>
                <span className={`snow-amt${d.snow >= 1 ? ' on' : ''}`}>{d.snow >= 1 ? `${Math.round(d.snow)} ס״מ` : '–'}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
