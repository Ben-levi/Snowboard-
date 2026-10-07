import * as THREE from 'three';
import {
  buildObstacles,
  courseStarts,
  DIFFICULTY_COLORS,
  EMPTY_FEATURES,
  layoutBuildings,
  layoutLifts,
  parseWorld,
  pisteLookup,
} from './worldPrep.js';

export { DIFFICULTY_COLORS };

// Assembles what the scene and the physics need from the prepared world (tools/resort/prepare.mjs).
// Only cheap work happens here: the heavy, never-changing parts were done at build time.
export function prepareFeatures(resort, quality) {
  const { near } = resort;
  const f = { ...EMPTY_FEATURES, ...(resort.features ?? {}) };
  const world = parseWorld(resort.world, near, quality.trees);
  const buildings = layoutBuildings(near, f);
  const lifts = layoutLifts(near, f);
  const obstacles = buildObstacles({ buildings, lifts, trees: world.trees, rocks: world.rocks, furniture: world.furniture });
  const pisteAt = pisteLookup(f);

  // The mask arrives as a decoded ImageBitmap: rows top (north) to bottom, no flip needed.
  const texture = new THREE.Texture(resort.maskImage);
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;

  return {
    mask: { texture, bounds: [near.x0, near.z0, near.width, near.depth] },
    surfaceAt: (x, z) => (pisteAt(x, z) ? 'piste' : 'off'),
    obstaclesNear: obstacles.near,
    buildings,
    lifts,
    trees: world.trees,
    rocks: world.rocks,
    markers: world.markers,
    furniture: world.furniture,
    pisteAt,
    starts: courseStarts(near, world.courses),
    courses: world.courses,
    pistes: f.pistes,
    pisteAreas: f.pisteAreas,
    peaks: f.peaks,
  };
}
