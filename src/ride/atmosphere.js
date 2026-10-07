import * as THREE from 'three';
import { SUN } from './sun.js';

// Light and air shared by everything in the world:
// - baked mountain light (tools/resort/prepare.mjs → light.png, farlight.png): sun hidden behind
//   ridges, less sky in valleys, applied to the terrain and to everything standing on it
// - aerial perspective: height fog that fades distant slopes into the exact colour of the sky behind them
// patchMaterial() adds both to a built-in three.js material; SkyDome uses the same sky colour.

export const SUN_DIR = new THREE.Vector3(...SUN);

// One world at a time, so the uniforms are shared module-wide.
export const atmo = {
  uLight: { value: null },
  uLightBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
  uFarLight: { value: null },
  uFarLightBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
  uHasLight: { value: 0 },
  uSunDir: { value: SUN_DIR },
};

const lightTexture = (image) => {
  const tex = new THREE.Texture(image);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
};

// Point the shared uniforms at a loaded resort's light. Returns a cleanup.
export function bindResortLight(resort) {
  if (!resort.lightImage || !resort.farLightImage) {
    atmo.uHasLight.value = 0;
    return () => {};
  }
  const near = lightTexture(resort.lightImage);
  const far = lightTexture(resort.farLightImage);
  atmo.uLight.value = near;
  atmo.uFarLight.value = far;
  const n = resort.near;
  const f = resort.far;
  atmo.uLightBounds.value.set(n.x0, n.z0, n.width, n.depth);
  atmo.uFarLightBounds.value.set(f.x0, f.z0, f.width, f.depth);
  atmo.uHasLight.value = 1;
  return () => {
    near.dispose();
    far.dispose();
    atmo.uHasLight.value = 0;
  };
}

export const ATMOSPHERE_GLSL = /* glsl */ `
  uniform sampler2D uLight;
  uniform vec4 uLightBounds;
  uniform sampler2D uFarLight;
  uniform vec4 uFarLightBounds;
  uniform float uHasLight;
  uniform vec3 uSunDir;

  // r = sun, g = sky, b = ridge shape (0.5 flat)
  vec3 bakedLight(vec2 xz) {
    if (uHasLight < 0.5) return vec3(1.0, 1.0, 0.5);
    vec2 uv = (xz - uLightBounds.xy) / uLightBounds.zw;
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) return texture2D(uLight, uv).rgb;
    return texture2D(uFarLight, clamp((xz - uFarLightBounds.xy) / uFarLightBounds.zw, 0.0, 1.0)).rgb;
  }

  // The clear sky by direction (linear colour), without clouds or the sun disc. The fog uses it too.
  vec3 skyColor(vec3 v) {
    float y = max(v.y, 0.0);
    vec3 zenith = vec3(0.035, 0.13, 0.46);
    vec3 horizon = vec3(0.40, 0.54, 0.74);
    vec3 col = mix(horizon, zenith, pow(y, 0.55));
    // Below the horizon: the haze over the valleys.
    col = mix(col, vec3(0.36, 0.46, 0.62), smoothstep(0.0, -0.2, v.y));
    float sd = max(dot(v, uSunDir), 0.0);
    col += vec3(1.0, 0.82, 0.58) * (pow(sd, 5.0) * 0.22 + pow(sd, 40.0) * 0.35);
    return col;
  }

  // Height fog integrated along the view ray: thick in the valleys, thin on the summits.
  vec3 applyAtmosphere(vec3 col, vec3 world) {
    vec3 d = world - cameraPosition;
    float dist = length(d);
    vec3 v = d / max(dist, 0.001);
    const float falloff = 1.0 / 1100.0;
    float k = falloff * d.y;
    float path = abs(k) > 0.0001 ? (1.0 - exp(-k)) / k : 1.0;
    float density = 0.000024 * exp(-(cameraPosition.y - 1700.0) * falloff);
    float fog = 1.0 - exp(-density * dist * path);
    return mix(col, skyColor(v), clamp(fog, 0.0, 1.0));
  }
`;

// Adds baked light (light: true) and aerial perspective to a MeshStandardMaterial (or Lambert/Phong).
// ao: how strongly the valleys' smaller share of sky darkens the ambient light.
export function patchMaterial(material, { light = true, ao = 1.5 } = {}) {
  const prev = Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile') ? material.onBeforeCompile : null;
  // Programs are cached by this key: include the original customisation's source so different patched
  // materials never share a program by mistake.
  const ownKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey') ? material.customProgramCacheKey.bind(material) : null;
  const prevSrc = prev ? prev.toString() : '';
  material.fog = false;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    Object.assign(shader.uniforms, atmo);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAtmWorld;')
      .replace(
        '#include <project_vertex>',
        /* glsl */ `#include <project_vertex>
        {
          vec4 atmP = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            atmP = instanceMatrix * atmP;
          #endif
          vAtmWorld = (modelMatrix * atmP).xyz;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vAtmWorld;\n${ATMOSPHERE_GLSL}`)
      .replace(
        '#include <aomap_fragment>',
        light
          ? /* glsl */ `#include <aomap_fragment>
          {
            vec3 atmB = bakedLight(vAtmWorld.xz);
            reflectedLight.directDiffuse *= atmB.r;
            reflectedLight.directSpecular *= atmB.r;
            float atmSky = pow(atmB.g, ${ao.toFixed(2)});
            reflectedLight.indirectDiffuse *= atmSky;
            reflectedLight.indirectSpecular *= atmSky;
          }`
          : '#include <aomap_fragment>',
      )
      .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = applyAtmosphere(gl_FragColor.rgb, vAtmWorld);\n#include <tonemapping_fragment>');
  };
  material.customProgramCacheKey = () => `atm${light ? 1 : 0}${ao}|${ownKey?.() ?? ''}|${prevSrc}`;
  return material;
}

// Patch every material under an object (for loaded models).
export function patchObject(object, options) {
  const seen = new Set();
  object.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (seen.has(m) || m.userData.atm) continue;
      seen.add(m);
      m.userData.atm = true;
      patchMaterial(m, options);
    }
  });
}
