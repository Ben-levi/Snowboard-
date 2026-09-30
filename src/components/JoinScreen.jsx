import { useState } from 'react';
import { t } from '../i18n/he.js';
import { AVATAR_COLORS } from '../data/gearCatalog.js';
import { DEMO_TRIP, isValidTripCode, normalizeTripCode, store } from '../lib/store/index.js';
import { hashPassword, MIN_PASSWORD } from '../lib/admin.js';
import { ownedCount } from '../lib/stats.js';
import Avatar from './Avatar.jsx';

export function TripCodeForm({ onJoin }) {
  const [code, setCode] = useState('');
  const valid = isValidTripCode(code);

  async function openDemo() {
    if (!(await store.getTrip(DEMO_TRIP))) {
      await store.createTrip(DEMO_TRIP, { name: 'טיול הדוגמה', adminHash: await hashPassword(DEMO_TRIP, '1234'), demo: true });
    }
    onJoin(DEMO_TRIP);
  }

  return (
    <form
      className="card join-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onJoin(code);
      }}
    >
      <div className="hero-emoji" aria-hidden>🏔️</div>
      <h1>{t.brand}</h1>
      <p className="muted">{t.join.intro}</p>
      <label className="field">
        <span>{t.join.code}</span>
        <input
          autoFocus
          dir="ltr"
          placeholder={t.join.codePlaceholder}
          value={code}
          onChange={(e) => setCode(normalizeTripCode(e.target.value))}
          autoCapitalize="characters"
          spellCheck={false}
        />
      </label>
      <button className="btn btn-primary" disabled={!valid}>{t.join.go}</button>
      <p className="hint">{t.join.hint}</p>
      {store.mode === 'demo' && (
        <button type="button" className="btn btn-link" onClick={openDemo}>{t.join.demo}</button>
      )}
    </form>
  );
}

// A code nobody has used yet: name the trip and set its admin password.
export function CreateTrip({ tripCode, onBack, onCreated }) {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const trimmed = name.trim();
  const short = pw.length > 0 && pw.length < MIN_PASSWORD;
  const mismatch = pw2.length > 0 && pw !== pw2;
  const ok = trimmed && pw.length >= MIN_PASSWORD && pw === pw2;

  async function submit(e) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      const adminHash = await hashPassword(tripCode, pw);
      await store.createTrip(tripCode, { name: trimmed, adminHash });
      onCreated(adminHash);
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  }

  return (
    <form className="card join-card" onSubmit={submit}>
      <p className="eyebrow">{t.create.eyebrow(tripCode)}</p>
      <h1>{t.create.title}</h1>
      <p className="muted">{t.create.intro}</p>
      <label className="field">
        <span>{t.create.name}</span>
        <input autoFocus maxLength={60} value={name} placeholder={t.create.namePlaceholder} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>{t.create.password}</span>
        <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </label>
      <label className="field">
        <span>{t.create.password2}</span>
        <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </label>
      {short && <p className="error">{t.create.passwordShort}</p>}
      {mismatch && <p className="error">{t.create.mismatch}</p>}
      {err && <p className="error">{err}</p>}
      <button className="btn btn-primary" disabled={!ok || busy}>{t.create.submit}</button>
      <button type="button" className="btn btn-link" onClick={onBack}>→ {t.create.otherCode}</button>
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
      <p className="eyebrow">{t.pick.eyebrow(tripCode)}</p>
      <h1>{t.pick.title}</h1>
      {members.length > 0 && (
        <>
          <p className="muted">{t.pick.tapName}</p>
          <div className="pick-grid">
            {members.map((m) => (
              <button key={m.id} className="pick-btn" onClick={() => onPick(m.id)}>
                <Avatar member={m} />
                <span>{m.name}</span>
                <small>{m.rider === 'ski' ? '⛷️' : '🏂'} {t.items(ownedCount(m))}</small>
              </button>
            ))}
          </div>
          <div className="divider"><span>{t.pick.orNew}</span></div>
        </>
      )}
      <form onSubmit={create} className="new-member">
        <label className="field">
          <span>{t.pick.name}</span>
          <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder={t.pick.namePlaceholder} />
        </label>
        {taken && <p className="error">{t.pick.taken}</p>}
        <div className="field">
          <span>{t.pick.ride}</span>
          <div className="segmented">
            {['snowboard', 'ski'].map((id) => (
              <button type="button" key={id} className={rider === id ? 'on' : ''} onClick={() => setRider(id)}>
                {t.riders[id]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>{t.pick.color}</span>
          <div className="swatches">
            {AVATAR_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`swatch${c === color ? ' on' : ''}`}
                style={{ background: c }}
                aria-label={t.pick.colorLabel(c)}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        {err && <p className="error">{err}</p>}
        <button className="btn btn-primary" disabled={!trimmed || taken || busy}>{t.pick.submit}</button>
      </form>
      <button className="btn btn-link" onClick={onLeave}>→ {t.pick.otherCode}</button>
    </div>
  );
}
