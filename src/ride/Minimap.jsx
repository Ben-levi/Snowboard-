import { useEffect, useRef } from 'react';
import { DIFFICULTY_COLORS } from './resortFeatures.js';

// North-up map: hillshade, pistes, lifts, the current course and the rider.
export default function Minimap({ sim, size = 190 }) {
  const bg = useRef(null);
  const fg = useRef(null);
  const { near } = sim.current.resort;
  const features = sim.current.features;
  const w = size;
  const h = Math.round((size * near.depth) / near.width);
  const sx = w / near.width;
  const map = (x, z) => [(x - near.x0) * sx, (z - near.z0) * sx];

  useEffect(() => {
    const c = bg.current;
    const ctx = c.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = h * dpr;
    ctx.scale(dpr, dpr);
    const img = ctx.createImageData(w * dpr, h * dpr);
    const n = [0, 1, 0];
    for (let j = 0; j < h * dpr; j++)
      for (let i = 0; i < w * dpr; i++) {
        const x = near.x0 + (i / dpr / w) * near.width;
        const z = near.z0 + (j / dpr / h) * near.depth;
        near.normalAt(x, z, n);
        const shade = Math.max(0, n[0] * -0.5 + n[1] * 0.7 + n[2] * -0.5) / 1.0;
        const e = (near.heightAt(x, z) - 1650) / 1250;
        const k = (j * w * dpr + i) * 4;
        img.data[k] = 150 + 90 * shade + 10 * e;
        img.data[k + 1] = 160 + 85 * shade + 8 * e;
        img.data[k + 2] = 180 + 75 * shade;
        img.data[k + 3] = 235;
      }
    ctx.putImageData(img, 0, 0);
    ctx.lineCap = 'round';
    for (const p of features.pistes) {
      ctx.strokeStyle = DIFFICULTY_COLORS[p.difficulty] ?? '#2f7cf6';
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      p.line.forEach((pt, i) => (i ? ctx.lineTo(...map(...pt)) : ctx.moveTo(...map(...pt))));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    for (const l of features.lifts) {
      ctx.beginPath();
      ctx.moveTo(...map(l.bottom.x, l.bottom.z));
      ctx.lineTo(...map(l.top.x, l.top.z));
      ctx.stroke();
    }
  }, [sim, w, h]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = fg.current;
    const ctx = c.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = h * dpr;
    ctx.scale(dpr, dpr);
    let raf;
    let last = 0;
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 100) return;
      last = now;
      ctx.clearRect(0, 0, w, h);
      const { rider, run } = sim.current;
      if (run) {
        ctx.strokeStyle = '#ff7a1a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        run.course.line.forEach((pt, i) => (i ? ctx.lineTo(...map(...pt)) : ctx.moveTo(...map(...pt))));
        ctx.stroke();
        const g = run.course.gates[Math.min(run.next, run.course.gates.length - 1)];
        ctx.fillStyle = '#ff7a1a';
        ctx.beginPath();
        ctx.arc(...map(g.x, g.z), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      const [x, y] = map(rider.x, rider.z);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-rider.heading + Math.PI); // heading 0 = south = down the map
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [sim, w, h]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="minimap" style={{ width: w, height: h }}>
      <canvas ref={bg} style={{ width: w, height: h }} />
      <canvas ref={fg} style={{ width: w, height: h }} />
    </div>
  );
}
