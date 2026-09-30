import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { t } from '../i18n/he.js';
import { GEAR_BY_ID } from '../data/gearCatalog.js';
import { acceptRequest, cancelRequest, declineRequest, takeBackRequest } from '../lib/store/index.js';
import Avatar from './Avatar.jsx';
import { celebrate } from '../lib/celebrate.js';


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
            <><b>{other?.name ?? t.someone}</b> {t.requests.wantsToBorrow} <b>{gear?.emoji} {gear?.label}</b> {t.requests.yourItem}</>
          ) : (
            <>{t.requests.youAsked}<b>{other?.name ?? t.someone}</b> {t.requests.for} <b>{gear?.emoji} {gear?.label}</b></>
          )}
        </div>
        {request.message && <div className="req-msg">“{request.message}”</div>}
        <div className="muted small">{t.requests.status[request.status]} · {new Date(request.createdAt).toLocaleDateString('he-IL')}</div>
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
        <h2>{t.requests.incomingTitle}</h2>
        {!incoming.length && <p className="muted">{t.requests.incomingEmpty}</p>}
        <ul className="request-list">
          <AnimatePresence initial={false}>
            {incoming.map((r) => (
              <RequestCard key={r.id} request={r} other={byId(r.fromId)} incoming>
                {r.status === 'pending' && (
                  <>
                    <button className="btn btn-small btn-primary" disabled={busy === r.id} onClick={() => run(r.id, () => acceptRequest(tripCode, r, members).then(() => celebrate()))}>
                      {t.requests.lend}
                    </button>
                    <button className="btn btn-small" disabled={busy === r.id} onClick={() => run(r.id, () => declineRequest(tripCode, r))}>
                      {t.requests.decline}
                    </button>
                  </>
                )}
                {r.status === 'accepted' && (
                  <button className="btn btn-small" disabled={busy === r.id} onClick={() => run(r.id, () => takeBackRequest(tripCode, r, members))}>
                    {t.requests.takeBack}
                  </button>
                )}
              </RequestCard>
            ))}
          </AnimatePresence>
        </ul>
      </div>

      <div className="card">
        <h2>{t.requests.outgoingTitle}</h2>
        {!outgoing.length && <p className="muted">{t.requests.outgoingEmpty}</p>}
        <ul className="request-list">
          <AnimatePresence initial={false}>
            {outgoing.map((r) => (
              <RequestCard key={r.id} request={r} other={byId(r.toId)}>
                {r.status === 'pending' && (
                  <button className="btn btn-small" disabled={busy === r.id} onClick={() => run(r.id, () => cancelRequest(tripCode, r))}>
                    {t.requests.cancel}
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
