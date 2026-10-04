import { useEffect, useRef, useState } from 'react';
import { touch } from './input.js';
import { t } from './he.js';

const RANGE = 70; // px of thumb travel for a full turn

// Phone controls: a floating thumb stick on the left half (sideways = edge/turn, up = tuck, down = brake),
// jump and brake buttons on the right, and optional tilt steering.
export default function TouchControls() {
  const [stick, setStick] = useState(null); // { x0, y0, x, y } in px
  const [tilt, setTilt] = useState(false);
  const pointer = useRef(null);

  useEffect(() => {
    touch.active = true;
    return () => {
      touch.active = false;
      Object.assign(touch, { steer: 0, tuck: 0, brake: 0, jump: false });
    };
  }, []);

  useEffect(() => {
    if (!tilt) return undefined;
    const onTilt = (e) => {
      // Landscape or portrait: use the axis that leans left/right for the rider.
      const landscape = Math.abs(window.orientation ?? screen.orientation?.angle ?? 0) === 90;
      const lean = landscape ? (e.beta ?? 0) * Math.sign(window.orientation ?? screen.orientation?.angle ?? 90) : e.gamma ?? 0;
      touch.steer = Math.max(-1, Math.min(1, lean / 25));
    };
    window.addEventListener('deviceorientation', onTilt);
    return () => {
      window.removeEventListener('deviceorientation', onTilt);
      touch.steer = 0;
    };
  }, [tilt]);

  async function toggleTilt() {
    if (!tilt && typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      try {
        if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') return;
      } catch {
        return;
      }
    }
    setTilt((v) => !v);
  }

  function move(e) {
    if (e.pointerId !== pointer.current) return;
    setStick((s) => {
      if (!s) return s;
      const dx = Math.max(-RANGE, Math.min(RANGE, e.clientX - s.x0));
      const dy = Math.max(-RANGE, Math.min(RANGE, e.clientY - s.y0));
      if (!tilt) touch.steer = dx / RANGE;
      touch.tuck = Math.max(0, -dy / RANGE);
      touch.brake = Math.max(0, dy / RANGE);
      return { ...s, x: s.x0 + dx, y: s.y0 + dy };
    });
  }

  function end(e) {
    if (e.pointerId !== pointer.current) return;
    pointer.current = null;
    setStick(null);
    if (!tilt) touch.steer = 0;
    touch.tuck = 0;
    touch.brake = 0;
  }

  const hold = (key) => ({
    onPointerDown: (e) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      touch[key] = key === 'jump' ? true : 1;
    },
    onPointerUp: () => (touch[key] = key === 'jump' ? false : 0),
    onPointerCancel: () => (touch[key] = key === 'jump' ? false : 0),
  });

  return (
    <div className="touch">
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
        {stick && (
          <>
            <span className="touch-base" style={{ left: stick.x0, top: stick.y0 }} />
            <span className="touch-knob" style={{ left: stick.x, top: stick.y }} />
          </>
        )}
        {!stick && <span className="touch-hint">{t.touchHint}</span>}
      </div>
      <div className="touch-buttons">
        <button className="touch-btn jump" {...hold('jump')}>
          {t.touchJump}
        </button>
        <button className="touch-btn brake" {...hold('brake')}>
          {t.touchBrake}
        </button>
        <button className={`touch-btn small${tilt ? ' on' : ''}`} onClick={toggleTilt}>
          {t.touchTilt}
        </button>
      </div>
    </div>
  );
}
