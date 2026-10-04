// Player input from keyboard and gamepad, merged into { steer, tuck, brake, jump }.
// Touch controls (TouchControls.jsx) write into the same `touch` object.

const keys = new Set();
const pressed = new Set(); // one-shot keys (reset, camera) since the last poll
export const touch = { steer: 0, tuck: 0, brake: 0, jump: false, active: false };

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

// Called once per frame. Keyboard steering eases in so taps make small corrections.
export function readInput(dt) {
  const pad = navigator.getGamepads?.().find(Boolean);
  const left = keys.has('ArrowLeft') || keys.has('KeyA');
  const right = keys.has('ArrowRight') || keys.has('KeyD');
  const keySteer = (right ? 1 : 0) - (left ? 1 : 0);
  const k = 1 - Math.exp(-dt * (keySteer === 0 ? 10 : 5));
  smoothSteer += (keySteer - smoothSteer) * k;

  let steer = smoothSteer;
  let tuck = keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0;
  let brake = keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0;
  let jump = keys.has('Space');

  if (pad) {
    const sx = deadzone(pad.axes[0] ?? 0);
    if (sx) steer = sx;
    tuck = Math.max(tuck, pad.buttons[7]?.value ?? 0, -Math.min(0, deadzone(pad.axes[1] ?? 0)));
    brake = Math.max(brake, pad.buttons[6]?.value ?? 0, Math.max(0, deadzone(pad.axes[1] ?? 0)));
    jump = jump || Boolean(pad.buttons[0]?.pressed);
    if (pad.buttons[3]?.pressed) pressed.add('KeyR');
  }
  if (touch.active) {
    if (touch.steer) steer = touch.steer;
    tuck = Math.max(tuck, touch.tuck);
    brake = Math.max(brake, touch.brake);
    jump = jump || touch.jump;
  }
  return { steer, tuck, brake, jump };
}
