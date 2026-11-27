import { useState } from 'react';
import { t } from '../i18n/he.js';
import { filterItems, groupItems, groupProgress, listProgress, makeItem, MAX_LABEL, MAX_NOTE, newId, updatedItem } from '../lib/groups.js';
import { store } from '../lib/store/index.js';

const L = t.trip.list;
const FILTERS = ['all', 'open', 'mine'];

function ItemEditor({ item, members, onSave, onRemove, onCancel }) {
  const [label, setLabel] = useState(item.label);
  const [note, setNote] = useState(item.note);
  const [by, setBy] = useState(item.by ?? '');
  return (
    <form
      className="item-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (!label.trim()) return;
        onSave({ label: label.trim(), note: note.trim(), by: by || null });
      }}
    >
      <label className="field">
        <span>{L.label}</span>
        <input autoFocus value={label} maxLength={MAX_LABEL} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label className="field">
        <span>{L.note}</span>
        <input value={note} maxLength={MAX_NOTE} placeholder={L.notePlaceholder} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className="field">
        <span>{L.who}</span>
        <select value={by} onChange={(e) => setBy(e.target.value)}>
          <option value="">{L.nobody}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </label>
      <div className="form-actions">
        <button type="button" className="btn btn-danger" onClick={onRemove}>{L.remove}</button>
        <button type="button" className="btn" onClick={onCancel}>{t.cancel}</button>
        <button className="btn btn-primary" disabled={!label.trim()}>{t.save}</button>
      </div>
    </form>
  );
}

function ItemRow({ item, me, members, onChange, onRemove }) {
  const [editing, setEditing] = useState(false);
  const mine = item.by === me.id;
  const owner = members.find((m) => m.id === item.by);

  if (editing) {
    return (
      <li className="item-row editing">
        <ItemEditor
          item={item}
          members={members}
          onCancel={() => setEditing(false)}
          onRemove={onRemove}
          onSave={(patch) => {
            onChange(patch);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className={`item-row${item.done ? ' done' : ''}`}>
      <label className="item-check">
        <input type="checkbox" checked={item.done} onChange={() => onChange({ done: !item.done })} aria-label={item.label} />
      </label>
      <button type="button" className="item-main" onClick={() => setEditing(true)} title={L.edit}>
        <span className="item-label">{item.label}</span>
        {item.note && <span className="item-note">{item.note}</span>}
      </button>
      {item.by ? (
        <button
          type="button"
          className={`who-chip${mine ? ' mine' : ''}`}
          style={owner && !mine ? { '--who': owner.color } : undefined}
          onClick={() => (mine ? onChange({ by: null }) : setEditing(true))}
        >
          {mine ? L.onMe : owner?.name ?? t.someone}
        </button>
      ) : (
        !item.done && (
          <button type="button" className="who-chip empty" onClick={() => onChange({ by: me.id })}>{L.take}</button>
        )
      )}
    </li>
  );
}

function AddItem({ onAdd }) {
  const [text, setText] = useState('');
  return (
    <form
      className="item-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onAdd(text);
        setText('');
      }}
    >
      <input value={text} maxLength={MAX_LABEL} placeholder={L.addPlaceholder} onChange={(e) => setText(e.target.value)} />
      <button className="btn btn-small" disabled={!text.trim()}>{t.add}</button>
    </form>
  );
}

function GroupHeader({ group, progress, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  if (editing) {
    return (
      <form
        className="group-edit"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onRename(name.trim());
          setEditing(false);
        }}
      >
        <input autoFocus value={name} maxLength={40} aria-label={L.groupName} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-small btn-primary" disabled={!name.trim()}>{t.save}</button>
        <button type="button" className="btn btn-small" onClick={() => setEditing(false)}>{t.cancel}</button>
        <button type="button" className="btn btn-small btn-danger" onClick={onDelete}>{L.deleteGroup}</button>
      </form>
    );
  }
  return (
    <div className="group-head">
      <h3>
        {group.emoji && <span aria-hidden>{group.emoji} </span>}
        {group.name}
      </h3>
      <span className="muted small" dir="ltr">{progress.done}/{progress.total}</span>
      <button className="btn btn-small btn-quiet" onClick={() => setEditing(true)} aria-label={L.editGroup}>{L.edit}</button>
    </div>
  );
}

function Group({ tripCode, group, filter, me, members }) {
  const all = groupItems(group);
  const items = filterItems(all, filter, me.id);
  // Open items first, done ones sink to the bottom.
  const sorted = [...items.filter((i) => !i.done), ...items.filter((i) => i.done)];
  const write = (id, item) => store.setGroupItem(tripCode, group.id, id, item);

  if (filter !== 'all' && !items.length) return null;

  return (
    <section className="list-group">
      <GroupHeader
        group={group}
        progress={groupProgress(group)}
        onRename={(name) => store.updateGroup(tripCode, group.id, { name })}
        onDelete={() => window.confirm(L.confirmDeleteGroup(group.name)) && store.deleteGroup(tripCode, group.id)}
      />
      {!all.length && <p className="muted small">{L.emptyGroup}</p>}
      <ul className="item-list">
        {sorted.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            me={me}
            members={members}
            onChange={(patch) => write(item.id, updatedItem(item, patch))}
            onRemove={() => write(item.id, null)}
          />
        ))}
      </ul>
      {filter !== 'mine' && <AddItem onAdd={(text) => write(newId(), makeItem(text))} />}
    </section>
  );
}

function NewGroup({ onCreate }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  if (!open) {
    return <button className="btn new-group-btn" onClick={() => setOpen(true)}>{L.newGroup}</button>;
  }
  return (
    <form
      className="group-edit"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onCreate(name.trim());
        setName('');
        setOpen(false);
      }}
    >
      <input autoFocus value={name} maxLength={40} placeholder={L.groupPlaceholder} aria-label={L.groupName} onChange={(e) => setName(e.target.value)} />
      <button className="btn btn-small btn-primary" disabled={!name.trim()}>{L.createGroup}</button>
      <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>{t.cancel}</button>
    </form>
  );
}

// The crew's shared list: groups of items anyone can add to, tick off, take on, or annotate.
export default function SharedList({ tripCode, groups, me, members, id }) {
  const [filter, setFilter] = useState('all');
  const progress = listProgress(groups);
  const addGroup = (name) => store.addGroup(tripCode, { name, emoji: '' });
  const shown = groups.filter((g) => filter === 'all' || filterItems(groupItems(g), filter, me.id).length);

  return (
    <section className="card shared-list" id={id}>
      <div className="card-head">
        <h2>{L.title}</h2>
        {progress.total > 0 && <span className="muted small">{L.progress(progress.done, progress.total)}</span>}
      </div>
      {progress.total > 0 && (
        <span className="progress list-progress" aria-hidden>
          <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </span>
      )}
      {groups.length > 0 && (
        <div className="filter-row" role="group">
          {FILTERS.map((f) => (
            <button key={f} className={`filter${filter === f ? ' on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {L.filters[f]}
            </button>
          ))}
        </div>
      )}
      {!groups.length && (
        <div className="list-empty">
          <p className="muted">{L.empty}</p>
          <div className="chips">
            {L.starters.map((s) => (
              <button key={s} className="chip" onClick={() => addGroup(s)}>+ {s}</button>
            ))}
          </div>
        </div>
      )}
      {groups.length > 0 && !shown.length && <p className="muted small">{L.nothingHere}</p>}
      {shown.map((g) => (
        <Group key={g.id} tripCode={tripCode} group={g} filter={filter} me={me} members={members} />
      ))}
      {filter === 'all' && <NewGroup onCreate={addGroup} />}
    </section>
  );
}
