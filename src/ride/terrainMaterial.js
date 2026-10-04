import * as THREE from 'three';

// Snow shading on top of MeshStandardMaterial (so lights, shadows and fog still work):
// soft large-scale variation, sparkle, rock on steep faces, and an optional mask texture
// (r = groomed piste, g = forest floor, b = road) covering the near terrain.
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
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
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
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.82, metalness: 0 });
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
        float big = fbm(vWorld.xz * 0.004);
        float mid = fbm(vWorld.xz * 0.05);
        vec3 snow = vec3(0.90, 0.93, 0.98) * (0.94 + 0.08 * big + 0.04 * mid);
        // Wind crust on exposed faces is a touch bluer; hollows a touch warmer.
        snow = mix(snow, vec3(0.86, 0.91, 1.0), smoothstep(0.55, 0.9, big) * 0.35);
        vec4 mask = vec4(0.0);
        if (uHasMask > 0.5) {
          vec2 muv = (vWorld.xz - uMaskBounds.xy) / uMaskBounds.zw;
          if (muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0) mask = texture2D(uMask, muv);
        }
        // Groomed corduroy: fine stripes, slightly brighter and smoother.
        float cord = 0.5 + 0.5 * sin((vWorld.x * 0.7 + vWorld.z * 0.7) * 6.2831 / 0.35);
        snow = mix(snow, vec3(0.95, 0.97, 1.0) * (0.97 + 0.03 * cord), mask.r * 0.85);
        // Forest floor: shaded, needle-dusted snow.
        snow = mix(snow, vec3(0.74, 0.78, 0.80), mask.g * 0.55);
        // Roads: packed, dirtier snow.
        snow = mix(snow, vec3(0.62, 0.62, 0.64), mask.b * 0.8);
        float rock = smoothstep(0.80, 0.66, nW.y) * (0.75 + 0.5 * mid);
        vec3 rockCol = mix(vec3(0.24, 0.23, 0.23), vec3(0.42, 0.40, 0.38), vnoise(vWorld.xz * 0.15));
        diffuseColor.rgb = mix(snow, rockCol, clamp(rock, 0.0, 1.0));`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        // Procedural snow relief: bumps at 1-20 m plus wind ripples, fading out with distance.
        {
          float dist = length(vViewPosition);
          float fade = (1.0 - smoothstep(60.0, 900.0, dist)) * uDetail;
          if (fade > 0.001) {
            vec2 p = vWorld.xz;
            float e = 0.35;
            float h0 = fbm(p * 0.09) * 1.0 + vnoise(p * 0.6) * 0.12;
            float hx = fbm((p + vec2(e, 0.0)) * 0.09) * 1.0 + vnoise((p + vec2(e, 0.0)) * 0.6) * 0.12;
            float hz = fbm((p + vec2(0.0, e)) * 0.09) * 1.0 + vnoise((p + vec2(0.0, e)) * 0.6) * 0.12;
            vec2 grad = vec2(hx - h0, hz - h0) / e + vec2(0.83, 0.55) * cos(dot(p, vec2(0.83, 0.55)) * 2.4 + fbm(p * 0.2) * 6.0) * 0.05;
            vec3 pertW = vec3(-grad.x, 0.0, -grad.y) * 2.2 * fade * (1.0 - mask.r * 0.6);
            normal = normalize(normal + (viewMatrix * vec4(pertW, 0.0)).xyz);
          }
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.62, mask.r);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        // Sparkle: rare cells glint, a little view dependent.
        vec2 cellP = floor(vWorld.xz * 5.0);
        float glint = step(0.985, hash(cellP + floor(dot(vViewPosition, vec3(0.7)) * 0.6)));
        float near = 1.0 - smoothstep(10.0, 45.0, length(vViewPosition));
        totalEmissiveRadiance += vec3(glint * near * uSparkle * (1.0 - rock) * 0.9);`,
      );
  };
  material.userData.uniforms = uniforms;
  return material;
}
