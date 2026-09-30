import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { t } from './i18n/he.js';
import { GEAR_BY_ID } from './data/gearCatalog.js';
import { useTrip } from './hooks/useTrip.js';
import { DEMO_TRIP, store } from './lib/store/index.js';
import { checkPassword, hashPassword, MIN_PASSWORD } from './lib/admin.js';
import { celebrate } from './lib/celebrate.js';
import { isFullyGeared } from './lib/stats.js';
import AdminPanel from './components/AdminPanel.jsx';
import Avatar from './components/Avatar.jsx';
import CrewView from './components/CrewView.jsx';
import GearView from './components/GearView.jsx';
import HomeView from './components/HomeView.jsx';
import { CreateTrip, PickMember, TripCodeForm } from './components/JoinScreen.jsx';
import RequestsInbox from './components/RequestsInbox.jsx';
import ShoppingList from './components/ShoppingList.jsx';
import Snowfall from './components/Snowfall.jsx';

const TABS = [
  { id: 'home', emoji: '🏠' },
  { id: 'gear', emoji: '🏂' },
  { id: 'crew', emoji: '👥' },
  { id: 'requests', emoji: '📬' },
  { id: 'admin', emoji: '🔐', adminOnly: true },
];

function Dialog({ children, onClose }) {
  const ref = useRef(null);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog ref={ref} className="dialog" onClose={onClose}>
      {children(() => ref.current?.close())}
    </dialog>
  );
}

function RequestDialog({ draft, members, onSend, onClose }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const owner = members.find((m) => m.id === draft.ownerId);
  const gear = GEAR_BY_ID[draft.itemId];
  return (
    <Dialog onClose={onClose}>
      {(close) => (
        <form
          method="dialog"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await onSend(message.trim());
            close();
          }}
        >
          <h3>{t.requestDialog.title(owner?.name ?? t.someone)}</h3>
          <p className="big-item">{gear?.emoji} {gear?.label}</p>
          <label className="field">
            <span>{t.requestDialog.message}</span>
            <input autoFocus maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t.requestDialog.placeholder} />
          </label>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={close}>{t.cancel}</button>
            <button className="btn btn-primary" disabled={busy}>{t.requestDialog.send}</button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

// Unlock admin mode with the trip password (or set one, for trips created before passwords existed).
function AdminDialog({ tripCode, trip, onUnlock, onClose }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasPassword = Boolean(trip.adminHash);
  const ok = hasPassword ? pw.length > 0 : pw.length >= MIN_PASSWORD && pw === pw2;

  return (
    <Dialog onClose={onClose}>
      {(close) => (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!ok) return;
            setBusy(true);
            if (hasPassword) {
              if (await checkPassword(tripCode, pw, trip.adminHash)) {
                onUnlock(trip.adminHash);
                close();
              } else {
                setWrong(true);
                setBusy(false);
              }
            } else {
              const adminHash = await hashPassword(tripCode, pw);
              await store.updateTrip(tripCode, { adminHash });
              onUnlock(adminHash);
              close();
            }
          }}
        >
          <h3>{t.adminLogin.title}</h3>
          {!hasPassword && <p className="muted small">{t.adminLogin.noPassword}</p>}
          <label className="field">
            <span>{t.adminLogin.password}</span>
            <input
              type="password"
              autoFocus
              autoComplete={hasPassword ? 'current-password' : 'new-password'}
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
                setWrong(false);
              }}
            />
          </label>
          {!hasPassword && (
            <label className="field">
              <span>{t.create.password2}</span>
              <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </label>
          )}
          {wrong && <p className="error">{t.adminLogin.wrong}</p>}
          {trip.demo && <p className="hint">{t.demoPassword}</p>}
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={close}>{t.cancel}</button>
            <button className="btn btn-primary" disabled={!ok || busy}>
              {hasPassword ? t.adminLogin.submit : t.adminLogin.setSubmit}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function MeMenu({ tripCode, me, isAdmin, onAdmin, onAdminLogout, onSwitch, onLeave, onToast }) {
  const [open, setOpen] = useState(false);
  const inviteLink = `${window.location.origin}${window.location.pathname}?trip=${tripCode}`;
  return (
    <div className="me-menu">
      <button className="me-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Avatar member={me} size={30} />
        <span className="me-name">{me.name}</span>
        {isAdmin && <span className="admin-badge" aria-hidden>🔐</span>}
      </button>
      {open && (
        <div className="menu" onClick={() => setOpen(false)}>
          <button onClick={() => store.updateMember(tripCode, me.id, { rider: me.rider === 'ski' ? 'snowboard' : 'ski' })}>
            {me.rider === 'ski' ? t.menu.toSnowboard : t.menu.toSki}
          </button>
          <button
            onClick={() =>
              navigator.clipboard
                ?.writeText(inviteLink)
                .then(() => onToast(t.toast.inviteCopied))
                .catch(() => onToast(inviteLink))
            }
          >
            {t.menu.invite}
          </button>
          {isAdmin ? (
            <button onClick={onAdminLogout}>{t.menu.adminLogout}</button>
          ) : (
            <button onClick={onAdmin}>{t.menu.adminLogin}</button>
          )}
          <button onClick={onSwitch}>{t.menu.switchPerson}</button>
          <button onClick={onLeave}>{t.menu.leave(tripCode)}</button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { tripCode, trip, members, requests, groups, messages, me, isAdmin, error, joinTrip, leaveTrip, chooseMe, setAdmin } =
    useTrip();
  const [tab, setTab] = useState('home');
  const [draft, setDraft] = useState(null);
  const [adminDialog, setAdminDialog] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  // Confetti when *you* go from missing gear to Fully Geared (not on first load or when switching person).
  const geared = me ? isFullyGeared(me) : false;
  const lastGeared = useRef({ id: null, geared: false });
  useEffect(() => {
    const prev = lastGeared.current;
    if (me && prev.id === me.id && !prev.geared && geared) {
      celebrate('big');
      setToast(t.toast.geared);
    }
    lastGeared.current = { id: me?.id ?? null, geared };
  }, [me, geared]);

  const demo = store.mode === 'demo';
  const pendingIn = me ? requests.filter((r) => r.toId === me.id && r.status === 'pending').length : 0;

  async function sendRequest(message) {
    try {
      await store.createRequest(tripCode, { itemId: draft.itemId, fromId: me.id, toId: draft.ownerId, message });
      setToast(t.toast.requestSent);
    } catch (e) {
      setToast(t.toast.requestFailed(e.message));
    }
  }

  function logoutAdmin() {
    setAdmin(null);
    setTab('home');
    setToast(t.toast.adminOff);
  }

  let body;
  if (!tripCode) {
    body = <TripCodeForm onJoin={joinTrip} />;
  } else if (error) {
    body = (
      <div className="card join-card">
        <h2>{t.loadError}</h2>
        <p className="muted">{error}</p>
        <button className="btn" onClick={leaveTrip}>{t.back}</button>
      </div>
    );
  } else if (trip === undefined || !members) {
    body = <div className="loading">{t.loading}</div>;
  } else if (trip === null) {
    body = <CreateTrip tripCode={tripCode} onBack={leaveTrip} onCreated={setAdmin} />;
  } else if (!me) {
    body = <PickMember tripCode={tripCode} members={members} onPick={chooseMe} onLeave={leaveTrip} />;
  } else {
    const onRequest = (itemId, ownerId) => setDraft({ itemId, ownerId });
    const tabs = TABS.filter((x) => !x.adminOnly || isAdmin);
    body = (
      <>
        <nav className="tabs" aria-label={t.gear.sections}>
          {tabs.map((x) => (
            <button key={x.id} className={tab === x.id ? 'on' : ''} data-tab={x.id} onClick={() => setTab(x.id)}>
              {tab === x.id && (
                <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', bounce: 0.25, duration: 0.45 }} />
              )}
              <span className="tab-content">
                <span aria-hidden>{x.emoji}</span> <span className="tab-label">{t.tabs[x.id]}</span>
              </span>
              <AnimatePresence>
                {x.id === 'requests' && pendingIn > 0 && (
                  <motion.span
                    key="dot"
                    className="dot"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                  >
                    {pendingIn}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          ))}
        </nav>
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={tab}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {tab === 'home' && (
              <HomeView
                tripCode={tripCode}
                trip={trip}
                me={me}
                groups={groups}
                messages={messages}
                isAdmin={isAdmin}
                onGoGear={() => setTab('gear')}
                onGoAdmin={() => setTab('admin')}
                onToast={setToast}
              />
            )}
            {tab === 'gear' && (
              <GearView tripCode={tripCode} member={me} me={me} members={members} requests={requests} editable>
                <ShoppingList me={me} members={members} requests={requests} onRequest={onRequest} />
              </GearView>
            )}
            {tab === 'crew' && (
              <CrewView
                tripCode={tripCode}
                members={members}
                groups={groups}
                me={me}
                isAdmin={isAdmin}
                requests={requests}
                onRequest={onRequest}
              />
            )}
            {tab === 'requests' && <RequestsInbox tripCode={tripCode} me={me} members={members} requests={requests} />}
            {tab === 'admin' && isAdmin && (
              <AdminPanel
                tripCode={tripCode}
                trip={trip}
                members={members}
                groups={groups}
                messages={messages}
                me={me}
                setAdmin={setAdmin}
                onLogout={logoutAdmin}
                onToast={setToast}
              />
            )}
          </motion.main>
        </AnimatePresence>
        {draft && <RequestDialog draft={draft} members={members} onSend={sendRequest} onClose={() => setDraft(null)} />}
        {adminDialog && (
          <AdminDialog
            tripCode={tripCode}
            trip={trip}
            onClose={() => setAdminDialog(false)}
            onUnlock={(hash) => {
              setAdmin(hash);
              setTab('admin');
              setToast(t.toast.adminOn);
            }}
          />
        )}
      </>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <Snowfall />
        {demo && (
          <div className="demo-banner">
            {t.demoBanner}
            {tripCode === DEMO_TRIP && <> {t.demoPassword}</>}
          </div>
        )}
        <header className="topbar">
          <div className="brand">
            <span aria-hidden>🏔️</span> {t.brand}
            {tripCode && me && <span className="trip-chip">{tripCode}</span>}
          </div>
          {me && trip && (
            <MeMenu
              tripCode={tripCode}
              me={me}
              isAdmin={isAdmin}
              onAdmin={() => setAdminDialog(true)}
              onAdminLogout={logoutAdmin}
              onSwitch={() => {
                chooseMe(null);
                setTab('home');
              }}
              onLeave={() => {
                leaveTrip();
                setTab('home');
              }}
              onToast={setToast}
            />
          )}
        </header>
        <div className="container">{body}</div>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </MotionConfig>
  );
}
