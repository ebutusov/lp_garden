import * as THREE from 'three';
import { scene } from '../core/scene.js';

// ---- Sky: gradient dome, stars and moon ----
// The sky is a huge sphere seen from the inside, coloured by a custom shader.

// Uniforms are values passed from JavaScript to the shader, the same for every pixel
// in a draw. Changing `.value` here recolours the sky on the next frame (day/night).
export const skyUniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } };

// A ShaderMaterial is written directly in GLSL, the GPU's language:
// - the vertex shader runs once per vertex and decides where it lands on screen;
// - the fragment shader runs once per pixel and decides its colour.
// `varying` values are written by the vertex shader and arrive in the fragment
// shader smoothly interpolated across each triangle. Here that's the direction from
// the dome's centre, whose height (y) picks a blend between horizon and zenith colours.
export const sky = new THREE.Mesh(
  new THREE.SphereGeometry(500, 24, 12),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    // colorspace_fragment is one of three's built-in shader chunks: it converts the
    // result to the output colour space like the built-in materials do.
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 horizon;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        gl_FragColor = vec4(mix(horizon, top, pow(h, 0.6)), 1.0);
        #include <colorspace_fragment>
      }`,
    // BackSide: draw the inside faces (normally only outward faces are drawn).
    // depthWrite false + renderOrder -1: drawn first and never hides anything,
    // so it behaves as a backdrop no matter how far away things are.
    side: THREE.BackSide, depthWrite: false, fog: false,
  })
);
sky.renderOrder = -1;
scene.add(sky);

// Stars and moon sit on a far sky dome that follows the player. They ignore fog,
// which would otherwise hide anything past 150 units.
const SKY_R = 450;
const STAR_COUNT = 1200;
// Points geometry: one vertex per star, stored in a flat Float32Array (x, y, z, x, y, z, …).
// A BufferGeometry is just named arrays of per-vertex data ("attributes") uploaded to the GPU.
const starPositions = new Float32Array(STAR_COUNT * 3);
for (let i = 0; i < STAR_COUNT; i++) {
  // Picking y uniformly and an angle uniformly spreads points evenly over a sphere's
  // surface (Archimedes' hat-box theorem).
  const y = 0.05 + Math.random() * 0.95; // upper hemisphere only
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - y * y);
  starPositions.set([Math.cos(a) * r * SKY_R, y * SKY_R, Math.sin(a) * r * SKY_R], i * 3);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
// sizeAttenuation false: every star is 2 pixels whatever its distance.
export const starMat = new THREE.PointsMaterial({
  color: 0xffffff, size: 2, sizeAttenuation: false,
  transparent: true, opacity: 0, fog: false, depthWrite: false,
});
export const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

// MeshBasicMaterial ignores lights entirely: the moon is always fully bright.
export const moonMat = new THREE.MeshBasicMaterial({ color: 0xf3f1e0, transparent: true, opacity: 0, fog: false });
export const moon = new THREE.Mesh(new THREE.SphereGeometry(12, 16, 12), moonMat);
// Same direction as the sun light, so moonlit shadows fall away from the moon.
export const MOON_OFFSET = new THREE.Vector3(40, 60, 20).normalize().multiplyScalar(SKY_R - 20);
scene.add(moon);
