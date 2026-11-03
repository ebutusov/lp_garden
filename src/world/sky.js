import * as THREE from 'three';
import { cameraGroup } from '../core/camera.js';
import { Feature } from './feature.js';

// ---- Sky: gradient dome, stars and moon ----
// The sky is a huge sphere seen from the inside, coloured by a custom shader.
// Stars and moon sit on a far sky dome. All three share one group that follows the
// player, so they always seem infinitely far away: you can never walk closer to them.
// They ignore fog, which would otherwise hide anything past 150 units.
const SKY_R = 450;
const STAR_COUNT = 1200;
// Same direction as the sun light, so moonlit shadows fall away from the moon.
const MOON_OFFSET = new THREE.Vector3(40, 60, 20).normalize().multiplyScalar(SKY_R - 20);

export class Sky extends Feature {
  constructor(ctx) {
    super(ctx);
    // Uniforms are values passed from JavaScript to the shader, the same for every pixel
    // in a draw. Changing `.value` here recolours the sky on the next frame (day/night).
    this.uniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } };

    // A ShaderMaterial is written directly in GLSL, the GPU's language:
    // - the vertex shader runs once per vertex and decides where it lands on screen;
    // - the fragment shader runs once per pixel and decides its colour.
    // `varying` values are written by the vertex shader and arrive in the fragment
    // shader smoothly interpolated across each triangle. Here that's the direction from
    // the dome's centre, whose height (y) picks a blend between horizon and zenith colours.
    const dome = this.mesh(
      new THREE.SphereGeometry(500, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
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
    dome.renderOrder = -1;

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
    this.starMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 2, sizeAttenuation: false,
      transparent: true, opacity: 0, fog: false, depthWrite: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.group.add(this.stars);

    // MeshBasicMaterial ignores lights entirely: the moon is always fully bright.
    this.moonMat = new THREE.MeshBasicMaterial({ color: 0xf3f1e0, transparent: true, opacity: 0, fog: false });
    this.moon = this.mesh(new THREE.SphereGeometry(12, 16, 12), this.moonMat, MOON_OFFSET.x, MOON_OFFSET.y, MOON_OFFSET.z);
  }

  // Runs after the player has moved (see animate() in main.js).
  update() {
    this.group.position.copy(cameraGroup.position);
  }
}
