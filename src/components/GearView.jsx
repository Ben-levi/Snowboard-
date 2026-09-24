import { useState } from 'react';
import { SECTIONS } from '../data/gearCatalog.js';
import { itemOf, store } from '../lib/store/index.js';
import { countByStatus, ownedCount, readiness } from '../lib/stats.js';
import RiderFigure, { TINTS } from './RiderFigure.jsx';
import GearSection from './GearSection.jsx';

function Legend() {
  return (
    <div className="legend">
      {Object.entries(TINTS).map(([id, t]) => (
        <span key={id}>
          <i style={{ background: t.fill, borderColor: t.stroke }} /> {t.label}
        </span>
      ))}
    </div>
  );
}

// Figure + dropdown sections for one member. Editable for yourself, read-only with borrow buttons for friends.
export default function GearView({ tripCode, member, me, members, requests, editable, onRequest, children }) {
  const [open, setOpen] = useState(() => new Set(['head']));
  const nameOf = (id) => members.find((m) => m.id === id)?.name ?? 'someone';
  const counts = countByStatus(member);

  function toggle(id) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectFromFigure(id) {
    setOpen((prev) => new Set(prev).add(id));
    requestAnimationFrame(() =>
      document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
    );
  }

  function changeItem(itemId, patch) {
    store.setItem(tripCode, member.id, itemId, { ...itemOf(member, itemId), ...patch });
  }

  function renderBorrow(gear, item) {
    if (editable || !me || item.status !== 'own' || !item.lendable) return null;
    if (item.lentTo) return null;
    const pending = requests.some(
      (r) => r.status === 'pending' && r.fromId === me.id && r.toId === member.id && r.itemId === gear.id,
    );
    return (
      <button className="btn btn-small" disabled={pending} onClick={() => onRequest(gear.id, member.id)}>
        {pending ? 'Asked ✓' : 'Ask to borrow'}
      </button>
    );
  }

  return (
    <div className="gear-view">
      <div className="figure-col">
        <div className="card figure-card">
          <RiderFigure member={member} selected={[...open].at(-1)} onSelect={selectFromFigure} />
          <div className="stat-row">
            <div><b>{ownedCount(member)}</b><span>owned</span></div>
            <div><b>{counts.borrow + counts.borrowed}</b><span>borrow</span></div>
            <div><b>{counts.buy}</b><span>to buy</span></div>
            <div><b>{Math.round(readiness(member) * 100)}%</b><span>ready</span></div>
          </div>
          <Legend />
        </div>
        {children}
      </div>
      <div className="sections-col">
        {SECTIONS.map((s) => (
          <GearSection
            key={s.id}
            section={s}
            member={member}
            open={open.has(s.id)}
            onToggle={toggle}
            editable={editable}
            nameOf={nameOf}
            onItemChange={changeItem}
            renderBorrow={renderBorrow}
          />
        ))}
      </div>
    </div>
  );
}
