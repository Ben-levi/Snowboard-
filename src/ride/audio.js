// Procedural snow sounds with WebAudio: wind that rises with speed, the hiss of the edge when
// carving or skidding, and thumps on landings and crashes. Starts on the first user gesture.

let ctx = null;
let nodes = null;
let muted = (() => {
  try {
    return localStorage.getItem('ride:muted') === '1';
  } catch {
    return false;
  }
})();

function noiseBuffer(ac) {
  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < len; i++) {
    // Slightly pink noise: softer than white.
    b = 0.97 * b + 0.03 * (Math.random() * 2 - 1);
    d[i] = (Math.random() * 2 - 1) * 0.5 + b * 4;
  }
  return buf;
}

export function startAudio() {
  if (ctx || typeof window.AudioContext === 'undefined') {
    ctx?.resume();
    return;
  }
  ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.7;
  master.connect(ctx.destination);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const windF = ctx.createBiquadFilter();
  windF.type = 'lowpass';
  windF.frequency.value = 300;
  const windG = ctx.createGain();
  windG.gain.value = 0;
  const carveF = ctx.createBiquadFilter();
  carveF.type = 'bandpass';
  carveF.frequency.value = 2200;
  carveF.Q.value = 0.7;
  const carveG = ctx.createGain();
  carveG.gain.value = 0;
  src.connect(windF).connect(windG).connect(master);
  src.connect(carveF).connect(carveG).connect(master);
  src.start();
  nodes = { master, windF, windG, carveF, carveG };
}

export const isMuted = () => muted;

export function setMuted(v) {
  muted = v;
  try {
    localStorage.setItem('ride:muted', v ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (nodes) nodes.master.gain.setTargetAtTime(v ? 0 : 0.7, ctx.currentTime, 0.05);
}

function thump(freq, amount) {
  if (!ctx || muted) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + 0.25);
  g.gain.setValueAtTime(amount, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  o.connect(g).connect(nodes.master);
  o.start();
  o.stop(ctx.currentTime + 0.35);
}

// Called every frame with the rider state and this frame's effects.
export function updateAudio(rider, fx, paused) {
  if (!nodes) return;
  const t = ctx.currentTime;
  const v = paused ? 0 : rider.speed;
  const wind = Math.min(0.5, (v / 25) ** 2 * 0.5);
  nodes.windG.gain.setTargetAtTime(wind, t, 0.15);
  nodes.windF.frequency.setTargetAtTime(250 + v * 40, t, 0.2);
  const ground = !rider.airborne && !rider.crashed && !paused;
  const edge = ground ? Math.min(0.45, ((fx.skid ?? 0) * 0.12 + Math.max(0, (fx.carve ?? 0) - 3) * 0.03) * Math.min(1, v / 6)) : 0;
  nodes.carveG.gain.setTargetAtTime(edge, t, 0.05);
  nodes.carveF.frequency.setTargetAtTime(1600 + (fx.skid ?? 0) * 300, t, 0.1);
  if (fx.landed) thump(110, 0.5);
  if (fx.crashed) thump(70, 0.8);
}
