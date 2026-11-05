import * as THREE from 'three';
import { cameraGroup } from '../core/camera.js';
import { SUN_DIR, MOON_DIR } from '../core/layout.js';
import { SEED, mulberry32 } from '../core/random.js';
import { Feature } from './feature.js';

// ---- Sky: gradient dome, sun, stars and moon ----
// The sky is a huge sphere seen from the inside, coloured by a custom shader.
// The sun, stars and moon sit on a far sky dome. All of them share one group that
// follows the player, so they always seem infinitely far away: you can never walk
// closer to them. They ignore fog, which would otherwise hide anything past 150 units.
//
// The sun and moon are flat discs turned to face the viewer, which is all a sphere
// that far away looks like anyway. Each has a soft halo behind it (a Sprite: a quad
// that always faces the camera) and a glow in the dome's shader around it. The sun's
// disc is brighter than white (colour values above 1), which only the bloom pass can
// show: it spreads the excess into a glare. The moon's craters are painted onto a
// canvas once and used as its texture.
const SKY_R = 450;
const STAR_COUNT = 1200;
// Disc radii in world units at SKY_R − 20 away. The real moon covers half a degree of
// sky; this one is drawn about fourteen times wider, as it looks when it rises behind
// mountains and the eye exaggerates it.
const SUN_R = 14;
const MOON_R = 26;

export class Sky extends Feature {
  constructor(ctx) {
    super(ctx);
    // Uniforms are values passed from JavaScript to the shader, the same for every pixel
    // in a draw. Changing `.value` here recolours the sky on the next frame (day/night).
    this.uniforms = {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      sunDir: { value: SUN_DIR }, sunGlow: { value: new THREE.Color() },
      moonDir: { value: MOON_DIR }, moonGlow: { value: new THREE.Color() },
    };

    // A ShaderMaterial is written directly in GLSL, the GPU's language:
    // - the vertex shader runs once per vertex and decides where it lands on screen;
    // - the fragment shader runs once per pixel and decides its colour.
    // `varying` values are written by the vertex shader and arrive in the fragment
    // shader smoothly interpolated across each triangle. Here that's the direction from
    // the dome's centre, whose height (y) picks a blend between horizon and zenith colours.
    // The dot product of that direction with the sun's is the cosine of the angle
    // between them: 1 looking straight at the sun, falling away round it. Raised to a
    // high power it makes a tight glow, to a low power a wide one.
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
          uniform vec3 sunDir;
          uniform vec3 sunGlow;
          uniform vec3 moonDir;
          uniform vec3 moonGlow;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir); // interpolation shortens it between vertices
            float h = clamp(d.y, 0.0, 1.0);
            vec3 col = mix(horizon, top, pow(h, 0.6));
            float s = max(dot(d, sunDir), 0.0);
            float m = max(dot(d, moonDir), 0.0);
            col += sunGlow * (pow(s, 64.0) + 0.35 * pow(s, 6.0));
            col += moonGlow * (pow(m, 48.0) + 0.3 * pow(m, 8.0));
            gl_FragColor = vec4(col, 1.0);
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

    // The sun. MeshBasicMaterial ignores lights entirely, so the disc shows its colour
    // as is; at 6× white it's far over the bloom threshold even by day.
    this.sunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.2, 4), transparent: true, fog: false });
    this.sun = this.disc(SUN_R, this.sunMat, SUN_DIR);
    this.sunHalo = this.halo(SUN_DIR, 230, 'rgba(255,236,200,', 0.55);

    // The moon: the same kind of disc, textured with its painted face. Its colour
    // dims the texture to just under the night bloom threshold, so only the
    // brightest crater rims and rays bloom; the rest would wash out into one glare.
    this.moonMat = new THREE.MeshBasicMaterial({
      map: moonTexture(), color: 0xc4c1b6, transparent: true, opacity: 0, fog: false,
    });
    this.moon = this.disc(MOON_R, this.moonMat, MOON_DIR);
    this.moonHalo = this.halo(MOON_DIR, 150, 'rgba(190,205,255,', 0);
  }

  // A disc on the dome in direction `dir`, turned to face the dome's centre. A
  // CircleGeometry, rather than a square with a round picture on it, so the moon's
  // depth (transparent materials still write depth) has no corners to hide stars with.
  disc(radius, material, dir) {
    const p = dir.clone().multiplyScalar(SKY_R - 20);
    const disc = this.mesh(new THREE.CircleGeometry(radius, 64), material, p.x, p.y, p.z);
    disc.lookAt(0, 0, 0); // the group is still at the origin while it's being built
    disc.renderOrder = 1; // after its halo
    return disc;
  }

  // A soft glow behind a disc: a radial gradient on a Sprite, added onto what's behind
  // it (AdditiveBlending), so it brightens the sky without ever darkening it. Mountains
  // in front still hide it, because it is depth-tested like everything else.
  halo(dir, size, rgba, opacity) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, `${rgba}1)`);
    grad.addColorStop(0.25, `${rgba}0.35)`);
    grad.addColorStop(1, `${rgba}0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    sprite.position.copy(dir).multiplyScalar(SKY_R - 10);
    sprite.scale.setScalar(size);
    this.group.add(sprite);
    return sprite;
  }

  // Runs after the player has moved (see animate() in main.js).
  update() {
    this.group.position.copy(cameraGroup.position);
  }
}

// ---- The moon's face, painted on a canvas ----
// Drawn once with the 2D canvas API and uploaded as a texture. Its own seeded
// generator gives the same moon every visit, without touching ctx.rand.
//  - Maria: the dark "seas" of old lava, soft overlapping blobs in the upper half.
//  - Craters: a ring shaded dark on the side the light comes from (the wall facing
//    away from it) and bright on the other (the wall facing it), round a slightly
//    darker floor. Sizes follow a power law, as real ones do: a few big, many small.
//  - Rays: a couple of young craters throw bright streaks across the rest.
//  - Limb darkening: the edge of the disc is a little dimmer than the middle.
function moonTexture() {
  const S = 512, C = S / 2;
  const rand = mulberry32(SEED * 3313 + 7);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d');
  // Everything is clipped to the disc, so nothing leaks past its edge.
  g.beginPath();
  g.arc(C, C, C, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#d9d5c6';
  g.fillRect(0, 0, S, S);

  // A soft-edged spot: a radial gradient from `rgba` + alpha in the middle to clear.
  const spot = (x, y, r, rgba, alpha) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `${rgba}${alpha})`);
    grad.addColorStop(0.7, `${rgba}${alpha * 0.8})`);
    grad.addColorStop(1, `${rgba}0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };

  // Maria: each sea is a cluster of blobs round a centre.
  const SEAS = [[0.36, 0.3, 70], [0.6, 0.36, 60], [0.46, 0.52, 55], [0.28, 0.56, 45], [0.66, 0.6, 35]];
  for (const [sx, sy, sr] of SEAS) {
    for (let i = 0; i < 6; i++) {
      const a = rand() * 6.28, d = rand() * sr * 0.7;
      spot(sx * S + Math.cos(a) * d, sy * S + Math.sin(a) * d, sr * (0.5 + rand() * 0.5), 'rgba(110,112,118,', 0.35);
    }
  }
  // Mottling, so the highlands aren't one flat colour.
  for (let i = 0; i < 160; i++) {
    const light = rand() < 0.5;
    spot(rand() * S, rand() * S, 6 + rand() * 22, light ? 'rgba(245,242,230,' : 'rgba(140,138,135,', 0.12);
  }

  // Rays from two young craters, drawn before the craters so the craters sit on top.
  const RAYED = [[0.42, 0.8, 9], [0.7, 0.22, 6]];
  for (const [rx, ry, rr] of RAYED) {
    const x = rx * S, y = ry * S;
    for (let i = 0; i < 14; i++) {
      const a = rand() * 6.28, len = 60 + rand() * 140;
      const grad = g.createLinearGradient(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
      grad.addColorStop(0, 'rgba(250,248,240,0.35)');
      grad.addColorStop(1, 'rgba(250,248,240,0)');
      g.strokeStyle = grad;
      g.lineWidth = 1.5 + rand() * 3;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    crater(g, x, y, rr);
  }

  for (let i = 0; i < 110; i++) {
    const r = 3 + 34 * rand() ** 3;
    // Spread evenly over the disc (sqrt makes the density uniform per area).
    const a = rand() * 6.28, d = Math.sqrt(rand()) * (C - r - 4);
    crater(g, C + Math.cos(a) * d, C + Math.sin(a) * d, r);
  }

  // Limb darkening.
  const limb = g.createRadialGradient(C, C, C * 0.55, C, C, C);
  limb.addColorStop(0, 'rgba(40,40,60,0)');
  limb.addColorStop(1, 'rgba(40,40,60,0.4)');
  g.fillStyle = limb;
  g.fillRect(0, 0, S, S);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// One crater at (x, y), lit from the upper left.
function crater(g, x, y, r) {
  // Floor: a little darker than the ground round it.
  g.fillStyle = 'rgba(120,118,115,0.28)';
  g.beginPath();
  g.arc(x, y, r * 0.85, 0, Math.PI * 2);
  g.fill();
  // Rim: a gradient across the crater along the light's direction. The upper-left
  // wall faces away from the light and is in shadow; the lower-right wall catches it.
  const k = r * 0.7;
  const grad = g.createLinearGradient(x - k, y - k, x + k, y + k);
  grad.addColorStop(0, 'rgba(70,68,72,0.75)');
  grad.addColorStop(0.5, 'rgba(160,158,150,0.2)');
  grad.addColorStop(1, 'rgba(255,253,245,0.8)');
  g.strokeStyle = grad;
  g.lineWidth = Math.max(1.2, r * 0.22);
  g.beginPath();
  g.arc(x, y, r * 0.88, 0, Math.PI * 2);
  g.stroke();
  // A thin outer lip, brighter on the side facing the light.
  const lip = g.createLinearGradient(x - r, y - r, x + r, y + r);
  lip.addColorStop(0, 'rgba(255,253,245,0.45)');
  lip.addColorStop(1, 'rgba(90,88,90,0.3)');
  g.strokeStyle = lip;
  g.lineWidth = Math.max(0.8, r * 0.08);
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
}
