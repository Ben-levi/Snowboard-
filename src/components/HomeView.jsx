import { useState } from 'react';
import { motion } from 'motion/react';
import { t } from '../i18n/he.js';
import { SELF_FIELDS } from '../data/infoFields.js';
import { gearFor } from '../data/gearCatalog.js';
import { countByStatus } from '../lib/stats.js';
import { findGroup, myGroupTasks } from '../lib/groups.js';
import { formatRange, sortMessages, tripPhase } from '../lib/tripInfo.js';
import { store } from '../lib/store/index.js';
import FieldsForm, { groupField } from './FieldsForm.jsx';

const Phone = ({ value }) => (value ? <a className="phone" href={`tel:${value.replace(/[^\d+]/g, '')}`} dir="ltr">{value}</a> : null);
const joined = (...parts) => parts.filter(Boolean).join(' · ');

// Label/value rows. Rows without a value are hidden unless showEmpty.
export function InfoList({ rows, showEmpty }) {
  const visible = showEmpty ? rows : rows.filter((r) => r.value);
  return (
    <dl className="info-list">
      {visible.map((r) => (
        <div key={r.id} className="info-row" data-row={r.id}>
          <dt>
            <span aria-hidden>{r.icon}</span> {r.label}
          </dt>
          <dd>
            {r.value || <span className="muted">{t.notSet}</span>}
            {r.hint && <small className="row-hint">{r.hint}</small>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Countdown({ info }) {
  const p = tripPhase(info.dateFrom, info.dateTo);
  if (p.phase === 'unknown') return null;
  let text;
  if (p.phase === 'before') text = t.home.countdown(p.days);
  else if (p.phase === 'during') text = p.day === 1 ? t.home.today : t.home.during(p.day);
  else text = t.home.over;
  return <div className={`countdown phase-${p.phase}`}>{text}</div>;
}

function TripCard({ tripCode, trip, isAdmin, onGoAdmin }) {
  const info = trip.info ?? {};
  const rows = [
    { id: 'dates', icon: '📅', label: t.fields.dates, value: formatRange(info.dateFrom, info.dateTo) },
    { id: 'flightOut', icon: '🛫', label: t.fields.flightOut, value: info.flightOut },
    { id: 'flightBack', icon: '🛬', label: t.fields.flightBack, value: info.flightBack },
    { id: 'lodging', icon: '🏨', label: t.fields.lodging, value: info.lodging },
    { id: 'meetingPoint', icon: '📍', label: t.fields.meetingPoint, value: info.meetingPoint },
    { id: 'emergencyContact', icon: '🆘', label: t.fields.emergencyContact, value: info.emergencyContact },
    { id: 'notes', icon: '📝', label: t.fields.notes, value: info.notes },
  ];
  const empty = !info.resort && rows.every((r) => !r.value);
  return (
    <section className="card trip-card">
      <div className="trip-head">
        <div>
          <p className="eyebrow">{tripCode}</p>
          <h1 className="trip-name">{trip.name}</h1>
          {info.resort && <p className="trip-resort">🏔️ {info.resort}</p>}
        </div>
        <Countdown info={info} />
      </div>
      {empty ? (
        <p className="muted">
          {t.home.noTripInfo}{' '}
          {isAdmin && (
            <button className="btn btn-link" onClick={onGoAdmin}>{t.home.fillTripInfo}</button>
          )}
        </p>
      ) : (
        <InfoList rows={rows} />
      )}
    </section>
  );
}

function Messages({ messages }) {
  if (!messages.length) return null;
  return (
    <section className="card messages-card">
      <h2>{t.home.messages}</h2>
      <ul className="message-list">
        {sortMessages(messages).map((m) => (
          <li key={m.id} className={m.pinned ? 'pinned' : ''}>
            {m.pinned && <span className="pin-tag">📌 {t.home.pinned}</span>}
            <p>{m.text}</p>
            <time className="muted small">{new Date(m.createdAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}</time>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MyInfo({ tripCode, me, groups, onToast }) {
  const [editing, setEditing] = useState(false);
  const info = me.info ?? {};
  const group = findGroup(groups, me.groupId);
  const tasks = myGroupTasks(groups, me.id);

  const rows = [
    { id: 'skiPass', icon: '🎫', label: t.fields.skiPass, value: joined(formatRange(info.skiPassFrom, info.skiPassTo), info.skiPassType) },
    {
      id: 'insurance',
      icon: '🛡️',
      label: t.fields.insurance,
      value: (info.insuranceCompany || info.insurancePolicy || info.insurancePhone) && (
        <>
          {joined(info.insuranceCompany, info.insurancePolicy)} <Phone value={info.insurancePhone} />
        </>
      ),
    },
    { id: 'rental', icon: '🎿', label: t.fields.rental, value: info.rental },
    {
      id: 'instructor',
      icon: '👨‍🏫',
      label: t.fields.instructor,
      value: info.instructor && (
        <>
          {info.instructor} <Phone value={info.instructorPhone} />
        </>
      ),
      hint: t.home.setByAdmin,
    },
    { id: 'lessons', icon: '📚', label: t.fields.lessons, value: info.lessons, hint: t.home.setByAdmin },
    { id: 'group', icon: '👥', label: t.home.myGroup, value: group && `${group.emoji} ${group.name}` },
    ...(tasks.length
      ? [{ id: 'tasks', icon: '🧺', label: t.home.myTasks, value: tasks.map((x) => `${x.label} (${x.groupName})`).join(' · ') }]
      : []),
    { id: 'notes', icon: '📝', label: t.fields.notes, value: info.notes },
  ];

  async function save({ groupId, ...fields }) {
    try {
      await store.setMemberInfo(tripCode, me.id, fields);
      if ((groupId || null) !== (me.groupId ?? null)) await store.updateMember(tripCode, me.id, { groupId: groupId || null });
      setEditing(false);
      onToast(t.toast.saved);
    } catch (e) {
      onToast(t.toast.failed(e.message));
    }
  }

  return (
    <section className="card my-info">
      <div className="card-head">
        <h2>{t.home.myInfo}</h2>
        {!editing && (
          <button className="btn btn-small" onClick={() => setEditing(true)}>✏️ {t.edit}</button>
        )}
      </div>
      {editing ? (
        <FieldsForm
          fields={[...SELF_FIELDS, groupField(groups)]}
          values={{ ...info, groupId: me.groupId ?? '' }}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <InfoList rows={rows} showEmpty />
      )}
    </section>
  );
}

// First page: trip details, admin messages and my details, then on to my gear.
export default function HomeView({ tripCode, trip, me, groups, messages, isAdmin, onGoGear, onGoAdmin, onToast }) {
  const counts = countByStatus(me);
  const total = gearFor(me.rider).length;
  const done = counts.own + counts.borrowed + counts.skip;
  return (
    <div className="home">
      <TripCard tripCode={tripCode} trip={trip} isAdmin={isAdmin} onGoAdmin={onGoAdmin} />
      <Messages messages={messages} />
      <MyInfo tripCode={tripCode} me={me} groups={groups} onToast={onToast} />
      <motion.button className="card gear-cta" onClick={onGoGear} whileTap={{ scale: 0.98 }}>
        <span className="cta-title">{t.home.toGear}</span>
        <span className="cta-progress">
          <span className="progress">
            <span style={{ width: `${total ? (done / total) * 100 : 0}%`, background: 'var(--brand)' }} />
          </span>
          <span className="muted small">{t.home.gearProgress(done, total)}</span>
        </span>
      </motion.button>
    </div>
  );
}
