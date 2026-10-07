// Graphics presets. Phones get a lighter scene; ?q=low|medium|high overrides the guess.
// logDepth: logarithmic depth buffer (no z-fighting far away, but slower fragment shading on phones).
const PRESETS = {
  high: { name: 'high', dpr: [1, 2], shadows: true, shadowSize: 2048, shadowBox: 40, lodScale: 1, sparkle: 1, detail: 1, trees: 1, npcs: 14, logDepth: true, clouds: 1 },
  medium: { name: 'medium', dpr: [0.75, 1.5], shadows: true, shadowSize: 1024, shadowBox: 25, lodScale: 0.7, sparkle: 0.6, detail: 0, trees: 0.35, npcs: 7, logDepth: false, clouds: 0.8 },
  low: { name: 'low', dpr: [0.6, 1], shadows: false, shadowSize: 512, shadowBox: 20, lodScale: 0.5, sparkle: 0.4, detail: 0, trees: 0.2, npcs: 4, logDepth: false, clouds: 0 },
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
