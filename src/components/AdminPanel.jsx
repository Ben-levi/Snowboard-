import { useState } from 'react';
import { t } from '../i18n/he.js';
import { MEMBER_FIELDS, TRIP_FIELDS } from '../data/infoFields.js';
import { hashPassword, MIN_PASSWORD } from '../lib/admin.js';
import { newId } from '../lib/groups.js';
import { sortMessages } from '../lib/tripInfo.js';
import { store } from '../lib/store/index.js';
import Avatar from './Avatar.jsx';
import FieldsForm from './FieldsForm.jsx';

function Section({ title, children, open: initial = false }) {
  return (
    <details className="card admin-section" open={initial}>
      <summary>
        <h2>{title}</h2>
        <span className="chevron" aria-hidden>▾</span>
      </summary>
      <div className="admin-body">{children}</div>
    </details>
  );
}

function TripSection({ tripCode, trip, onToast }) {
  const fields = [{ id: 'name', type: 'text', label: t.admin.tripName }, ...TRIP_FIELDS];
  return (
    <Section title={t.admin.trip} open>
      <FieldsForm
        key={trip.updatedAt}
        fields={fields}
        values={{ ...trip.info, name: trip.name }}
        onSave={async ({ name, ...info }) => {
          await store.updateTripInfo(tripCode, info);
          if (name && name !== trip.name) await store.updateTrip(tripCode, { name });
          onToast(t.toast.saved);
        }}
      />
    </Section>
  );
}

// Trip-wide reminders: show up in everyone's "don't forget" list.
function ChecklistSection({ tripCode, trip }) {
  const [text, setText] = useState('');
  const list = trip.checklist ?? [];
  const save = (next) => store.updateTrip(tripCode, { checklist: next });
  return (
    <Section title={t.admin.checklist}>
      <p className="muted small">{t.admin.checklistHint}</p>
      <form
        className="check-add"
        onSubmit={(e) => {
          e.preventDefault();
          const clean = text.trim().slice(0, 60);
          if (!clean || list.length >= 30) return;
          save([...list, { id: newId(), text: clean }]);
          setText('');
        }}
      >
        <input value={text} maxLength={60} placeholder={t.admin.checklistPlaceholder} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary btn-small" disabled={!text.trim()}>{t.list.add}</button>
      </form>
      <ul className="check-list">
        {list.map((x) => (
          <li key={x.id} className="check-row">
            <label><span>{x.text}</span></label>
            <button type="button" className="icon-btn" aria-label={t.list.remove} onClick={() => save(list.filter((y) => y.id !== x.id))}>✕</button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function MessagesSection({ tripCode, messages }) {
  const [text, setText] = useState('');
  const [pinned, setPinned] = useState(false);
  const trimmed = text.trim();
  return (
    <Section title={t.admin.messages} open>
      <form
        className="message-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!trimmed) return;
          await store.addMessage(tripCode, { text: trimmed, pinned });
          setText('');
          setPinned(false);
        }}
      >
        <textarea rows={3} maxLength={500} value={text} placeholder={t.admin.messagePlaceholder} onChange={(e) => setText(e.target.value)} />
        <div className="form-actions">
          <label className="toggle">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            <span>📌 {t.admin.pin}</span>
          </label>
          <button className="btn btn-primary" disabled={!trimmed}>{t.admin.post}</button>
        </div>
      </form>
      {!messages.length && <p className="muted small">{t.admin.noMessages}</p>}
      <ul className="message-list admin">
        {sortMessages(messages).map((m) => (
          <li key={m.id} className={m.pinned ? 'pinned' : ''}>
            <p>{m.text}</p>
            <div className="row-actions">
              <button className="btn btn-small" onClick={() => store.updateMessage(tripCode, m.id, { pinned: !m.pinned })}>
                📌 {m.pinned ? t.admin.unpin : t.admin.pin}
              </button>
              <button className="btn btn-small btn-danger" onClick={() => store.deleteMessage(tripCode, m.id)}>{t.delete}</button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PeopleSection({ tripCode, members, me, onToast }) {
  const [editId, setEditId] = useState(null);
  return (
    <Section title={t.admin.people} open>
      <ul className="admin-people">
        {members.map((m) => (
          <li key={m.id} data-member={m.name}>
            <div className="person-row">
              <Avatar member={m} size={30} />
              <div className="person-main">
                <b>{m.name}</b>
                <span className="muted small">
                  {[m.info?.phone, m.info?.instructor].filter(Boolean).join(' · ')}
                </span>
              </div>
              <button className="btn btn-small" onClick={() => setEditId(editId === m.id ? null : m.id)}>✏️ {t.edit}</button>
            </div>
            {editId === m.id && (
              <div className="person-edit">
                <FieldsForm
                  fields={MEMBER_FIELDS}
                  values={m.info}
                  onCancel={() => setEditId(null)}
                  onSave={async (info) => {
                    await store.setMemberInfo(tripCode, m.id, info);
                    setEditId(null);
                    onToast(t.toast.saved);
                  }}
                />
                {m.id !== me.id && (
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() => window.confirm(t.admin.confirmRemove(m.name)) && store.deleteMember(tripCode, m.id)}
                  >
                    {t.admin.removeMember}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PasswordSection({ tripCode, onChanged, onToast }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const short = pw.length > 0 && pw.length < MIN_PASSWORD;
  const mismatch = pw2.length > 0 && pw !== pw2;
  return (
    <Section title={t.admin.password}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw.length < MIN_PASSWORD || pw !== pw2) return;
          const adminHash = await hashPassword(tripCode, pw);
          onChanged(adminHash);
          await store.updateTrip(tripCode, { adminHash });
          setPw('');
          setPw2('');
          onToast(t.admin.passwordChanged);
        }}
      >
        <div className="fields-grid">
          <label className="field half">
            <span>{t.admin.newPassword}</span>
            <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
          <label className="field half">
            <span>{t.create.password2}</span>
            <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </label>
        </div>
        {short && <p className="error">{t.create.passwordShort}</p>}
        {mismatch && <p className="error">{t.create.mismatch}</p>}
        <div className="form-actions">
          <button className="btn btn-primary" disabled={pw.length < MIN_PASSWORD || pw !== pw2}>{t.admin.changePassword}</button>
        </div>
      </form>
    </Section>
  );
}

export default function AdminPanel({ tripCode, trip, members, messages, me, setAdmin, onLogout, onToast }) {
  return (
    <div className="admin">
      <div className="admin-top">
        <h1>{t.admin.title}</h1>
        <button className="btn btn-small" onClick={onLogout}>{t.admin.logout}</button>
      </div>
      <TripSection tripCode={tripCode} trip={trip} onToast={onToast} />
      <ChecklistSection tripCode={tripCode} trip={trip} />
      <MessagesSection tripCode={tripCode} messages={messages} />
      <PeopleSection tripCode={tripCode} members={members} me={me} onToast={onToast} />
      <PasswordSection tripCode={tripCode} onChanged={setAdmin} onToast={onToast} />
    </div>
  );
}
