import { useEffect, useState } from 'react';
import { t } from './he.js';

// Speed and altitude, refreshed ten times a second from the simulation.
export default function Hud({ sim }) {
  const [view, setView] = useState({ speed: 0, alt: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      const s = sim.current.rider;
      setView({ speed: Math.round(s.speed * 3.6), alt: Math.round(s.y) });
    }, 100);
    return () => clearInterval(id);
  }, [sim]);
  return (
    <div className="hud">
      <div className="hud-box">
        <b data-hud="speed">{view.speed}</b>
        <span>{t.speed}</span>
      </div>
      <div className="hud-box">
        <b data-hud="alt">{view.alt}</b>
        <span>{t.altitude}</span>
      </div>
    </div>
  );
}
