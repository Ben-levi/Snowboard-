import { useEffect, useState } from 'react';
import { gearInSection, STATUS_BY_ID } from '../data/gearCatalog.js';
import { itemOf } from '../lib/store/index.js';
import { sectionStatus } from '../lib/stats.js';
import { TINTS } from './RiderFigure.jsx';

const CHOICES = ['own', 'buy', 'borrow', 'skip'];

function NoteInput({ value, onSave }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="note-input"
      placeholder="Brand, size, notes…"
      maxLength={60}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onSave(draft.trim())}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

function StatusBadge({ status }) {
  if (!status) return <span className="badge badge-empty">Not set</span>;
  return <span className={`badge badge-${status}`}>{STATUS_BY_ID[status].short}</span>;
}

function ItemRow({ gear, item, editable, nameOf, onChange, borrowAction }) {
  return (
    <li className={`item-row status-${item.status ?? 'none'}`}>
      <div className="item-main">
        <span className="item-emoji" aria-hidden>{gear.emoji}</span>
        <div className="item-text">
          <span className="item-label">
            {gear.label}
            {gear.essential && <span className="essential" title="Essential">*</span>}
          </span>
          <span className="item-meta">
            {item.status === 'borrowed' && item.borrowedFrom && <>🤝 from {nameOf(item.borrowedFrom)} </>}
            {item.lentTo && <>📤 lent to {nameOf(item.lentTo)} </>}
            {!editable && item.note && <>· {item.note}</>}
            {!editable && item.status === 'own' && item.lendable && !item.lentTo && <span className="lendable">can lend</span>}
          </span>
        </div>
        {editable ? (
          <div className="chips" role="radiogroup" aria-label={`${gear.label} status`}>
            {CHOICES.map((s) => {
              // A borrowed item lights up the Borrow chip in its own "sorted" style.
              const borrowed = s === 'borrow' && item.status === 'borrowed';
              const on = item.status === s || borrowed;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`chip chip-${s}${on ? ' on' : ''}${borrowed ? ' borrowed' : ''}`}
                  onClick={() => onChange({ status: on ? null : s, borrowedFrom: null })}
                >
                  {borrowed ? 'Borrowed ✓' : STATUS_BY_ID[s].short}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="item-side">
            <StatusBadge status={item.status} />
            {borrowAction}
          </div>
        )}
      </div>
      {editable && item.status === 'own' && (
        <div className="item-extra">
          <NoteInput value={item.note} onSave={(note) => onChange({ note })} />
          <label className="toggle">
            <input
              type="checkbox"
              checked={item.lendable}
              disabled={Boolean(item.lentTo)}
              onChange={(e) => onChange({ lendable: e.target.checked })}
            />
            <span>Happy to lend</span>
          </label>
        </div>
      )}
    </li>
  );
}

export default function GearSection({ section, member, open, onToggle, editable, nameOf, onItemChange, renderBorrow }) {
  const gear = gearInSection(member.rider, section.id);
  const state = sectionStatus(member, section.id);
  const done = gear.filter((g) => ['own', 'borrowed', 'skip'].includes(itemOf(member, g.id).status)).length;

  return (
    <section className={`gear-section${open ? ' open' : ''}`} id={`section-${section.id}`}>
      <button type="button" className="section-head" aria-expanded={open} onClick={() => onToggle(section.id)}>
        <span className="section-dot" style={{ background: TINTS[state].fill, borderColor: TINTS[state].stroke }} />
        <span className="section-emoji" aria-hidden>{section.emoji}</span>
        <span className="section-title">{section.label}</span>
        <span className="section-count">{done}/{gear.length}</span>
        <span className="chevron" aria-hidden>▾</span>
      </button>
      <div className="section-body">
        <div className="section-inner">
          <ul className="item-list">
            {gear.map((g) => (
              <ItemRow
                key={g.id}
                gear={g}
                item={itemOf(member, g.id)}
                editable={editable}
                nameOf={nameOf}
                onChange={(patch) => onItemChange(g.id, patch)}
                borrowAction={renderBorrow?.(g, itemOf(member, g.id))}
              />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
