import { useState } from 'react';
import { AVATAR_COLORS } from '../data/gearCatalog.js';
import { isValidTripCode, normalizeTripCode, store } from '../lib/store/index.js';
import { ownedCount } from '../lib/stats.js';
import Avatar from './Avatar.jsx';

export function TripCodeForm({ onJoin }) {
  const [code, setCode] = useState('');
  const valid = isValidTripCode(code);
  return (
    <form
      className="card join-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onJoin(code);
      }}
    >
      <div className="hero-emoji" aria-hidden>🏔️</div>
      <h1>Snow Crew</h1>
      <p className="muted">Who's bringing what on the trip? Enter your trip code to join the crew.</p>
      <label className="field">
        <span>Trip code</span>
        <input
          autoFocus
          placeholder="e.g. ALPS26"
          value={code}
          onChange={(e) => setCode(normalizeTripCode(e.target.value))}
          autoCapitalize="characters"
          spellCheck={false}
        />
      </label>
      <button className="btn btn-primary" disabled={!valid}>Let's go ❄️</button>
      <p className="hint">New code = new trip. Share the same code with your friends.</p>
    </form>
  );
}

export function PickMember({ tripCode, members, onPick, onLeave }) {
  const [name, setName] = useState('');
  const [rider, setRider] = useState('snowboard');
  const [color, setColor] = useState(AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const trimmed = name.trim();
  const taken = members.some((m) => m.name.toLowerCase() === trimmed.toLowerCase());

  async function create(e) {
    e.preventDefault();
    if (!trimmed || taken) return;
    setBusy(true);
    setErr(null);
    try {
      onPick(await store.addMember(tripCode, { name: trimmed, rider, color }));
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  }

  return (
    <div className="card join-card">
      <p className="eyebrow">Trip {tripCode}</p>
      <h1>Who are you?</h1>
      {members.length > 0 && (
        <>
          <p className="muted">Tap your name…</p>
          <div className="pick-grid">
            {members.map((m) => (
              <button key={m.id} className="pick-btn" onClick={() => onPick(m.id)}>
                <Avatar member={m} />
                <span>{m.name}</span>
                <small>{m.rider === 'ski' ? '⛷️' : '🏂'} {ownedCount(m)} items</small>
              </button>
            ))}
          </div>
          <div className="divider"><span>or join as someone new</span></div>
        </>
      )}
      <form onSubmit={create} className="new-member">
        <label className="field">
          <span>Your name</span>
          <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        </label>
        {taken && <p className="error">That name is taken. Tap it above if it's you.</p>}
        <div className="field">
          <span>I ride</span>
          <div className="segmented">
            {[
              ['snowboard', '🏂 Snowboard'],
              ['ski', '⛷️ Ski'],
            ].map(([id, label]) => (
              <button type="button" key={id} className={rider === id ? 'on' : ''} onClick={() => setRider(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>My color</span>
          <div className="swatches">
            {AVATAR_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`swatch${c === color ? ' on' : ''}`}
                style={{ background: c }}
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        {err && <p className="error">{err}</p>}
        <button className="btn btn-primary" disabled={!trimmed || taken || busy}>Join the crew</button>
      </form>
      <button className="btn btn-link" onClick={onLeave}>← Different trip code</button>
    </div>
  );
}
