import * as THREE from 'three';
import { patchMaterial } from './atmosphere.js';

// Building walls drawn from per-vertex metres (attribute facade = along the wall, height above the
// ground, building seed, eave height): stone ground floor with shop windows, rendered upper floors
// with framed windows that reflect the sky, a few lit from inside.
export function createFacadeMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 facade;\nvarying vec4 vFacade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacade = facade;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec4 vFacade;
        float fHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float fNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(fHash(i), fHash(i + vec2(1, 0)), u.x), mix(fHash(i + vec2(0, 1)), fHash(i + vec2(1, 1)), u.x), u.y);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec2 fm = vFacade.xy;
        float fSeed = vFacade.z;
        float glass = 0.0;
        float frame = 0.0;
        float litWin = 0.0;
        const float groundH = 3.4;
        const float floorH = 2.95;
        float bay = 2.7 + fract(fSeed * 7.31) * 1.1;
        float bx = fm.x / bay + fSeed * 3.7;
        float wx = abs(fract(bx) - 0.5);
        float bayId = floor(bx);
        vec3 wallC = diffuseColor.rgb * (0.9 + 0.14 * fNoise(fm * vec2(0.9, 1.7) + fSeed * 40.0));
        // Grime streaks running down from the roof.
        wallC *= 1.0 - 0.12 * smoothstep(0.55, 0.9, fNoise(vec2(fm.x * 1.7, fm.y * 0.08) + fSeed * 9.0));
        vec3 frameC = fract(fSeed * 13.7) > 0.5 ? vec3(0.62, 0.62, 0.6) : vec3(0.1, 0.055, 0.03);
        if (fm.y < groundH) {
          // Stone ground floor (and anything below the ground on the downhill side).
          vec2 q = fm / vec2(0.85, 0.42);
          q.x += mod(floor(q.y), 2.0) * 0.5;
          vec2 fq = fract(q);
          float mortar = max(step(fq.x, 0.05), step(fq.y, 0.09));
          wallC = mix(vec3(0.16, 0.145, 0.13) * (0.7 + 0.6 * fHash(floor(q) + fSeed)), vec3(0.3, 0.29, 0.27), mortar);
          // Shop fronts and doors in most bays.
          if (fm.y > 0.3 && fm.y < 2.75 && wx < 0.4 && fHash(vec2(bayId, fSeed * 91.0)) > 0.3) {
            glass = 1.0;
            frame = (wx > 0.37 || fm.y < 0.4 || fm.y > 2.62 || abs(fract(bx * 2.0) - 0.5) < 0.02) ? 1.0 : 0.0;
            litWin = step(0.55, fHash(vec2(bayId, 7.0 + fSeed)));
          }
        } else {
          float f = (fm.y - groundH) / floorH;
          float fy = fract(f);
          float hw = 0.2 + fract(fSeed * 5.1) * 0.1;
          if (fy > 0.2 && fy < 0.8 && wx < hw && fm.y < vFacade.w + 3.0) {
            glass = 1.0;
            frame = (wx > hw - 0.03 || fy < 0.24 || fy > 0.76 || abs(fy - 0.5) < 0.015) ? 1.0 : 0.0;
            litWin = step(0.9, fHash(vec2(bayId, floor(f)) + fSeed));
          }
        }
        diffuseColor.rgb = mix(wallC, mix(vec3(0.01, 0.013, 0.018) * (1.0 - litWin) + vec3(0.06, 0.035, 0.015) * litWin, frameC, frame), glass);
        float pane = glass * (1.0 - frame);`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, pane);')
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        if (pane > 0.0) {
          // The sky and the sun in the glass, stronger at grazing angles; some rooms lit warm inside.
          vec3 Vv = normalize(vViewPosition);
          vec3 Rw = inverseTransformDirection(reflect(-Vv, normal), viewMatrix);
          float fres = 0.12 + 0.88 * pow(1.0 - max(dot(Vv, normal), 0.0), 4.0);
          // Lit rooms: warm, brighter towards the top of the pane (a lamp, a curtain's shadow below).
          float glow = litWin * (0.25 + 0.2 * fract(vFacade.y * 0.37 + fSeed));
          totalEmissiveRadiance += skyColor(Rw) * fres * 0.7 * (1.0 - litWin * 0.5) + vec3(1.0, 0.6, 0.28) * glow;
        }`,
      );
  };
  return patchMaterial(material, { ao: 1.5 });
}
