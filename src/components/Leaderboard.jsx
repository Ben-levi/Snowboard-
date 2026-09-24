import { badges, countByStatus, rankMembers } from '../lib/stats.js';
import { gearFor } from '../data/gearCatalog.js';
import Avatar from './Avatar.jsx';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Leaderboard({ members, me }) {
  const rows = rankMembers(members);
  const podium = rows.slice(0, 3);
  // Visual order: 2nd, 1st, 3rd.
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean);

  return (
    <div className="leaderboard">
      <div className="card podium-card">
        <h2>🏆 Most gear owned</h2>
        <div className="podium">
          {podiumOrder.map((row) => (
            <div key={row.member.id} className={`podium-spot place-${row.rank}`}>
              <div className="podium-medal">{MEDALS[row.rank - 1] ?? row.rank}</div>
              <Avatar member={row.member} size={row.rank === 1 ? 56 : 44} />
              <div className="podium-name">{row.member.name}</div>
              <div className="podium-score">{row.owned} items</div>
              <div className="podium-block" style={{ background: row.member.color }} />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <ol className="rank-list">
          {rows.map((row) => {
            const counts = countByStatus(row.member);
            const total = gearFor(row.member.rider).length;
            return (
              <li key={row.member.id} className={row.member.id === me.id ? 'me' : ''}>
                <span className="rank">{row.rank}</span>
                <Avatar member={row.member} size={32} />
                <div className="rank-main">
                  <div className="rank-name">
                    {row.member.name} {row.member.rider === 'ski' ? '⛷️' : '🏂'}
                    {badges(row.member).map((b) => (
                      <span key={b.id} className="badge-pill" title={b.label}>{b.emoji} {b.label}</span>
                    ))}
                  </div>
                  <div className="rank-bar" aria-hidden>
                    <span className="seg own" style={{ flex: counts.own }} />
                    <span className="seg borrowed" style={{ flex: counts.borrowed + counts.skip }} />
                    <span className="seg borrow" style={{ flex: counts.borrow }} />
                    <span className="seg buy" style={{ flex: counts.buy }} />
                    <span className="seg unset" style={{ flex: counts.unset }} />
                  </div>
                </div>
                <div className="rank-score">
                  <b>{row.owned}</b>
                  <span>/{total}</span>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="legend small">
          <span><i className="own" /> own</span>
          <span><i className="borrowed" /> borrowed/skip</span>
          <span><i className="borrow" /> borrow</span>
          <span><i className="buy" /> buy</span>
          <span><i className="unset" /> not set</span>
        </div>
      </div>

      <div className="card badge-key">
        <h3>Badges</h3>
        <p className="small">🏆 <b>Fully Geared</b>: nothing left to buy or borrow</p>
        <p className="small">🤝 <b>Generous</b>: lent out 2 or more items</p>
        <p className="small">🛒 <b>Shopper</b>: 5 or more items still to buy</p>
      </div>
    </div>
  );
}
