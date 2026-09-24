import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { GEAR_BY_ID } from '../data/gearCatalog.js';
import { acceptRequest, cancelRequest, declineRequest, takeBackRequest } from '../lib/store/index.js';
import Avatar from './Avatar.jsx';
import { celebrate } from '../lib/celebrate.js';

const STATUS_TEXT = {
  pending: '⏳ Waiting',
  accepted: '✅ Accepted',
  declined: '❌ Declined',
  cancelled: '🚫 Cancelled',
  returned: '↩️ Taken back',
};

function RequestCard({ request, other, incoming, children }) {
  const gear = GEAR_BY_ID[request.itemId];
  return (
    <motion.li
      layout
      className={`request-card req-${request.status}`}
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', bounce: 0.25, duration: 0.4 }}
    >
      <Avatar member={other} size={36} />
      <div className="req-main">
        <div>
          {incoming ? (
            <><b>{other?.name ?? 'Someone'}</b> wants to borrow your <b>{gear?.emoji} {gear?.label}</b></>
          ) : (
            <>You asked <b>{other?.name ?? 'someone'}</b> for <b>{gear?.emoji} {gear?.label}</b></>
          )}
        </div>
        {request.message && <div className="req-msg">“{request.message}”</div>}
        <div className="muted small">{STATUS_TEXT[request.status]} · {new Date(request.createdAt).toLocaleDateString()}</div>
      </div>
      <div className="req-actions">{children}</div>
    </motion.li>
  );
}

export default function RequestsInbox({ tripCode, me, members, requests }) {
  const [busy, setBusy] = useState(null);
  const byId = (id) => members.find((m) => m.id === id);
  const incoming = requests.filter((r) => r.toId === me.id);
  const outgoing = requests.filter((r) => r.fromId === me.id);

  async function run(id, fn) {
    setBusy(id);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="requests">
      <div className="card">
        <h2>📥 Asked of you</h2>
        {!incoming.length && <p className="muted">No requests yet. Mark items as “happy to lend” so friends can ask.</p>}
        <ul className="request-list">
          <AnimatePresence initial={false}>
            {incoming.map((r) => (
              <RequestCard key={r.id} request={r} other={byId(r.fromId)} incoming>
                {r.status === 'pending' && (
                  <>
                    <button className="btn btn-small btn-primary" disabled={busy === r.id} onClick={() => run(r.id, () => acceptRequest(tripCode, r, members).then(() => celebrate()))}>
                      Lend it
                    </button>
                    <button className="btn btn-small" disabled={busy === r.id} onClick={() => run(r.id, () => declineRequest(tripCode, r))}>
                      Decline
                    </button>
                  </>
                )}
                {r.status === 'accepted' && (
                  <button className="btn btn-small" disabled={busy === r.id} onClick={() => run(r.id, () => takeBackRequest(tripCode, r, members))}>
                    Take back
                  </button>
                )}
              </RequestCard>
            ))}
          </AnimatePresence>
        </ul>
      </div>

      <div className="card">
        <h2>📤 You asked</h2>
        {!outgoing.length && <p className="muted">You haven't asked anyone yet. Check “My to-do” for who can lend.</p>}
        <ul className="request-list">
          <AnimatePresence initial={false}>
            {outgoing.map((r) => (
              <RequestCard key={r.id} request={r} other={byId(r.toId)}>
                {r.status === 'pending' && (
                  <button className="btn btn-small" disabled={busy === r.id} onClick={() => run(r.id, () => cancelRequest(tripCode, r))}>
                    Cancel
                  </button>
                )}
              </RequestCard>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}
