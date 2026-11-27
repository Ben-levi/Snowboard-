import { useState } from 'react';
import { t } from '../i18n/he.js';
import { flightStatus, MAX_FLIGHTS, normalizeFlightNumber, sortFlights, toggleWho, trackUrl } from '../lib/flights.js';
import { newId } from '../lib/groups.js';
import { store } from '../lib/store/index.js';
import Avatar from './Avatar.jsx';

const f = t.trip.flights;
const dayFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

export function statusText(flight, now) {
  const s = flightStatus(flight, now);
  return s.phase === 'later' ? f.status.later(s.days) : f.status[s.phase];
}

function FlightForm({ initial, onSave, onCancel, onDelete }) {
  const [draft, setDraft] = useState({ number: '', date: '', time: '', arrive: '', from: '', to: '', ...initial });
  const [onIt, setOnIt] = useState(true);
  const [tried, setTried] = useState(false);
  const number = normalizeFlightNumber(draft.number);
  const ok = Boolean(number && draft.date);
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const code = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value.toUpperCase().slice(0, 4) }));

  return (
    <form
      className="flight-form"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (ok) onSave({ ...draft, number, from: draft.from.trim(), to: draft.to.trim() }, onIt);
      }}
    >
      <div className="fields-grid">
        <label className="field half">
          <span>{f.number}</span>
          <input dir="ltr" autoFocus={!initial} value={draft.number} placeholder={f.numberPlaceholder} maxLength={10} onChange={set('number')} />
        </label>
        <label className="field half">
          <span>{f.date}</span>
          <input type="date" value={draft.date} onChange={set('date')} />
        </label>
        <label className="field pair">
          <span>{f.from}</span>
          <input dir="ltr" value={draft.from} placeholder={f.fromPlaceholder} onChange={code('from')} />
        </label>
        <label className="field pair">
          <span>{f.to}</span>
          <input dir="ltr" value={draft.to} placeholder={f.toPlaceholder} onChange={code('to')} />
        </label>
        <label className="field pair">
          <span>{f.time}</span>
          <input type="time" dir="ltr" value={draft.time} onChange={set('time')} />
        </label>
        <label className="field pair">
          <span>{f.arrive}</span>
          <input type="time" dir="ltr" value={draft.arrive} onChange={set('arrive')} />
        </label>
      </div>
      {tried && !number && <p className="error">{f.badNumber}</p>}
      <div className="form-actions">
        {!initial && (
          <label className="toggle">
            <input type="checkbox" checked={onIt} onChange={(e) => setOnIt(e.target.checked)} /> <span>{f.imOnIt}</span>
          </label>
        )}
        {onDelete && <button type="button" className="btn btn-danger" onClick={onDelete}>{t.delete}</button>}
        <button type="button" className="btn" onClick={onCancel}>{t.cancel}</button>
        <button className="btn btn-primary" disabled={tried && !ok}>{t.save}</button>
      </div>
    </form>
  );
}

function Flight({ flight, me, members, onChange, onDelete }) {
  const [editing, setEditing] = useState(false);
  const status = flightStatus(flight);
  const people = members.filter((m) => flight.who?.includes(m.id));
  const onIt = flight.who?.includes(me.id);
  const date = flight.date ? dayFmt.format(new Date(`${flight.date}T12:00:00`)) : '';
  const times = [flight.time, flight.arrive].filter(Boolean).join(' → ');

  if (editing) {
    return (
      <li className="flight">
        <FlightForm
          initial={flight}
          onCancel={() => setEditing(false)}
          onSave={(next) => {
            onChange({ ...flight, ...next });
            setEditing(false);
          }}
          onDelete={() => window.confirm(f.confirmDelete(flight.number)) && onDelete()}
        />
      </li>
    );
  }

  return (
    <li className={`flight phase-${status.phase}`}>
      <div className="flight-top">
        <b className="flight-no" dir="ltr">{flight.number}</b>
        {(flight.from || flight.to) && (
          <span className="flight-route" dir="ltr">{flight.from || '?'} → {flight.to || '?'}</span>
        )}
        <span className="flight-status">{statusText(flight)}</span>
      </div>
      <div className="muted small">
        {date}
        {times && <> · <span dir="ltr">{times}</span></>}
      </div>
      <div className="flight-people">
        {people.length ? (
          people.map((m) => (
            <span key={m.id} className="person-chip">
              <Avatar member={m} size={20} /> {m.name}
            </span>
          ))
        ) : (
          <span className="muted small">{f.nobody}</span>
        )}
      </div>
      <div className="flight-actions">
        <button className={`btn btn-small${onIt ? '' : ' btn-primary'}`} onClick={() => onChange(toggleWho(flight, me.id))}>
          {onIt ? f.leave : f.join}
        </button>
        <a className="btn btn-small" href={trackUrl(flight.number)} target="_blank" rel="noreferrer">{f.track}</a>
        <button className="btn btn-small btn-quiet" onClick={() => setEditing(true)}>{t.edit}</button>
      </div>
    </li>
  );
}

// Flight numbers for the trip, who is on each, and a link to live tracking.
export default function FlightsCard({ tripCode, trip, me, members, id }) {
  const [adding, setAdding] = useState(false);
  const info = trip.info ?? {};
  const flights = sortFlights(info.flights);
  const save = (next) => store.updateTripInfo(tripCode, { flights: next });
  const replace = (fl) => save(flights.map((x) => (x.id === fl.id ? fl : x)));
  // Trips from before structured flights kept them as free text.
  const legacy = [info.flightOut, info.flightBack].filter(Boolean);

  return (
    <section className="card flights-card" id={id}>
      <div className="card-head">
        <h2>{f.title}</h2>
        {!adding && flights.length < MAX_FLIGHTS && (
          <button className="btn btn-small" onClick={() => setAdding(true)}>{f.add}</button>
        )}
      </div>
      {adding && (
        <FlightForm
          onCancel={() => setAdding(false)}
          onSave={(draft, onIt) => {
            save([...flights, { id: newId(), ...draft, who: onIt ? [me.id] : [] }]);
            setAdding(false);
          }}
        />
      )}
      {!flights.length && !adding && !legacy.length && <p className="muted small">{f.empty}</p>}
      <ul className="flight-list">
        {flights.map((fl) => (
          <Flight
            key={fl.id}
            flight={fl}
            me={me}
            members={members}
            onChange={replace}
            onDelete={() => save(flights.filter((x) => x.id !== fl.id))}
          />
        ))}
      </ul>
      {!flights.length && legacy.length > 0 && (
        <div className="legacy-flights">
          <span className="muted small">{f.legacy}</span>
          {legacy.map((x) => <p key={x}>{x}</p>)}
        </div>
      )}
    </section>
  );
}
