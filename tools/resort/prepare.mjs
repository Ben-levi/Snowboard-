#!/usr/bin/env node
// Prepares a baked resort for the ride page, so phones download results instead of computing them:
//   terrain.bin.gz  groomed near heights, delta-encoded + gzipped (see src/ride/terrainCodec.js)
//   mask.png        piste / tree-shade / road mask for the snow shader
//   light.png       baked sunlight / sky light / ridge shape over the near terrain (src/ride/lightBake.js)
//   farlight.png    the same over the horizon grid
//   world.json      popular runs, starts, trees, boulders, poles, nets, snow guns, signs, target times
//   bots.json       the gold-medal bot run of each popular run (first ghost to race)
// Needs only the files from bake.mjs (no network). Runs before `vite` and `vite build`.
// Usage: node tools/resort/prepare.mjs pas-de-la-casa
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { PNG } from 'pngjs';
import { makeHeightfield } from '../../src/ride/terrainData.js';
import { encodeHeights } from '../../src/ride/terrainCodec.js';
import {
  buildObstacles,
  courseStarts,
  layoutBuildings,
  layoutLifts,
  pisteLookup,
  prepareWorld,
  serializeWorld,
} from '../../src/ride/worldPrep.js';
import { simulateRun } from '../../src/ride/bot.js';
import { encodeGhost } from '../../src/ride/ghost.js';
import { bakeLight, combinedHeight } from '../../src/ride/lightBake.js';
import { SUN } from '../../src/ride/sun.js';

const t0 = Date.now();
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const id = process.argv[2] ?? 'pas-de-la-casa';
const dir = join(root, 'public/resort', id);
const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'));
const raw = await readFile(join(dir, 'height.bin'));
const near = makeHeightfield({ ...meta.near, scale: meta.scale }, new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2));
const farRaw = await readFile(join(dir, 'far.bin'));
const far = makeHeightfield({ ...meta.far, scale: meta.scale }, new Uint16Array(farRaw.buffer, farRaw.byteOffset, farRaw.byteLength / 2));
const features = JSON.parse(await readFile(join(dir, 'features.json'), 'utf8').catch(() => 'null'));

const world = prepareWorld(near, features);

// Groomed heights back to the baked Uint16 encoding.
const values = new Uint16Array(near.heights.length);
for (let k = 0; k < values.length; k++) values[k] = Math.max(0, Math.min(65535, Math.round((near.heights[k] - meta.near.base) / meta.scale)));
const terrain = gzipSync(encodeHeights(values, meta.near.cols), { level: 9 });
await writeFile(join(dir, 'terrain.bin.gz'), terrain);

const rgbPng = ({ width, height, data }) => {
  const png = new PNG({ width, height });
  for (let k = 0; k < width * height; k++) {
    png.data[k * 4] = data[k * 3];
    png.data[k * 4 + 1] = data[k * 3 + 1];
    png.data[k * 4 + 2] = data[k * 3 + 2];
    png.data[k * 4 + 3] = 255;
  }
  return PNG.sync.write(png, { colorType: 2 });
};
const maskPng = rgbPng(world.mask);
await writeFile(join(dir, 'mask.png'), maskPng);

// Light, after grooming so the pistes' shading matches their shape.
const tl = Date.now();
const heightAt = combinedHeight(near, far);
const maxHeight = Math.max(meta.near.max, meta.far.max) + 10;
const light = rgbPng(
  bakeLight({ heightAt, x0: near.x0, z0: near.z0, width: near.width, depth: near.depth, cols: 512, rows: Math.round((512 * near.depth) / near.width), sun: SUN, maxHeight }),
);
await writeFile(join(dir, 'light.png'), light);
const farLight = rgbPng(
  bakeLight({ heightAt: far.heightAt, x0: far.x0, z0: far.z0, width: far.width, depth: far.depth, cols: 256, rows: 256, sun: SUN, maxHeight, reach: 15000, skyReach: 2500 }),
);
await writeFile(join(dir, 'farlight.png'), farLight);
const lightMs = Date.now() - tl;

// Target times: the bot rides every popular run with the same physics and obstacles as the game.
const lifts = layoutLifts(near, features);
const buildings = layoutBuildings(near, features);
const obstacles = buildObstacles({ buildings, lifts, trees: world.trees, rocks: world.rocks, furniture: world.furniture });
const pisteAt = pisteLookup(features);
const physicsWorld = {
  heightAt: near.heightAt,
  normalAt: near.normalAt,
  surfaceAt: (x, z) => (pisteAt(x, z) ? 'piste' : 'off'),
  obstaclesNear: obstacles.near,
  x0: near.x0,
  z0: near.z0,
  width: near.width,
  depth: near.depth,
};
const pars = {};
const bots = {};
for (const start of courseStarts(near, world.courses)) {
  const r = simulateRun(start.course, physicsWorld, start);
  if (!r.finished) {
    console.warn(`  bot did not finish ${start.name}`);
    continue;
  }
  pars[start.id] = Math.round(r.time * 100) / 100;
  bots[start.id] = { time: r.time, splits: r.splits, data: encodeGhost(r.ghost) };
}
const json = JSON.stringify(serializeWorld(world, pars));
await writeFile(join(dir, 'world.json'), json);
const botsJson = JSON.stringify(bots);
await writeFile(join(dir, 'bots.json'), botsJson);

const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(
  `prepared ${id} in ${Date.now() - t0} ms: terrain ${kb(terrain.length)}, mask ${kb(maskPng.length)}, light ${kb(light.length + farLight.length)} (${lightMs} ms), ` +
    `world ${kb(json.length)} (gzip ${kb(gzipSync(json).length)}), bots ${kb(botsJson.length)} (gzip ${kb(gzipSync(botsJson).length)}), ` +
    `${world.courses.length} runs, ${Object.keys(pars).length} target times, ${world.trees.length} trees, ${world.rocks.length} rocks`,
);
