import { gearFor } from '../data/gearCatalog.js';
import { itemOf } from '../lib/store/index.js';
import { lendersFor } from '../lib/stats.js';
import Avatar from './Avatar.jsx';

export default function ShoppingList({ me, members, requests, onRequest }) {
  const gear = gearFor(me.rider);
  const toBuy = gear.filter((g) => itemOf(me, g.id).status === 'buy');
  const toBorrow = gear.filter((g) => itemOf(me, g.id).status === 'borrow');
  const unset = gear.filter((g) => g.essential && !itemOf(me, g.id).status);
  const pendingTo = (itemId, ownerId) =>
    requests.some((r) => r.status === 'pending' && r.fromId === me.id && r.toId === ownerId && r.itemId === itemId);

  return (
    <div className="card shopping">
      <h2>📝 My to-do</h2>
      {!toBuy.length && !toBorrow.length && !unset.length && <p className="muted">Nothing left to sort. You're ready to shred! 🎉</p>}

      {toBorrow.length > 0 && (
        <>
          <h3>🤝 To borrow</h3>
          <ul className="todo-list">
            {toBorrow.map((g) => {
              const lenders = lendersFor(members, g.id, me.id);
              return (
                <li key={g.id}>
                  <div className="todo-item">{g.emoji} {g.label}</div>
                  {lenders.length ? (
                    <div className="lenders">
                      {lenders.map((l) => (
                        <button
                          key={l.id}
                          className="lender-btn"
                          disabled={pendingTo(g.id, l.id)}
                          onClick={() => onRequest(g.id, l.id)}
                          title={itemOf(l, g.id).note || undefined}
                        >
                          <Avatar member={l} size={22} />
                          {pendingTo(g.id, l.id) ? `Asked ${l.name}` : `Ask ${l.name}`}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="muted small">Nobody's offering one yet</div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {toBuy.length > 0 && (
        <>
          <h3>🛒 To buy</h3>
          <ul className="todo-list">
            {toBuy.map((g) => (
              <li key={g.id}>
                <div className="todo-item">{g.emoji} {g.label}</div>
                {lendersFor(members, g.id, me.id).length > 0 && (
                  <div className="muted small">💡 Someone can lend this. Switch it to Borrow and save money.</div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {unset.length > 0 && (
        <>
          <h3>❓ Still to decide</h3>
          <p className="muted small">{unset.map((g) => `${g.emoji} ${g.label}`).join(' · ')}</p>
        </>
      )}
    </div>
  );
}
