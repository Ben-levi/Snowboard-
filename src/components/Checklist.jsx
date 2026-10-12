import { useState } from 'react';
import { t } from '../i18n/he.js';
import { MAX_TODO_TEXT } from '../lib/todo.js';

// A tick-off list with an add box. Rows: { id, text, done, tag? }.
// Parent owns the data: it gets the new text / toggled id / removed id and writes to the store.
export default function Checklist({ items, onAdd, onToggle, onRemove, placeholder, empty, suggestions = [] }) {
  const [text, setText] = useState('');
  const open = items.filter((x) => !x.done);
  const done = items.filter((x) => x.done);

  const row = (x) => (
    <li key={x.id} className={`check-row${x.done ? ' done' : ''}`}>
      <label>
        <input type="checkbox" checked={x.done} onChange={() => onToggle(x.id)} />
        <span>{x.text}</span>
        {x.tag && <small className="muted">{x.tag}</small>}
      </label>
      {onRemove && !x.fixed && (
        <button type="button" className="icon-btn" aria-label={t.list.remove} onClick={() => onRemove(x.id)}>✕</button>
      )}
    </li>
  );

  return (
    <div className="checklist">
      {onAdd && (
        <form
          className="check-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            onAdd(text);
            setText('');
          }}
        >
          <input value={text} maxLength={MAX_TODO_TEXT} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-primary btn-small" disabled={!text.trim()}>{t.list.add}</button>
        </form>
      )}
      {suggestions.length > 0 && (
        <div className="check-suggest">
          <span className="muted small">{t.list.suggestions}</span>
          <div className="chips">
            {suggestions.slice(0, 8).map((s) => (
              <button key={s} type="button" className="chip" onClick={() => onAdd(s)}>+ {s}</button>
            ))}
          </div>
        </div>
      )}
      {!items.length && empty && <p className="muted small">{empty}</p>}
      <ul className="check-list">
        {open.map(row)}
        {done.map(row)}
      </ul>
    </div>
  );
}
