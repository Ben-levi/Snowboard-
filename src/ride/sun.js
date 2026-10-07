// Where the sun is, shared by the renderer and the build-time light bake (tools/resort/prepare.mjs).
// Mid-morning in winter: low (about 30° up) from the south-east, so the east-facing runs are lit and
// the mountains cast long shadows. x = east, y = up, z = south.
const s = [0.5, 0.5, 0.71];
const len = Math.hypot(...s);
export const SUN = s.map((v) => v / len);
