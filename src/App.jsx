import { useEffect, useRef, useState } from 'react';
import { GEAR_BY_ID } from './data/gearCatalog.js';
import { useTrip } from './hooks/useTrip.js';
import { store } from './lib/store/index.js';
import Avatar from './components/Avatar.jsx';
import CrewView from './components/CrewView.jsx';
import GearView from './components/GearView.jsx';
import { PickMember, TripCodeForm } from './components/JoinScreen.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import RequestsInbox from './components/RequestsInbox.jsx';
import ShoppingList from './components/ShoppingList.jsx';
import Snowfall from './components/Snowfall.jsx';

const TABS = [
  { id: 'gear', label: 'My Gear', emoji: '🏂' },
  { id: 'crew', label: 'Crew', emoji: '👥' },
  { id: 'leaderboard', label: 'Leaderboard', emoji: '🏆' },
  { id: 'requests', label: 'Requests', emoji: '📬' },
];

function RequestDialog({ draft, members, onSend, onClose }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => ref.current?.showModal(), []);
  const owner = members.find((m) => m.id === draft.ownerId);
  const gear = GEAR_BY_ID[draft.itemId];
  return (
    <dialog ref={ref} className="dialog" onClose={onClose}>
      <form
        method="dialog"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSend(message.trim());
          ref.current?.close();
        }}
      >
        <h3>Ask {owner?.name} to borrow</h3>
        <p className="big-item">{gear?.emoji} {gear?.label}</p>
        <label className="field">
          <span>Message (optional)</span>
          <input
            autoFocus
            maxLength={200}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="I'll bring it back waxed 😉"
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>Send request</button>
        </div>
      </form>
    </dialog>
  );
}

function MeMenu({ tripCode, me, onSwitch, onLeave, onToast }) {
  const [open, setOpen] = useState(false);
  const inviteLink = `${window.location.origin}${window.location.pathname}?trip=${tripCode}`;
  return (
    <div className="me-menu">
      <button className="me-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Avatar member={me} size={30} />
        <span className="me-name">{me.name}</span>
      </button>
      {open && (
        <div className="menu" onClick={() => setOpen(false)}>
          <button
            onClick={() =>
              store.updateMember(tripCode, me.id, { rider: me.rider === 'ski' ? 'snowboard' : 'ski' })
            }
          >
            {me.rider === 'ski' ? '🏂 Switch to snowboard' : '⛷️ Switch to ski'}
          </button>
          <button
            onClick={() =>
              navigator.clipboard
                ?.writeText(inviteLink)
                .then(() => onToast('Invite link copied 📋'))
                .catch(() => onToast(inviteLink))
            }
          >
            🔗 Copy invite link
          </button>
          <button onClick={onSwitch}>👤 I'm someone else</button>
          <button onClick={onLeave}>🚪 Leave trip {tripCode}</button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { tripCode, members, requests, me, error, joinTrip, leaveTrip, chooseMe } = useTrip();
  const [tab, setTab] = useState('gear');
  const [draft, setDraft] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const demo = store.mode === 'demo';
  const pendingIn = me ? requests.filter((r) => r.toId === me.id && r.status === 'pending').length : 0;

  async function sendRequest(message) {
    try {
      await store.createRequest(tripCode, { itemId: draft.itemId, fromId: me.id, toId: draft.ownerId, message });
      setToast('Request sent 🤞');
    } catch (e) {
      setToast(`Couldn't send: ${e.message}`);
    }
  }

  let body;
  if (!tripCode) {
    body = <TripCodeForm onJoin={joinTrip} />;
  } else if (error) {
    body = (
      <div className="card join-card">
        <h2>😬 Couldn't load the trip</h2>
        <p className="muted">{error}</p>
        <button className="btn" onClick={leaveTrip}>Back</button>
      </div>
    );
  } else if (!members) {
    body = <div className="loading">Waxing the boards…</div>;
  } else if (!me) {
    body = <PickMember tripCode={tripCode} members={members} onPick={chooseMe} onLeave={leaveTrip} />;
  } else {
    const onRequest = (itemId, ownerId) => setDraft({ itemId, ownerId });
    body = (
      <>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              <span aria-hidden>{t.emoji}</span> <span className="tab-label">{t.label}</span>
              {t.id === 'requests' && pendingIn > 0 && <span className="dot">{pendingIn}</span>}
            </button>
          ))}
        </nav>
        <main>
          {tab === 'gear' && (
            <GearView tripCode={tripCode} member={me} me={me} members={members} requests={requests} editable>
              <ShoppingList me={me} members={members} requests={requests} onRequest={onRequest} />
            </GearView>
          )}
          {tab === 'crew' && (
            <CrewView tripCode={tripCode} members={members} me={me} requests={requests} onRequest={onRequest} />
          )}
          {tab === 'leaderboard' && <Leaderboard members={members} me={me} />}
          {tab === 'requests' && <RequestsInbox tripCode={tripCode} me={me} members={members} requests={requests} />}
        </main>
        {draft && (
          <RequestDialog draft={draft} members={members} onSend={sendRequest} onClose={() => setDraft(null)} />
        )}
      </>
    );
  }

  return (
    <div className="app">
      <Snowfall />
      {demo && <div className="demo-banner">Demo mode: data stays on this device. Connect Firebase to share with the crew.</div>}
      <header className="topbar">
        <div className="brand">
          <span aria-hidden>🏔️</span> Snow Crew
          {tripCode && me && <span className="trip-chip">{tripCode}</span>}
        </div>
        {me && (
          <MeMenu
            tripCode={tripCode}
            me={me}
            onSwitch={() => {
              chooseMe(null);
              setTab('gear');
            }}
            onLeave={() => {
              leaveTrip();
              setTab('gear');
            }}
            onToast={setToast}
          />
        )}
      </header>
      <div className="container">{body}</div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
