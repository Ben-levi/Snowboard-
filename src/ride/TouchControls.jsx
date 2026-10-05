import { useEffect, useRef, useState } from 'react';
import { touch } from './input.js';
import { t } from './he.js';

const RANGE = 70; // px of thumb travel for a full turn (stick mode)
const SWIPE = 42; // px for a swipe up (jump) or down (brake)
const buzz = (ms) => navigator.vibrate?.(ms);

function resetTouch() {
  Object.assign(touch, { steer: 0, tuck: 0, brake: 0, jump: false, digital: true });
}

// Hold the left or right half of the screen to turn (the edge rolls in smoothly and deepens while
// held), both halves to tuck; swipe up to jump (a longer hold first = a bigger ollie), swipe down
// and keep the finger down to brake.
function SidesControls() {
  const pointers = useRef(new Map());
  const [lit, setLit] = useState({ left: false, right: false });
  const jumpTimer = useRef(null);

  useEffect(() => {
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      let left = 0;
      let right = 0;
      let braking = false;
      for (const p of pointers.current.values()) {
        if (p.brake) braking = true;
        else if (!p.jumped) {
          // Turns deepen the longer the side is held: 60% at once, full after 0.7 s.
          const depth = 0.6 + 0.4 * Math.min(1, (now - p.t0) / 700);
          if (p.side < 0) left = Math.max(left, depth);
          else right = Math.max(right, depth);
        }
      }
      touch.digital = true;
      touch.brake = braking ? 1 : 0;
      if (left && right) {
        touch.tuck = 1;
        touch.steer = 0;
      } else {
        touch.tuck = 0;
        touch.steer = right - left;
      }
      setLit((l) => (l.left === Boolean(left) && l.right === Boolean(right) ? l : { left: Boolean(left), right: Boolean(right) }));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => () => clearTimeout(jumpTimer.current), []);

  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, {
      x0: e.clientX,
      y0: e.clientY,
      t0: performance.now(),
      side: e.clientX < window.innerWidth / 2 ? -1 : 1,
      brake: false,
      jumped: false,
    });
  };
  const move = (e) => {
    const p = pointers.current.get(e.pointerId);
    if (!p || p.jumped) return;
    const dy = e.clientY - p.y0;
    if (dy < -SWIPE && !p.brake) {
      // Swipe up: ollie. The hold before the swipe loads it (the physics loads while jump is held).
      p.jumped = true;
      const held = performance.now() - p.t0;
      touch.jump = true;
      buzz(12);
      clearTimeout(jumpTimer.current);
      jumpTimer.current = setTimeout(() => (touch.jump = false), Math.min(450, Math.max(120, held)));
    } else if (dy > SWIPE) {
      p.brake = true;
    }
  };
  const up = (e) => pointers.current.delete(e.pointerId);

  return (
    <div className="touch-sides" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <span className={`touch-glow left${lit.left ? ' on' : ''}`} />
      <span className={`touch-glow right${lit.right ? ' on' : ''}`} />
      <span className="touch-hint">{t.touchHint2}</span>
    </div>
  );
}

// Classic floating thumb stick on the left, jump and brake buttons on the right.
function StickControls() {
  const [stick, setStick] = useState(null);
  const pointer = useRef(null);
  const move = (e) => {
    if (e.pointerId !== pointer.current) return;
    setStick((s) => {
      if (!s) return s;
      const dx = Math.max(-RANGE, Math.min(RANGE, e.clientX - s.x0));
      const dy = Math.max(-RANGE, Math.min(RANGE, e.clientY - s.y0));
      touch.digital = false;
      touch.steer = Math.sign(dx) * (Math.abs(dx) / RANGE) ** 1.4; // finer control near the centre
      touch.tuck = Math.max(0, -dy / RANGE);
      touch.brake = Math.max(0, dy / RANGE);
      return { ...s, x: s.x0 + dx, y: s.y0 + dy };
    });
  };
  const end = (e) => {
    if (e.pointerId !== pointer.current) return;
    pointer.current = null;
    setStick(null);
    Object.assign(touch, { steer: 0, tuck: 0, brake: 0 });
  };
  return (
    <>
      <div
        className="touch-stick-zone"
        onPointerDown={(e) => {
          if (pointer.current !== null) return;
          pointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          setStick({ x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY });
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {stick ? (
          <>
            <span className="touch-base" style={{ left: stick.x0, top: stick.y0 }} />
            <span className="touch-knob" style={{ left: stick.x, top: stick.y }} />
          </>
        ) : (
          <span className="touch-hint">{t.touchHint}</span>
        )}
      </div>
      <Buttons />
    </>
  );
}

// Tilt to steer (calibrated to how the phone is held when the mode starts), buttons to jump and brake.
function TiltControls() {
  const zero = useRef(null);
  useEffect(() => {
    const onTilt = (e) => {
      const angle = screen.orientation?.angle ?? window.orientation ?? 0;
      const landscape = Math.abs(angle) === 90;
      const raw = landscape ? (e.beta ?? 0) * Math.sign(angle || 90) : e.gamma ?? 0;
      if (zero.current === null) zero.current = raw;
      touch.digital = false;
      touch.steer = Math.max(-1, Math.min(1, (raw - zero.current) / 22));
    };
    window.addEventListener('deviceorientation', onTilt);
    return () => window.removeEventListener('deviceorientation', onTilt);
  }, []);
  return <Buttons />;
}

function Buttons() {
  const hold = (key) => ({
    onPointerDown: (e) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      touch[key] = key === 'jump' ? true : 1;
    },
    onPointerUp: () => (touch[key] = key === 'jump' ? false : 0),
    onPointerCancel: () => (touch[key] = key === 'jump' ? false : 0),
  });
  return (
    <div className="touch-buttons">
      <button className="touch-btn jump" {...hold('jump')}>
        {t.touchJump}
      </button>
      <button className="touch-btn brake" {...hold('brake')}>
        {t.touchBrake}
      </button>
    </div>
  );
}

export async function requestTilt() {
  if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
    try {
      return (await DeviceOrientationEvent.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

export default function TouchControls({ mode = 'sides' }) {
  useEffect(() => {
    touch.active = true;
    return () => {
      touch.active = false;
      resetTouch();
    };
  }, []);
  useEffect(() => resetTouch, [mode]);
  return (
    <div className="touch">
      {mode === 'stick' ? <StickControls /> : mode === 'tilt' ? <TiltControls /> : <SidesControls />}
    </div>
  );
}
