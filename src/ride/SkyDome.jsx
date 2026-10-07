import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ATMOSPHERE_GLSL, atmo } from './atmosphere.js';

// The sky: the same clear-sky colour the fog fades into, a sun with a glow, and slow drifting clouds.
const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vDir;
  uniform float uTime;
  uniform float uClouds;
  ${ATMOSPHERE_GLSL}
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < CLOUD_OCTAVES; i++) { v += a * noise(p); p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
  }
  void main() {
    vec3 v = normalize(vDir);
    vec3 col = skyColor(v);
    float sd = dot(v, uSunDir);
    if (v.y > 0.0 && uClouds > 0.0) {
      // Clouds on a flat layer: puffy cumulus low over the ridges, thin streaks higher up.
      vec2 p = v.xz / (v.y + 0.06);
      vec2 wind = uTime * vec2(0.006, 0.0025);
      float n = fbm(p * 0.9 + wind);
      float cover = smoothstep(0.58, 0.8, n) * uClouds;
      float body = fbm(p * 2.3 - wind * 1.5);
      vec3 lit = vec3(1.0, 0.97, 0.92) * 1.15 + vec3(1.0, 0.8, 0.55) * pow(max(sd, 0.0), 6.0) * 0.6;
      vec3 shade = vec3(0.56, 0.62, 0.72);
      vec3 cloud = mix(shade, lit, smoothstep(0.25, 0.75, body + (n - 0.6)));
      #if CLOUD_OCTAVES > 3
        float streak = smoothstep(0.6, 0.9, fbm(vec2(p.x * 0.5, p.y * 1.4) + wind * 0.5)) * 0.18 * uClouds;
      #else
        float streak = 0.0;
      #endif
      float horizonFade = smoothstep(0.0, 0.12, v.y);
      col = mix(col, vec3(0.92, 0.95, 1.0), streak * horizonFade);
      col = mix(col, cloud, cover * horizonFade * 0.92);
    }
    // The sun itself, far brighter than anything else (tone mapping turns it white).
    col += vec3(1.0, 0.92, 0.8) * smoothstep(0.99955, 0.99985, sd) * 40.0;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default function SkyDome({ clouds = 1 }) {
  const mesh = useRef();
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...atmo, uTime: { value: 0 }, uClouds: { value: clouds } },
        vertexShader,
        fragmentShader,
        defines: { CLOUD_OCTAVES: clouds >= 1 ? 5 : 3 },
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
      }),
    [clouds],
  );
  const geometry = useMemo(() => new THREE.SphereGeometry(1000, 48, 24), []);
  useEffect(() => () => (material.dispose(), geometry.dispose()), [material, geometry]);
  useFrame(({ camera, clock }) => {
    mesh.current.position.copy(camera.position);
    material.uniforms.uTime.value = clock.elapsedTime;
  });
  return <mesh name="sky" ref={mesh} geometry={geometry} material={material} renderOrder={-1000} frustumCulled={false} />;
}
