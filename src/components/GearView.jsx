import { useState } from 'react';
import { t } from '../i18n/he.js';
import { SECTIONS } from '../data/gearCatalog.js';
import { itemOf, store } from '../lib/store/index.js';
import { countByStatus, ownedCount, readiness, sectionStatus } from '../lib/stats.js';
import { TINTS } from './RiderFigure.jsx';
import RiderStage from './RiderStage.jsx';
import CountUp from './CountUp.jsx';
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

// One chip per section with its status colour; works with any figure, including Spline scenes.
function StatusRail({ member, selected, onSelect }) {
  return (
    <div className="status-rail" role="toolbar" aria-label={t.gear.sections}>
      {SECTIONS.map((s) => {
        const tint = TINTS[sectionStatus(member, s.id)];
        return (
          <button
            key={s.id}
            type="button"
            className={`rail-chip${selected === s.id ? ' on' : ''}`}
            style={{ '--fill': tint.fill, '--stroke': tint.stroke }}
            title={`${s.label}: ${tint.label}`}
            aria-label={`${s.label}: ${tint.label}`}
            onClick={() => onSelect(s.id)}
          >
            <span aria-hidden>{s.emoji}</span>
          </button>
        );
      })}
    </div>
  );
}

// Figure + dropdown sections for one member. Editable for yourself, read-only with borrow buttons for friends.
export default function GearView({ tripCode, member, me, members, requests, editable, onRequest, children }) {
  const [open, setOpen] = useState(() => new Set(['head']));
  const nameOf = (id) => members.find((m) => m.id === id)?.name ?? t.someone;
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
        {pending ? t.gear.asked : t.gear.askToBorrow}
      </button>
    );
  }

  return (
    <div className="gear-view">
      <div className="figure-col">
        <div className="card figure-card">
          <RiderStage member={member} selected={[...open].at(-1)} onSelect={selectFromFigure} />
          <StatusRail member={member} selected={[...open].at(-1)} onSelect={selectFromFigure} />
          <div className="stat-row">
            <div><b><CountUp value={ownedCount(member)} /></b><span>{t.gear.owned}</span></div>
            <div><b><CountUp value={counts.borrow + counts.borrowed} /></b><span>{t.gear.borrow}</span></div>
            <div><b><CountUp value={counts.buy} /></b><span>{t.gear.toBuy}</span></div>
            <div><b><CountUp value={Math.round(readiness(member) * 100)} suffix="%" /></b><span>{t.gear.ready}</span></div>
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
