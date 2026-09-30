import { useId, useRef, useState } from 'react';
import { t } from '../i18n/he.js';
import { SECTIONS } from '../data/gearCatalog.js';
import { sectionStatus } from '../lib/stats.js';

// Pastel fill + darker outline per section state.
export const TINTS = {
  done: { fill: '#b2f2bb', stroke: '#2f9e44', label: 'מסודר' },
  partial: { fill: '#d0ebff', stroke: '#1c7ed6', label: 'בתהליך' },
  borrow: { fill: '#ffe8cc', stroke: '#f08c00', label: 'לשאול' },
  buy: { fill: '#ffd6d6', stroke: '#e03131', label: 'לקנות' },
  empty: { fill: '#f1f3f5', stroke: '#adb5bd', label: 'לא הוגדר' },
};

const SKIN = '#ffd8be';
const SKIN_LINE = '#e8a87c';
// How far each layer drifts with the pointer: positive = toward viewer.
const DEPTH = { equipment: 0.25, extras: -0.5, lower: 0.45, feet: 0.35, upper: 0.8, hands: 1.2, head: 1.1 };

const ARMS = ['M84 136 Q58 170 48 214', 'M156 136 Q182 170 192 214'];

function Region({ section, tint, active, interactive, onSelect, onHover, children }) {
  const label = SECTIONS.find((s) => s.id === section)?.label;
  const props = interactive
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': `${label}: ${tint.label}`,
        onClick: () => onSelect?.(section),
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect?.(section);
          }
        },
        onPointerEnter: () => onHover(section),
        onPointerLeave: () => onHover(null),
        onFocus: () => onHover(section),
        onBlur: () => onHover(null),
      }
    : {};
  return (
    <g
      className={`region${active ? ' active' : ''}${interactive ? ' interactive' : ''}`}
      style={{
        '--fill': tint.fill,
        '--stroke': tint.stroke,
        '--dash': tint === TINTS.empty ? '5 4' : 'none',
        transform: `translate(calc(var(--px) * ${DEPTH[section] * 7}px), calc(var(--py) * ${DEPTH[section] * 5}px))`,
      }}
      {...props}
    >
      {children}
    </g>
  );
}

export default function RiderFigure({ member, selected, onSelect, size = 280, interactive = true }) {
  const [hover, setHover] = useState(null);
  const tiltRef = useRef(null);
  const uid = useId().replace(/:/g, '');
  const isSki = member.rider === 'ski';
  const accent = member.color ?? '#4dabf7';
  const tint = (s) => TINTS[sectionStatus(member, s)];

  function onPointerMove(e) {
    if (!interactive || e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const py = ((e.clientY - r.top) / r.height - 0.5) * 2;
    tiltRef.current.style.setProperty('--px', px.toFixed(3));
    tiltRef.current.style.setProperty('--py', py.toFixed(3));
    tiltRef.current.classList.add('tilting');
  }

  function onPointerLeave() {
    if (!tiltRef.current) return;
    tiltRef.current.style.setProperty('--px', 0);
    tiltRef.current.style.setProperty('--py', 0);
    tiltRef.current.classList.remove('tilting');
  }

  const regionProps = (section) => ({
    section,
    tint: tint(section),
    active: selected === section || hover === section,
    interactive,
    onSelect,
    onHover: setHover,
  });

  const hovered = SECTIONS.find((s) => s.id === hover);

  return (
    <div
      className={`figure-stage${interactive ? '' : ' mini'}`}
      style={{ width: size }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div className="figure-tilt" ref={tiltRef} style={{ '--px': 0, '--py': 0 }}>
        <svg viewBox="0 0 240 400" className="figure-svg" aria-label={t.rider.ariaFigure(member.name)}>
          <defs>
            <linearGradient id={`lens-${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
              <stop offset="0.35" stopColor={accent} />
              <stop offset="1" stopColor="#343a40" />
            </linearGradient>
          </defs>

          <ellipse cx="120" cy="386" rx="100" ry="9" className="ground-shadow" />

          {/* Board or skis (back layer) */}
          <Region {...regionProps('equipment')}>
            {isSki ? (
              <>
                <path className="part" d="M12 356 Q4 350 10 344 L228 352 Q232 356 226 360 Z" />
                <path className="part" d="M20 372 Q12 366 18 360 L232 368 Q236 372 230 376 Z" />
                <line x1="60" y1="353" x2="180" y2="357" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
                <line x1="66" y1="369" x2="186" y2="373" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
              </>
            ) : (
              <>
                <rect className="part" x="14" y="352" width="212" height="24" rx="12" />
                <path d="M40 364 H200" stroke={accent} strokeWidth="5" strokeLinecap="round" opacity="0.85" />
                <rect className="part" x="66" y="344" width="46" height="12" rx="4" />
                <rect className="part" x="128" y="344" width="46" height="12" rx="4" />
              </>
            )}
          </Region>

          {/* Backpack peeking out behind the torso */}
          <Region {...regionProps('extras')}>
            <rect className="part" x="66" y="112" width="108" height="104" rx="20" />
            <rect className="part" x="78" y="104" width="26" height="14" rx="6" />
          </Region>

          {/* Legs / pants */}
          <Region {...regionProps('lower')}>
            <path className="part" d="M84 210 L120 210 L116 338 L74 338 Z" />
            <path className="part" d="M120 210 L156 210 L166 338 L124 338 Z" />
            <path d="M118 216 L118 300" className="seam" />
            <rect x="92" y="262" width="20" height="16" rx="4" className="seam-fill" />
          </Region>

          {/* Boots */}
          <Region {...regionProps('feet')}>
            <rect className="part" x="68" y="322" width="48" height="30" rx="11" />
            <rect className="part" x="124" y="322" width="48" height="30" rx="11" />
            <path d="M74 332 H110 M130 332 H166" className="seam" />
          </Region>

          {/* Torso + arms */}
          <Region {...regionProps('upper')}>
            {ARMS.map((d) => <path key={d} className="arm-outline" d={d} />)}
            {ARMS.map((d) => <path key={d} className="arm-fill" d={d} />)}
            <path className="part" d="M86 122 Q120 108 154 122 L168 150 L162 228 L78 228 L72 150 Z" />
            <path d="M120 120 V226" className="seam" />
            <path d="M92 124 Q98 150 94 176 M148 124 Q142 150 146 176" className="strap" />
            <rect x="130" y="160" width="20" height="4" rx="2" className="seam-fill" />
          </Region>

          {/* Gloves (or pole grips when skiing) */}
          <Region {...regionProps('hands')}>
            <circle className="part" cx="46" cy="224" r="16" />
            <circle className="part" cx="194" cy="224" r="16" />
            <rect className="part" x="34" y="202" width="24" height="10" rx="4" />
            <rect className="part" x="182" y="202" width="24" height="10" rx="4" />
          </Region>

          {isSki && (
            <Region {...regionProps('equipment')}>
              <line className="pole" x1="46" y1="214" x2="30" y2="370" />
              <line className="pole" x1="194" y1="214" x2="212" y2="370" />
              <circle className="part" cx="32" cy="352" r="6" />
              <circle className="part" cx="210" cy="352" r="6" />
            </Region>
          )}

          {/* Head: gaiter, face, helmet, goggles */}
          <Region {...regionProps('head')}>
            <rect className="part" x="98" y="100" width="44" height="24" rx="10" />
            <circle cx="120" cy="78" r="30" fill={SKIN} stroke={SKIN_LINE} strokeWidth="2" />
            <path className="part" d="M84 84 A36 36 0 0 1 156 84 Q120 76 84 84 Z" />
            <circle cx="120" cy="42" r="6" fill={accent} stroke="#fff" strokeWidth="2" />
            <path d="M86 82 H154" stroke="#343a40" strokeWidth="5" strokeLinecap="round" />
            <rect x="94" y="72" width="52" height="22" rx="11" fill={`url(#lens-${uid})`} stroke="#343a40" strokeWidth="3" />
            <path d="M101 78 L108 78" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
            <path d="M110 100 Q120 108 130 100" fill="none" stroke="#c0564a" strokeWidth="3" strokeLinecap="round" />
            <circle cx="102" cy="100" r="4" fill="#ffa8a8" opacity="0.6" />
            <circle cx="138" cy="100" r="4" fill="#ffa8a8" opacity="0.6" />
          </Region>
        </svg>
      </div>
      {interactive && (
        <div className="figure-caption" aria-live="polite">
          {hovered ? `${hovered.emoji} ${hovered.label} · ${tint(hovered.id).label}` : t.rider.hintFlat}
        </div>
      )}
    </div>
  );
}
