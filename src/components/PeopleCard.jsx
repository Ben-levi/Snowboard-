import { useState } from 'react';
import { t } from '../i18n/he.js';
import { MEMBER_FIELDS, SELF_FIELDS } from '../data/infoFields.js';
import { flightsOf } from '../lib/flights.js';
import { formatRange } from '../lib/tripInfo.js';
import { store } from '../lib/store/index.js';
import Avatar from './Avatar.jsx';
import FieldsForm from './FieldsForm.jsx';

const P = t.trip.people;
const F = t.fields;

export const Phone = ({ value }) =>
  value ? <a className="phone" href={`tel:${value.replace(/[^\d+]/g, '')}`} dir="ltr">{value}</a> : null;

const joined = (...parts) => parts.filter(Boolean).join(' · ');

// Label/value rows; empty rows are left out.
export function InfoList({ rows }) {
  const visible = rows.filter((r) => r.value);
  return (
    <dl className="info-list">
      {visible.map((r) => (
        <div key={r.id} className="info-row">
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function personRows(member, flights) {
  const info = member.info ?? {};
  const sizes = joined(
    info.shoeSize && `${F.shoeSize} ${info.shoeSize}`,
    info.height && `${info.height} ס״מ`,
    info.weight && `${info.weight} ק״ג`,
  );
  return [
    { id: 'phone', label: F.phone, value: info.phone && <Phone value={info.phone} /> },
    { id: 'flights', label: P.flights, value: flights.length > 0 && <span dir="ltr">{flights.map((f) => f.number).join(' · ')}</span> },
    { id: 'room', label: F.room, value: info.room },
    { id: 'skiPass', label: F.skiPass, value: joined(formatRange(info.skiPassFrom, info.skiPassTo), info.skiPassType) },
    { id: 'rental', label: F.rental, value: info.rental },
    { id: 'sizes', label: P.sizes, value: sizes },
    {
      id: 'insurance',
      label: F.insurance,
      value: (info.insuranceCompany || info.insurancePolicy || info.insurancePhone) && (
        <>
          {joined(info.insuranceCompany, info.insurancePolicy)} <Phone value={info.insurancePhone} />
        </>
      ),
    },
    {
      id: 'instructor',
      label: F.instructor,
      value: (info.instructor || info.lessons) && (
        <>
          {joined(info.instructor, info.lessons)} <Phone value={info.instructorPhone} />
        </>
      ),
    },
    { id: 'homeContact', label: F.homeContact, value: info.homeContact },
    { id: 'notes', label: F.notes, value: info.notes },
  ];
}

function Person({ tripCode, member, flights, isMe, canEdit, isAdmin, onToast }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const info = member.info ?? {};
  const rows = personRows(member, flights);
  const filled = rows.some((r) => r.value);

  async function save(fields) {
    try {
      await store.setMemberInfo(tripCode, member.id, fields);
      setEditing(false);
      onToast(t.toast.saved);
    } catch (e) {
      onToast(t.toast.failed(e.message));
    }
  }

  return (
    <li className={`person${open ? ' open' : ''}`}>
      <div className="person-line">
        <Avatar member={member} size={34} />
        <div className="person-text">
          <b>
            {member.name}
            {isMe && <span className="you">{t.you}</span>}
          </b>
          <span className="person-sub small">
            {info.phone && <Phone value={info.phone} />}
            {flights.length > 0 && <span className="muted" dir="ltr">✈ {flights.map((f) => f.number).join(', ')}</span>}
          </span>
        </div>
        <button className="btn btn-small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? P.hide : P.details}
        </button>
      </div>
      {open && (
        <div className="person-body">
          {editing ? (
            <FieldsForm fields={isAdmin ? MEMBER_FIELDS : SELF_FIELDS} values={info} onSave={save} onCancel={() => setEditing(false)} />
          ) : (
            <>
              {filled ? <InfoList rows={rows} /> : <p className="muted small">{P.noInfo}</p>}
              {canEdit && (
                <div className="form-actions">
                  <button className="btn btn-small" onClick={() => setEditing(true)}>{t.edit}</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

// Everyone's personal details: phone, flights, ski pass, rental sizes, insurance. Me first.
export default function PeopleCard({ tripCode, trip, members, me, isAdmin, onToast, id }) {
  const flights = trip.info?.flights ?? [];
  const sorted = [...members].sort((a, b) => Number(b.id === me.id) - Number(a.id === me.id));
  return (
    <section className="card people-card" id={id}>
      <h2>{P.title}</h2>
      <ul className="people-list">
        {sorted.map((m) => (
          <Person
            key={m.id}
            tripCode={tripCode}
            member={m}
            flights={flightsOf(flights, m.id)}
            isMe={m.id === me.id}
            canEdit={m.id === me.id || isAdmin}
            isAdmin={isAdmin}
            onToast={onToast}
          />
        ))}
      </ul>
    </section>
  );
}
