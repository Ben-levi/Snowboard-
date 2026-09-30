import { useState } from 'react';
import { motion } from 'motion/react';
import { t } from '../i18n/he.js';
import { GEAR, STATUS_BY_ID } from '../data/gearCatalog.js';
import { itemOf } from '../lib/store/index.js';
import { badges, countByStatus, ownedCount, readiness } from '../lib/stats.js';
import Avatar from './Avatar.jsx';
import GearView from './GearView.jsx';
import GroupsView from './GroupsView.jsx';
import Leaderboard from './Leaderboard.jsx';

function MemberCard({ member, isMe, onOpen }) {
  const counts = countByStatus(member);
  const pct = Math.round(readiness(member) * 100);
  return (
    <button className="card member-card" onClick={() => onOpen(member.id)}>
      <div className="member-thumb" style={{ '--accent': member.color }}>
        <img
          src={`${import.meta.env.BASE_URL}models/rider-${member.rider === 'ski' ? 'ski' : 'snowboard'}-thumb.png`}
          alt=""
          loading="lazy"
        />
      </div>
      <div className="member-info">
        <div className="member-name">
          <Avatar member={member} size={22} /> {member.name} {isMe && <span className="you">{t.you}</span>}
        </div>
        <div className="muted small">{t.riders[member.rider === 'ski' ? 'ski' : 'snowboard']}</div>
        <div className="progress" aria-label={t.crew.ready(pct)}>
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
        <span>{t.crew.whoHas}</span>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">{t.crew.pickItem}</option>
          {GEAR.map((g) => (
            <option key={g.id} value={g.id}>{g.emoji} {g.label}</option>
          ))}
        </select>
      </label>
      {itemId && (
        <div className="who-results">
          <div>
            <h4>{t.crew.hasOne(owners.length)}</h4>
            {owners.length === 0 && <p className="muted small">{t.crew.nobodyYet}</p>}
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
                    <span className="badge badge-borrowed">{t.crew.lentOut}</span>
                  ) : it.lendable && m.id !== me.id ? (
                    <button className="btn btn-small" disabled={pending} onClick={() => onRequest(itemId, m.id)}>
                      {pending ? t.crew.asked : t.crew.ask}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div>
            <h4>{t.crew.needsOne(needers.length)}</h4>
            {needers.length === 0 && <p className="muted small">{t.crew.nobody}</p>}
            {needers.map((m) => (
              <div key={m.id} className="who-row">
                <Avatar member={m} size={24} /> {m.name}
                <span className={`badge badge-${itemOf(m, itemId).status}`}>{STATUS_BY_ID[itemOf(m, itemId).status].short}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function People({ tripCode, members, me, requests, onRequest }) {
  const [openId, setOpenId] = useState(null);
  const open = members.find((m) => m.id === openId);

  if (open) {
    return (
      <div>
        <button className="btn btn-link" onClick={() => setOpenId(null)}>{t.crew.backToCrew}</button>
        <h2 className="view-title">
          <Avatar member={open} /> {t.gear.gearOf(open.name)}
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

const VIEWS = ['people', 'groups', 'board'];

// The crew tab: people, groups (apartment / car / family) and the leaderboard.
export default function CrewView({ tripCode, members, groups, me, isAdmin, requests, onRequest }) {
  const [view, setView] = useState('people');
  return (
    <div>
      <div className="sub-tabs" role="tablist">
        {VIEWS.map((v) => (
          <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
            {view === v && <motion.span layoutId="sub-pill" className="sub-pill" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
            <span className="tab-content">{t.crewTabs[v]}</span>
          </button>
        ))}
      </div>
      {view === 'people' && <People tripCode={tripCode} members={members} me={me} requests={requests} onRequest={onRequest} />}
      {view === 'groups' && <GroupsView tripCode={tripCode} groups={groups} members={members} me={me} isAdmin={isAdmin} />}
      {view === 'board' && <Leaderboard members={members} me={me} />}
    </div>
  );
}
