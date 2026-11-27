import { useState } from 'react';
import { t } from '../i18n/he.js';
import { sortMessages } from '../lib/tripInfo.js';
import { store } from '../lib/store/index.js';
import Avatar from './Avatar.jsx';

const N = t.trip.notes;
const when = (ms) => new Date(ms).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });

// Shared notes: anyone can post; the admin's messages (no author) show here too.
export default function NotesCard({ tripCode, messages, me, members, isAdmin, onToast, id }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = text.trim();

  async function post(e) {
    e.preventDefault();
    if (!trimmed) return;
    setBusy(true);
    try {
      await store.addMessage(tripCode, { text: trimmed, pinned: false, by: me.id });
      setText('');
    } catch (err) {
      onToast(t.toast.failed(err.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card notes-card" id={id}>
      <h2>{N.title}</h2>
      <form className="note-form" onSubmit={post}>
        <textarea rows={2} maxLength={500} value={text} placeholder={N.placeholder} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary btn-small" disabled={!trimmed || busy}>{N.post}</button>
      </form>
      {!messages.length && <p className="muted small">{N.empty}</p>}
      <ul className="note-list">
        {sortMessages(messages).map((m) => {
          const author = members.find((x) => x.id === m.by);
          const canEdit = isAdmin || (m.by && m.by === me.id);
          return (
            <li key={m.id} className={m.pinned ? 'pinned' : ''}>
              <p>{m.text}</p>
              <div className="note-meta">
                {author ? (
                  <span className="person-chip"><Avatar member={author} size={18} /> {author.name}</span>
                ) : (
                  <span>{N.admin}</span>
                )}
                <span>· {when(m.createdAt)}</span>
                {m.pinned && <span className="pin-tag">{N.pinned}</span>}
                {canEdit && (
                  <span className="note-actions">
                    {isAdmin && (
                      <button className="btn-text" onClick={() => store.updateMessage(tripCode, m.id, { pinned: !m.pinned })}>
                        {m.pinned ? N.unpin : N.pin}
                      </button>
                    )}
                    <button className="btn-text danger" onClick={() => store.deleteMessage(tripCode, m.id)}>{t.delete}</button>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
