import { useEffect, useRef } from 'react';

// Three-layer parallax snow on one canvas. Far flakes are small, slow and faint; near ones are big, fast and soft.
// Wind gusts push all layers sideways, sparkles twinkle on the far layer, and 'snow-burst' events
// (see snowBurst) puff a handful of flakes out of a point. Intensity (0..1) sets how many flakes are active.
const LAYERS = [
  { share: 0.5, size: [1, 2.2], speed: [18, 34], alpha: 0.45, wind: 0.5 },
  { share: 0.32, size: [2, 3.6], speed: [34, 58], alpha: 0.7, wind: 0.8 },
  { share: 0.18, size: [3.6, 7], speed: [60, 95], alpha: 0.9, wind: 1.2 },
];
const MAX_FLAKES = 260;
const MAX_SPARKLES = 14;

const rand = (a, b) => a + Math.random() * (b - a);

export const snowBurst = (x, y) => window.dispatchEvent(new CustomEvent('snow-burst', { detail: { x, y } }));

// Pre-rendered soft flake so each draw is one drawImage call.
function makeSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(235,245,255,0.7)');
  grad.addColorStop(1, 'rgba(210,230,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return c;
}

export default function Snowfall({ intensity = 0.35, wind = 0.15 }) {
  const canvasRef = useRef(null);
  const live = useRef({ intensity, wind });
  live.current = { intensity, wind };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const sprite = makeSprite();
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let t = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const spawn = (layer, y = rand(-20, h)) => ({
      layer,
      x: rand(0, w),
      y,
      r: rand(...LAYERS[layer].size),
      v: rand(...LAYERS[layer].speed),
      phase: rand(0, Math.PI * 2),
      sway: rand(6, 22),
    });
    const flakes = LAYERS.flatMap((l, i) => Array.from({ length: Math.round(MAX_FLAKES * l.share) }, () => spawn(i)));
    const bursts = [];
    const sparkles = Array.from({ length: MAX_SPARKLES }, () => ({ x: rand(0, w), y: rand(0, h), life: rand(0, 1), s: rand(2, 4) }));

    const onBurst = (e) => {
      for (let i = 0; i < 26; i += 1) {
        const a = rand(0, Math.PI * 2);
        const sp = rand(30, 160);
        bursts.push({ x: e.detail.x, y: e.detail.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 1, r: rand(1.5, 4) });
      }
    };
    window.addEventListener('snow-burst', onBurst);
    window.addEventListener('resize', resize);

    const frame = (ms) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) {
        last = ms;
        return;
      }
      const dt = Math.min(0.05, (ms - last) / 1000 || 0.016);
      last = ms;
      t += dt;
      const { intensity: inten, wind: wnd } = live.current;
      // Gusts: slow swell plus a faster flutter, scaled by the real wind.
      const gust = (Math.sin(t * 0.4) * 0.6 + Math.sin(t * 1.3 + 1) * 0.4) * 0.5 + 0.5;
      const push = (wnd * 120 + 8) * (0.4 + gust);
      const active = Math.round(MAX_FLAKES * (0.25 + 0.75 * inten));

      ctx.clearRect(0, 0, w, h);
      let drawn = 0;
      for (const f of flakes) {
        const L = LAYERS[f.layer];
        f.y += f.v * (0.7 + inten * 0.6) * dt;
        f.x += (Math.sin(t * 0.9 + f.phase) * f.sway + push * L.wind) * dt;
        if (f.y > h + 10 || f.x > w + 20 || f.x < -20) {
          Object.assign(f, spawn(f.layer, -10));
          if (push > 0 && Math.random() < 0.5) f.x = rand(-20, w);
        }
        if (drawn++ >= active) continue;
        ctx.globalAlpha = L.alpha;
        const d = f.r * 3.2;
        ctx.drawImage(sprite, f.x - d / 2, f.y - d / 2, d, d);
      }

      // Twinkling glints, like sun on fresh powder.
      ctx.fillStyle = '#fff';
      for (const s of sparkles) {
        s.life += dt * 0.6;
        if (s.life > 1) {
          s.life = 0;
          s.x = rand(0, w);
          s.y = rand(0, h);
        }
        const a = Math.sin(s.life * Math.PI);
        ctx.globalAlpha = a * 0.9;
        const k = s.s * a;
        ctx.fillRect(s.x - k, s.y - 0.5, k * 2, 1);
        ctx.fillRect(s.x - 0.5, s.y - k, 1, k * 2);
      }

      for (let i = bursts.length - 1; i >= 0; i -= 1) {
        const b = bursts[i];
        b.life -= dt * 0.9;
        if (b.life <= 0) {
          bursts.splice(i, 1);
          continue;
        }
        b.vy += 120 * dt;
        b.vx *= 0.985;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        ctx.globalAlpha = b.life;
        const d = b.r * 3.2;
        ctx.drawImage(sprite, b.x - d / 2, b.y - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('snow-burst', onBurst);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="snowfall" aria-hidden />;
}
