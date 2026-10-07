import * as THREE from 'three';
import { patchMaterial } from './atmosphere.js';

// Snow and rock on top of MeshStandardMaterial (so lights, shadows and the atmosphere still work):
// - powder off-piste with wind-sculpted relief, groomed pistes with corduroy and skiers' tracks
// - dark rock breaking through on steep faces and wind-scoured ridges (ridge shape from the bake)
// - a mask texture over the near terrain: r = groomed piste, g = shade under trees, b = road
// - tiny glints where the sun catches snow crystals, close to the camera
const NOISE = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  uniform sampler2D uMask;
  uniform vec4 uMaskBounds; // x0, z0, width, depth
  uniform float uHasMask;
  uniform float uSparkle;
  uniform float uDetail;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(3.1, 1.7); a *= 0.5; }
    return v;
  }
`;

export function createTerrainMaterial({ sparkle = 1, detail = 1 } = {}) {
  const uniforms = {
    uMask: { value: null },
    uMaskBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
    uHasMask: { value: 0 },
    uSparkle: { value: sparkle },
    uDetail: { value: detail },
  };
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86, metalness: 0 });
  // Phones and the far horizon get a lighter version (fewer noise layers per pixel).
  if (!detail) material.defines = { TERRAIN_LITE: '' };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;\nvarying vec3 vNormalW;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWorld = (modelMatrix * vec4(position, 1.0)).xyz;\nvNormalW = normalize(mat3(modelMatrix) * normal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec3 nW = normalize(vNormalW);
        vec2 p = vWorld.xz;
        float camDist = length(vViewPosition);
        vec3 baked = bakedLight(p);
        float ridge = baked.b; // 0.5 = flat, more on ridges
        vec4 mask = vec4(0.0);
        if (uHasMask > 0.5) {
          vec2 muv = (p - uMaskBounds.xy) / uMaskBounds.zw;
          if (muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0) mask = texture2D(uMask, muv);
        }
        float piste = mask.r;
        float big = fbm(p * 0.0035);
        #ifdef TERRAIN_LITE
          float mid = vnoise(p * 0.045);
        #else
          float mid = fbm(p * 0.045);
        #endif

        // Powder: cool white, a little uneven over hundreds of metres.
        vec3 snow = vec3(0.84, 0.875, 0.93) * (0.95 + 0.07 * big + 0.03 * mid);
        // Wind-packed crust on exposed ridges is bluer and duller.
        snow = mix(snow, vec3(0.74, 0.81, 0.92), smoothstep(0.52, 0.62, ridge) * 0.5);

        // Groomed piste: more compact, with tracks scraped along the fall line.
        vec2 down = length(nW.xz) > 0.02 ? normalize(nW.xz) : vec2(0.0, 1.0);
        float along = dot(p, down);
        float across = dot(p, vec2(-down.y, down.x));
        #ifdef TERRAIN_LITE
          float tracks = 0.0;
        #else
          float tracks = vnoise(vec2(across * 1.6, along * 0.04)) * vnoise(vec2(across * 0.37, along * 0.02));
        #endif
        float trackFade = 1.0 - smoothstep(30.0, 260.0, camDist);
        vec3 groomed = vec3(0.80, 0.845, 0.91) * (0.97 + 0.03 * mid) * (1.0 - smoothstep(0.25, 0.7, tracks) * 0.09 * trackFade);
        snow = mix(snow, groomed, piste * 0.9);
        // Shade under trees: needles and twigs on the snow.
        snow = mix(snow, vec3(0.62, 0.66, 0.68), mask.g * 0.45 * (0.6 + 0.4 * mid));
        // Roads: packed, dirty snow.
        snow = mix(snow, vec3(0.45, 0.45, 0.47), mask.b * 0.85);

        // Rock through the snow: steep faces and wind-scoured ridges, as ragged outcrops with
        // dusted ledges rather than flat patches.
        float steep = smoothstep(0.88, 0.72, nW.y);
        float scoured = smoothstep(0.54, 0.66, ridge);
        float detailFade = 1.0 - smoothstep(80.0, 450.0, camDist);
        float n2 = vnoise(p * 0.07);
        #ifdef TERRAIN_LITE
          float n1 = vnoise(p * 0.012) * 0.8 + 0.1;
          float n3 = 0.5;
        #else
          float n1 = fbm(p * 0.012);
          float n3 = vnoise(p * 0.3);
        #endif
        float rockField = (steep * 0.9 + scoured * 0.6) * 0.8 + n1 * 0.5 + (n2 - 0.5) * 0.4 + (n3 - 0.5) * 0.18 * detailFade - 0.25;
        float rock = smoothstep(0.42, 0.48, rockField) * (1.0 - piste);
        float strata = vnoise(vec2(dot(p, vec2(0.6, 0.8)) * 0.7, dot(p, vec2(-0.8, 0.6)) * 0.04));
        vec3 rockCol = mix(vec3(0.045, 0.042, 0.04), vec3(0.2, 0.185, 0.165), clamp(vnoise(p * 0.05) * 0.5 + strata * 0.35 + n3 * 0.3 * detailFade, 0.0, 1.0));
        #ifndef TERRAIN_LITE
          rockCol = mix(rockCol, vec3(0.12, 0.1, 0.065), smoothstep(0.6, 0.85, fbm(p * 0.07)) * 0.35); // lichen and dry grass
        #endif
        float dust = smoothstep(0.5, 0.75, vnoise(p * 0.11) * 0.55 + n3 * 0.35 * detailFade + strata * 0.25 + (nW.y - 0.7) * 0.8);
        rockCol = mix(rockCol, snow * 0.9, dust * 0.7);
        diffuseColor.rgb = mix(snow, rockCol, rock);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        // Relief too small for the terrain mesh: drifts, wind ripples and sastrugi off-piste, fading with distance.
        {
          float fade = (1.0 - smoothstep(80.0, 1100.0, camDist)) * uDetail;
          if (fade > 0.001) {
            float e = 0.4;
            float h0 = fbm(p * 0.08) + vnoise(p * 0.55) * 0.14;
            float hx = fbm((p + vec2(e, 0.0)) * 0.08) + vnoise((p + vec2(e, 0.0)) * 0.55) * 0.14;
            float hz = fbm((p + vec2(0.0, e)) * 0.08) + vnoise((p + vec2(0.0, e)) * 0.55) * 0.14;
            vec2 grad = vec2(hx - h0, hz - h0) / e;
            // Wind ripples: crests across the prevailing north-west wind, bent by the drifts.
            float ripple = dot(p, vec2(0.83, 0.55)) * 2.2 + fbm(p * 0.15) * 7.0;
            grad += vec2(0.83, 0.55) * cos(ripple) * 0.07 * (1.0 - smoothstep(25.0, 120.0, camDist));
            float strength = mix(2.4, 0.7, piste) + rock * 2.5;
            vec3 pertW = vec3(-grad.x, 0.0, -grad.y) * strength * fade;
            normal = normalize(normal + (viewMatrix * vec4(pertW, 0.0)).xyz);
          }
          // Corduroy: fine grooves across the fall line on groomed pistes, only where they're resolvable.
          float cw = fwidth(across * 9.0);
          if (piste > 0.05 && cw < 0.2 && camDist < 14.0) {
            float groove = cos(across * 9.0 * 6.2831) * piste * (1.0 - smoothstep(0.06, 0.2, cw)) * (1.0 - smoothstep(6.0, 14.0, camDist)) * 0.035;
            vec2 dn = vec2(-down.y, down.x) * groove;
            normal = normalize(normal + (viewMatrix * vec4(dn.x, 0.0, dn.y, 0.0)).xyz);
          }
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(roughnessFactor, 0.6, piste), 0.75, rock);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        // Glints: rare snow crystals catching the sun, a centimetre across, changing as the view moves.
        if (uSparkle > 0.0 && camDist < 16.0) {
          vec2 cell = floor(p * 70.0);
          float g = hash(cell + floor(vViewPosition.xy * 2.0 + vViewPosition.z));
          float glint = step(0.9975, g) * (1.0 - smoothstep(4.0, 16.0, camDist)) * baked.r * (1.0 - rock);
          totalEmissiveRadiance += vec3(1.0, 0.97, 0.9) * glint * uSparkle * 2.5;
        }`,
      );
  };
  material.userData.uniforms = uniforms;
  patchMaterial(material, { ao: 2.5 });
  return material;
}
