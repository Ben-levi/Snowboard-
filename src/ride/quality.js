// Graphics presets. Phones get a lighter scene; ?q=low|high overrides the guess.
const PRESETS = {
  high: { name: 'high', dpr: [1, 2], shadows: true, shadowSize: 2048, lodScale: 1, sparkle: 1, detail: 1, trees: 1 },
  medium: { name: 'medium', dpr: [1, 1.5], shadows: true, shadowSize: 1024, lodScale: 0.75, sparkle: 0.8, detail: 0.8, trees: 0.6 },
  low: { name: 'low', dpr: [1, 1], shadows: false, shadowSize: 512, lodScale: 0.5, sparkle: 0.5, detail: 0, trees: 0.35 },
};

export const QUALITY_ORDER = ['low', 'medium', 'high'];

export function pickQuality() {
  const forced = new URLSearchParams(window.location.search).get('q');
  if (PRESETS[forced]) return PRESETS[forced];
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  return coarse || small ? PRESETS.medium : PRESETS.high;
}

export const preset = (name) => PRESETS[name];
