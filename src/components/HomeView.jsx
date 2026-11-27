import { t } from '../i18n/he.js';
import { flightsOf, nextFlight } from '../lib/flights.js';
import { myOpenTasks } from '../lib/groups.js';
import { formatRange, tripPhase } from '../lib/tripInfo.js';
import FlightsCard, { statusText } from './FlightsCard.jsx';
import NotesCard from './NotesCard.jsx';
import PeopleCard, { InfoList } from './PeopleCard.jsx';
import SharedList from './SharedList.jsx';
import WeatherCard from './WeatherCard.jsx';

const T = t.trip;
const JUMPS = ['list', 'flights', 'weather', 'notes', 'people'];

function Countdown({ info }) {
  const p = tripPhase(info.dateFrom, info.dateTo);
  if (p.phase === 'unknown') return null;
  let text;
  if (p.phase === 'before') text = t.home.countdown(p.days);
  else if (p.phase === 'during') text = p.day === 1 ? t.home.today : t.home.during(p.day);
  else text = t.home.over;
  return <div className={`countdown phase-${p.phase}`}>{text}</div>;
}

const jumpTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// Trip name, dates, the logistics the admin filled in, and what's next for me.
function TripHeader({ trip, me, groups, isAdmin, onGoAdmin }) {
  const info = trip.info ?? {};
  // My own next flight if I marked one, else the crew's next flight.
  const myFlight = nextFlight(flightsOf(info.flights, me.id));
  const flight = myFlight ?? nextFlight(info.flights);
  const onMe = myOpenTasks(groups, me.id).length;
  const rows = [
    { id: 'lodging', label: t.fields.lodging, value: info.lodging },
    { id: 'meetingPoint', label: t.fields.meetingPoint, value: info.meetingPoint },
    { id: 'emergencyContact', label: t.fields.emergencyContact, value: info.emergencyContact },
    { id: 'notes', label: t.fields.notes, value: info.notes },
  ];
  const sub = [info.resort, formatRange(info.dateFrom, info.dateTo)].filter(Boolean).join(' · ');

  return (
    <section className="card trip-header">
      <div className="trip-head">
        <div>
          <h1 className="trip-name">{trip.name}</h1>
          {sub && <p className="trip-sub">{sub}</p>}
        </div>
        <Countdown info={info} />
      </div>
      {(flight || onMe > 0) && (
        <div className="next-up">
          {flight && (
            <button className="next-chip" onClick={() => jumpTo('flights')}>
              {myFlight ? T.myFlight : T.nextFlight}: <b dir="ltr">{flight.number}</b> · {statusText(flight)}
            </button>
          )}
          {onMe > 0 && (
            <button className="next-chip" onClick={() => jumpTo('list')}>{T.onMe(onMe)}</button>
          )}
        </div>
      )}
      {rows.some((r) => r.value) ? (
        <InfoList rows={rows} />
      ) : (
        isAdmin && (
          <p className="muted small">
            {t.home.noTripInfo} <button className="btn btn-link" onClick={onGoAdmin}>{t.home.fillTripInfo}</button>
          </p>
        )
      )}
      <nav className="jump-row" aria-label={T.list.title}>
        {JUMPS.map((id) => (
          <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); jumpTo(id); }}>{T.jump[id]}</a>
        ))}
      </nav>
    </section>
  );
}

// First page: everything the crew shares. Weather and flights sit beside the list on wide screens.
export default function HomeView({ tripCode, trip, me, members, groups, messages, weather, isAdmin, onGoAdmin, onToast }) {
  return (
    <div className="trip-home">
      <TripHeader trip={trip} me={me} groups={groups} isAdmin={isAdmin} onGoAdmin={onGoAdmin} />
      <div className="col col-main">
        <SharedList id="list" tripCode={tripCode} groups={groups} me={me} members={members} />
        <PeopleCard id="people" tripCode={tripCode} trip={trip} members={members} me={me} isAdmin={isAdmin} onToast={onToast} />
      </div>
      <div className="col col-side">
        <WeatherCard id="weather" weather={weather} />
        <FlightsCard id="flights" tripCode={tripCode} trip={trip} me={me} members={members} />
        <NotesCard id="notes" tripCode={tripCode} messages={messages} me={me} members={members} isAdmin={isAdmin} onToast={onToast} />
      </div>
    </div>
  );
}
