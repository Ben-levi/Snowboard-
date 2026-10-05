// Player input from keyboard and gamepad, merged into { steer, tuck, brake, jump }.
// Touch controls (TouchControls.jsx) write into the same `touch` object.

const keys = new Set();
const pressed = new Set(); // one-shot keys (reset, camera) since the last poll
export const touch = { steer: 0, tuck: 0, brake: 0, jump: false, active: false, digital: true };

const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyR', 'KeyC']);

export function attachKeyboard(target = window) {
  const down = (e) => {
    if (e.target?.closest?.('input, textarea, select, button')) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!keys.has(e.code)) pressed.add(e.code);
    keys.add(e.code);
  };
  const up = (e) => keys.delete(e.code);
  const blur = () => keys.clear();
  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    target.removeEventListener('keydown', down);
    target.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
  };
}

export function takePressed(code) {
  const had = pressed.has(code);
  pressed.delete(code);
  return had;
}

const deadzone = (v, d = 0.15) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

let smoothSteer = 0;
let steerVel = 0;

// One smoothing stage for every input. Digital sources (keys, holding a side of the screen) roll the
// edge in over ~0.35 s and out over ~0.25 s through a critically damped spring, so turns start and
// end smoothly; analog sources (stick, tilt, gamepad) are only lightly smoothed.
export function smoothTowards(target, dt, digital) {
  const releasing = Math.abs(target) < Math.abs(smoothSteer) - 1e-3;
  const omega = digital ? (releasing ? 16 : 11) : 30;
  // Semi-implicit critically damped spring, in small substeps so slow frames stay stable.
  const n = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    steerVel += (-2 * omega * steerVel - omega * omega * (smoothSteer - target)) * h;
    smoothSteer += steerVel * h;
  }
  if (Math.abs(smoothSteer) > 1) {
    smoothSteer = Math.sign(smoothSteer);
    steerVel = 0;
  }
  return smoothSteer;
}

// Called once per frame.
export function readInput(dt) {
  const pad = navigator.getGamepads?.().find(Boolean);
  const left = keys.has('ArrowLeft') || keys.has('KeyA');
  const right = keys.has('ArrowRight') || keys.has('KeyD');
  let target = (right ? 1 : 0) - (left ? 1 : 0);
  let digital = true;
  let tuck = keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0;
  let brake = keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0;
  let jump = keys.has('Space');

  if (pad) {
    const sx = deadzone(pad.axes[0] ?? 0);
    if (sx) {
      target = sx;
      digital = false;
    }
    tuck = Math.max(tuck, pad.buttons[7]?.value ?? 0, -Math.min(0, deadzone(pad.axes[1] ?? 0)));
    brake = Math.max(brake, pad.buttons[6]?.value ?? 0, Math.max(0, deadzone(pad.axes[1] ?? 0)));
    jump = jump || Boolean(pad.buttons[0]?.pressed);
    if (pad.buttons[3]?.pressed) pressed.add('KeyR');
  }
  if (touch.active) {
    if (touch.steer) {
      target = touch.steer;
      digital = touch.digital;
    }
    tuck = Math.max(tuck, touch.tuck);
    brake = Math.max(brake, touch.brake);
    jump = jump || touch.jump;
  }
  return { steer: smoothTowards(target, dt, digital), tuck, brake, jump };
}
