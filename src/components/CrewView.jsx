import { useState } from 'react';
import { GEAR } from '../data/gearCatalog.js';
import { itemOf } from '../lib/store/index.js';
import { badges, countByStatus, ownedCount, readiness } from '../lib/stats.js';
import Avatar from './Avatar.jsx';
import GearView from './GearView.jsx';
import RiderFigure from './RiderFigure.jsx';

function MemberCard({ member, isMe, onOpen }) {
  const counts = countByStatus(member);
  const pct = Math.round(readiness(member) * 100);
  return (
    <button className="card member-card" onClick={() => onOpen(member.id)}>
      <RiderFigure member={member} size={96} interactive={false} />
      <div className="member-info">
        <div className="member-name">
          <Avatar member={member} size={22} /> {member.name} {isMe && <span className="you">you</span>}
        </div>
        <div className="muted small">{member.rider === 'ski' ? '⛷️ Skier' : '🏂 Snowboarder'}</div>
        <div className="progress" aria-label={`${pct}% ready`}>
          <span style={{ width: `${pct}%`, background: member.color }} />
        </div>
        <div className="mini-stats">
          <span>✅ {ownedCount(member)}</span>
          <span>🤝 {counts.borrow}</span>
          <span>🛒 {counts.buy}</span>
        </div>
        <div className="badges">{badges(member).map((b) => <span key={b.id} title={b.label}>{b.emoji}</span>)}</div>
      </div>
    </button>
  );
}

function WhoHas({ members, me, onRequest, requests }) {
  const [itemId, setItemId] = useState('');
  const owners = itemId ? members.filter((m) => itemOf(m, itemId).status === 'own') : [];
  const needers = itemId ? members.filter((m) => ['buy', 'borrow'].includes(itemOf(m, itemId).status)) : [];
  return (
    <div className="card who-has">
      <label className="field inline">
        <span>🔎 Who has…</span>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">Pick an item</option>
          {GEAR.map((g) => (
            <option key={g.id} value={g.id}>{g.emoji} {g.label}</option>
          ))}
        </select>
      </label>
      {itemId && (
        <div className="who-results">
          <div>
            <h4>Has one ({owners.length})</h4>
            {owners.length === 0 && <p className="muted small">Nobody yet</p>}
            {owners.map((m) => {
              const it = itemOf(m, itemId);
              const pending = requests.some(
                (r) => r.status === 'pending' && r.fromId === me.id && r.toId === m.id && r.itemId === itemId,
              );
              return (
                <div key={m.id} className="who-row">
                  <Avatar member={m} size={24} /> {m.name}
                  {it.note && <span className="muted small"> · {it.note}</span>}
                  {it.lentTo ? (
                    <span className="badge badge-borrowed">lent out</span>
                  ) : it.lendable && m.id !== me.id ? (
                    <button className="btn btn-small" disabled={pending} onClick={() => onRequest(itemId, m.id)}>
                      {pending ? 'Asked ✓' : 'Ask'}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div>
            <h4>Needs one ({needers.length})</h4>
            {needers.length === 0 && <p className="muted small">Nobody</p>}
            {needers.map((m) => (
              <div key={m.id} className="who-row">
                <Avatar member={m} size={24} /> {m.name}
                <span className={`badge badge-${itemOf(m, itemId).status}`}>{itemOf(m, itemId).status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CrewView({ tripCode, members, me, requests, onRequest }) {
  const [openId, setOpenId] = useState(null);
  const open = members.find((m) => m.id === openId);

  if (open) {
    return (
      <div>
        <button className="btn btn-link" onClick={() => setOpenId(null)}>← Back to crew</button>
        <h2 className="view-title">
          <Avatar member={open} /> {open.name}'s gear
        </h2>
        <GearView
          tripCode={tripCode}
          member={open}
          me={me}
          members={members}
          requests={requests}
          editable={open.id === me.id}
          onRequest={onRequest}
        />
      </div>
    );
  }

  return (
    <div>
      <WhoHas members={members} me={me} onRequest={onRequest} requests={requests} />
      <div className="crew-grid">
        {members.map((m) => (
          <MemberCard key={m.id} member={m} isMe={m.id === me.id} onOpen={setOpenId} />
        ))}
      </div>
    </div>
  );
}
