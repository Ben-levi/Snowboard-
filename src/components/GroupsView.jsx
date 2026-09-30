import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { t } from '../i18n/he.js';
import { groupItems, groupMembers, groupProgress, newId } from '../lib/groups.js';
import { store } from '../lib/store/index.js';
import Avatar from './Avatar.jsx';

function AddItem({ onAdd }) {
  const [label, setLabel] = useState('');
  const trimmed = label.trim();
  return (
    <form
      className="group-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (!trimmed) return;
        onAdd(trimmed);
        setLabel('');
      }}
    >
      <input value={label} maxLength={60} placeholder={t.groups.addPlaceholder} onChange={(e) => setLabel(e.target.value)} />
      <button className="btn btn-small btn-primary" disabled={!trimmed}>{t.add}</button>
    </form>
  );
}

function GroupItem({ item, canEdit, me, nameOf, onChange, onRemove }) {
  const mine = item.by === me.id;
  return (
    <motion.li
      layout
      className={`group-item status-${item.status}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
    >
      <span className="group-item-label">{item.label}</span>
      <div className="group-item-side">
        {item.by ? (
          <span className={`bringer${mine ? ' mine' : ''}`}>{mine ? `🙋 ${t.you}` : t.groups.bringing(nameOf(item.by))}</span>
        ) : null}
        {canEdit && (
          <>
            <button
              type="button"
              className={`chip chip-${item.status === 'have' ? 'own' : 'buy'} on`}
              onClick={() => onChange({ status: item.status === 'have' ? 'buy' : 'have' })}
            >
              {item.status === 'have' ? t.groups.have : t.groups.buy}
            </button>
            {(!item.by || mine) && (
              <button type="button" className="btn btn-small" onClick={() => onChange({ by: mine ? null : me.id })}>
                {mine ? t.groups.unclaim : t.groups.iBring}
              </button>
            )}
            <button type="button" className="icon-btn" aria-label={t.groups.removeItem(item.label)} onClick={onRemove}>✕</button>
          </>
        )}
        {!canEdit && <span className={`badge badge-${item.status === 'have' ? 'own' : 'buy'}`}>{item.status === 'have' ? t.groups.have : t.groups.buy}</span>}
      </div>
    </motion.li>
  );
}

function GroupCard({ tripCode, group, members, me, isAdmin }) {
  const people = groupMembers(members, group.id);
  const inGroup = me.groupId === group.id;
  const canEdit = inGroup || isAdmin;
  const items = groupItems(group);
  const { done, total } = groupProgress(group);
  const nameOf = (id) => members.find((m) => m.id === id)?.name ?? t.someone;

  const setItem = (id, item) => store.setGroupItem(tripCode, group.id, id, item);

  return (
    <section className={`card group-card${inGroup ? ' mine' : ''}`}>
      <div className="card-head">
        <h2>
          <span aria-hidden>{group.emoji}</span> {group.name}
        </h2>
        <button
          className={`btn btn-small${inGroup ? '' : ' btn-primary'}`}
          onClick={() => store.updateMember(tripCode, me.id, { groupId: inGroup ? null : group.id })}
        >
          {inGroup ? t.groups.leave : t.groups.join}
        </button>
      </div>
      <div className="group-people">
        {people.length ? (
          people.map((m) => (
            <span key={m.id} className="group-person">
              <Avatar member={m} size={24} /> {m.name}
            </span>
          ))
        ) : (
          <span className="muted small">{t.groups.noMembers}</span>
        )}
      </div>
      {total > 0 && (
        <div className="group-progress">
          <span className="progress">
            <span style={{ width: `${(done / total) * 100}%`, background: 'var(--own)' }} />
          </span>
          <span className="muted small">{t.groups.progress(done, total)}</span>
        </div>
      )}
      <ul className="group-items">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <GroupItem
              key={item.id}
              item={item}
              canEdit={canEdit}
              me={me}
              nameOf={nameOf}
              onChange={(patch) => setItem(item.id, { label: item.label, status: item.status, by: item.by ?? null, createdAt: item.createdAt, ...patch })}
              onRemove={() => setItem(item.id, null)}
            />
          ))}
        </AnimatePresence>
      </ul>
      {!items.length && <p className="muted small">{t.groups.listEmpty}</p>}
      {canEdit ? (
        <AddItem onAdd={(label) => setItem(newId(), { label, status: 'buy', by: null, createdAt: Date.now() })} />
      ) : (
        <p className="muted small">{t.groups.membersOnly}</p>
      )}
    </section>
  );
}

export default function GroupsView({ tripCode, groups, members, me, isAdmin }) {
  if (!groups.length) {
    return (
      <div className="card empty-card">
        <div className="hero-emoji" aria-hidden>🏠</div>
        <p>{t.groups.empty}</p>
        <p className="muted small">{isAdmin ? t.groups.emptyAdmin : t.groups.emptyMember}</p>
      </div>
    );
  }
  // My group first.
  const sorted = [...groups].sort((a, b) => Number(b.id === me.groupId) - Number(a.id === me.groupId));
  return (
    <div className="groups-grid">
      {sorted.map((g) => (
        <GroupCard key={g.id} tripCode={tripCode} group={g} members={members} me={me} isAdmin={isAdmin} />
      ))}
    </div>
  );
}
