import { useMemo } from 'react';

// Decorative CSS snowfall behind the app.
export default function Snowfall({ count = 36 }) {
  const flakes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 3 + Math.random() * 6,
        duration: 9 + Math.random() * 12,
        delay: -Math.random() * 20,
        drift: (Math.random() - 0.5) * 80,
      })),
    [count],
  );
  return (
    <div className="snowfall" aria-hidden>
      {flakes.map((f) => (
        <span
          key={f.id}
          style={{
            left: `${f.left}%`,
            width: f.size,
            height: f.size,
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
            '--drift': `${f.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
