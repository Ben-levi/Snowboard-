import confetti from 'canvas-confetti';

const SNOW = ['#ffffff', '#d0ebff', '#74c0fc', '#b2f2bb', '#ffd43b'];

// Big two-sided burst for "Fully Geared", a small pop for lending gear.
export function celebrate(kind = 'small') {
  const base = { colors: SNOW, disableForReducedMotion: true, zIndex: 60 };
  if (kind === 'big') {
    confetti({ ...base, particleCount: 90, spread: 70, angle: 60, origin: { x: 0, y: 0.7 } });
    confetti({ ...base, particleCount: 90, spread: 70, angle: 120, origin: { x: 1, y: 0.7 } });
  } else {
    confetti({ ...base, particleCount: 50, spread: 60, startVelocity: 30, origin: { y: 0.6 } });
  }
}
