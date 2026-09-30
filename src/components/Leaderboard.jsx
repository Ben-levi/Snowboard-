import { motion } from 'motion/react';
import { badges, countByStatus, rankMembers } from '../lib/stats.js';
import { gearFor } from '../data/gearCatalog.js';
import { t } from '../i18n/he.js';
import Avatar from './Avatar.jsx';
import CountUp from './CountUp.jsx';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Leaderboard({ members, me }) {
  const rows = rankMembers(members);
  const podium = rows.slice(0, 3);
  // Visual order: 2nd, 1st, 3rd.
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean);

  return (
    <div className="leaderboard">
      <div className="card podium-card">
        <h2>{t.board.title}</h2>
        <div className="podium">
          {podiumOrder.map((row) => (
            <motion.div
              key={row.member.id}
              layout
              className={`podium-spot place-${row.rank}`}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', bounce: 0.35, delay: (3 - row.rank) * 0.08 }}
            >
              <div className="podium-medal">{MEDALS[row.rank - 1] ?? row.rank}</div>
              <Avatar member={row.member} size={row.rank === 1 ? 56 : 44} />
              <div className="podium-name">{row.member.name}</div>
              <div className="podium-score"><CountUp value={row.owned} /> {t.board.itemsUnit}</div>
              <motion.div
                className="podium-block"
                style={{ background: row.member.color, originY: 1 }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ type: 'spring', bounce: 0.3, delay: 0.15 + (3 - row.rank) * 0.1 }}
              />
            </motion.div>
          ))}
        </div>
      </div>

      <div className="card">
        <ol className="rank-list">
          {rows.map((row) => {
            const counts = countByStatus(row.member);
            const total = gearFor(row.member.rider).length;
            return (
              <motion.li
                key={row.member.id}
                layout
                className={row.member.id === me.id ? 'me' : ''}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ layout: { type: 'spring', bounce: 0.2 }, delay: Math.min(row.rank, 8) * 0.04 }}
              >
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
                  <b><CountUp value={row.owned} /></b>
                  <span>/{total}</span>
                </div>
              </motion.li>
            );
          })}
        </ol>
        <div className="legend small">
          <span><i className="own" /> {t.board.legendOwn}</span>
          <span><i className="borrowed" /> {t.board.legendBorrowed}</span>
          <span><i className="borrow" /> {t.board.legendBorrow}</span>
          <span><i className="buy" /> {t.board.legendBuy}</span>
          <span><i className="unset" /> {t.board.legendUnset}</span>
        </div>
      </div>

      <div className="card badge-key">
        <h3>{t.board.badgesTitle}</h3>
        {t.board.badges.map((b) => (
          <p key={b.name} className="small">{b.emoji} <b>{b.name}</b>: {b.desc}</p>
        ))}
      </div>
    </div>
  );
}
