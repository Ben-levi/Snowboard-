import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'motion/react';

// Number that animates from its previous value to the new one.
export default function CountUp({ value, suffix = '', duration = 0.8 }) {
  const ref = useRef(null);
  const prev = useRef(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const from = prev.current;
    if (reduced || from === value) {
      prev.current = value;
      el.textContent = `${value}${suffix}`;
      return undefined;
    }
    const controls = animate(from, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => {
        // Track what's on screen so an interrupted animation resumes from there.
        prev.current = v;
        el.textContent = `${Math.round(v)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [value, suffix, duration, reduced]);

  return <span ref={ref}>{`${reduced ? value : 0}${suffix}`}</span>;
}
