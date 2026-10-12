import { useState } from 'react';
import { t } from '../i18n/he.js';
import { SELF_FIELDS } from '../data/infoFields.js';
import { gearFor, SECTIONS } from '../data/gearCatalog.js';
import { addTodo, checklistProgress, gearToBuy, removeTodo, suggestionsFor, todoList, toggleTodo, tripChecklist } from '../lib/todo.js';
import { findGroup, myGroupTasks } from '../lib/groups.js';
import { formatRange, sortMessages, tripPhase } from '../lib/tripInfo.js';
import { itemOf, store } from '../lib/store/index.js';
import Checklist from './Checklist.jsx';
import FieldsForm, { groupField } from './FieldsForm.jsx';

const Phone = ({ value }) => (value ? <a className="phone" href={`tel:${value.replace(/[^\d+]/g, '')}`} dir="ltr">{value}</a> : null);
const COVERED = new Set(['own', 'borrowed', 'skip']);
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

function Progress({ done, total, ratio }) {
  return (
    <div className="home-progress">
      <span className="progress">
        <span style={{ width: `${ratio * 100}%`, background: 'var(--brand)' }} />
      </span>
      <span className="muted small">{t.list.ready(done, total)}</span>
    </div>
  );
}

function Header({ tripCode, trip, progress }) {
  const info = trip.info ?? {};
  return (
    <section className="card trip-card compact">
      <div className="trip-head">
        <div>
          <p className="eyebrow">{tripCode}</p>
          <h1 className="trip-name">{trip.name}</h1>
          {info.resort && <p className="trip-resort">🏔️ {info.resort}</p>}
        </div>
        <Countdown info={info} />
      </div>
      <Progress {...progress} />
    </section>
  );
}

// "To buy": my own entries plus catalog gear marked buy. Ticking a catalog item marks it as owned.
function BuySection({ tripCode, me }) {
  const mine = todoList(me, 'buy');
  const fromGear = gearToBuy(me);
  const save = (list) => store.setTodo(tripCode, me.id, 'buy', list);
  const rows = [
    ...fromGear.map((g) => ({ id: `gear:${g.id}`, text: `${g.emoji} ${g.label}`, done: false, tag: t.list.buyFromGear, fixed: true })),
    ...mine,
  ];
  return (
    <section className="card list-card" data-list="buy">
      <h2>{t.list.buyTitle}</h2>
      <Checklist
        items={rows}
        placeholder={t.list.buyPlaceholder}
        empty={t.list.buyEmpty}
        onAdd={(text) => save(addTodo(mine, text))}
        onToggle={(id) => {
          if (id.startsWith('gear:')) {
            const gid = id.slice(5);
            store.setItem(tripCode, me.id, gid, { ...itemOf(me, gid), status: 'own' });
          } else save(toggleTodo(mine, id));
        }}
        onRemove={(id) => save(removeTodo(mine, id))}
      />
    </section>
  );
}

function RememberSection({ tripCode, me, trip }) {
  const mine = todoList(me, 'remember');
  const shared = tripChecklist(trip).map((x) => ({
    id: `trip:${x.id}`,
    text: x.text,
    done: Boolean(me.todo?.shared?.[x.id]),
    tag: t.list.tripTitle,
    fixed: true,
  }));
  const save = (list) => store.setTodo(tripCode, me.id, 'remember', list);
  return (
    <section className="card list-card" data-list="remember">
      <h2>{t.list.rememberTitle}</h2>
      <Checklist
        items={[...shared, ...mine]}
        placeholder={t.list.rememberPlaceholder}
        empty={t.list.rememberEmpty}
        suggestions={suggestionsFor(mine, t.starterRemember)}
        onAdd={(text) => save(addTodo(mine, text))}
        onToggle={(id) => {
          if (id.startsWith('trip:')) {
            const key = id.slice(5);
            store.setTodo(tripCode, me.id, 'shared', { ...me.todo?.shared, [key]: !me.todo?.shared?.[key] });
          } else save(toggleTodo(mine, id));
        }}
        onRemove={(id) => save(removeTodo(mine, id))}
      />
    </section>
  );
}

// The catalog as a flat packing list: tick = I have it, 🛒 = I need to buy it.
function PackSection({ tripCode, me, onGoGear }) {
  const gear = gearFor(me.rider);
  const set = (g, status) => store.setItem(tripCode, me.id, g.id, { ...itemOf(me, g.id), status });
  return (
    <section className="card list-card" data-list="pack">
      <div className="card-head">
        <h2>{t.list.packTitle}</h2>
        <button className="btn btn-small" onClick={onGoGear}>{t.list.all3d}</button>
      </div>
      <p className="muted small">{t.list.packHint}</p>
      {SECTIONS.map((sec) => {
        const items = gear.filter((g) => g.section === sec.id);
        if (!items.length) return null;
        return (
          <details key={sec.id} className="pack-section" open={items.some((g) => !itemOf(me, g.id).status)}>
            <summary>
              <span>{sec.emoji} {sec.label}</span>
              <span className="muted small">
                {items.filter((g) => COVERED.has(itemOf(me, g.id).status)).length}/{items.length}
              </span>
            </summary>
            <ul className="check-list">
              {items.map((g) => {
                const status = itemOf(me, g.id).status;
                const have = COVERED.has(status);
                return (
                  <li key={g.id} className={`check-row${have ? ' done' : ''}`}>
                    <label>
                      <input type="checkbox" checked={have} onChange={() => set(g, have ? null : 'own')} />
                      <span>{g.emoji} {g.label}</span>
                    </label>
                    <button
                      type="button"
                      className={`icon-btn${status === 'buy' ? ' on' : ''}`}
                      aria-pressed={status === 'buy'}
                      aria-label={t.list.buyIt}
                      title={t.list.buyIt}
                      onClick={() => set(g, status === 'buy' ? null : 'buy')}
                    >
                      🛒
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </section>
  );
}

// First page: a personal checklist (what to buy, what not to forget, what to pack), then the trip details.
export default function HomeView({ tripCode, trip, me, groups, messages, isAdmin, onGoGear, onGoAdmin, onToast }) {
  const progress = checklistProgress(me, trip);
  return (
    <div className="home">
      <Header tripCode={tripCode} trip={trip} progress={progress} />
      <Messages messages={messages} />
      <BuySection tripCode={tripCode} me={me} />
      <RememberSection tripCode={tripCode} me={me} trip={trip} />
      <PackSection tripCode={tripCode} me={me} onGoGear={onGoGear} />
      <details className="card trip-details">
        <summary><h2>{t.list.tripInfo}</h2></summary>
        <TripCard tripCode={tripCode} trip={trip} isAdmin={isAdmin} onGoAdmin={onGoAdmin} />
        <MyInfo tripCode={tripCode} me={me} groups={groups} onToast={onToast} />
      </details>
    </div>
  );
}
