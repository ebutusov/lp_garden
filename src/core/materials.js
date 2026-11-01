import * as THREE from 'three';

// ---- Materials (flat-shaded low-poly palette) ----
// A material tells the GPU how a surface responds to light. MeshStandardMaterial is
// physically based (PBR): `roughness` 0 is mirror-smooth and 1 fully matte, and
// `metalness` switches between plastic-like and metal-like reflection. `emissive` is
// light the surface gives off itself, unaffected by scene lights.
//
// `flatShading` gives the low-poly look. Normally normals are interpolated across a
// triangle, so a sphere looks smooth. Flat shading uses one normal per face, so every
// facet catches the light differently and the polygons show.
//
// Meshes share these materials instead of each creating its own. Each distinct
// material can mean a GPU program switch, so sharing keeps draw calls cheap, and
// changing one shared material (e.g. glowing paper at night) updates every mesh using it.
export const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({
  color, flatShading: true, ...opts
});

// Paper screen texture: cream paper behind a dark wooden lattice. Textures don't have
// to be image files: here a 2D canvas is drawn on and uploaded to the GPU as-is.
function makeShojiTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f1e1';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#5a4030';
  g.lineWidth = 10;
  g.strokeRect(0, 0, 256, 256);
  g.lineWidth = 4;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke(); }
  for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, i * 256 / 6); g.lineTo(256, i * 256 / 6); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  // Colour textures are authored in sRGB; tagging them lets three convert them to
  // linear space for lighting. (Data textures like normal maps stay linear.)
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const shojiTex = makeShojiTexture();

export const M = {
  grass:   mat(0x8fb05a),
  stone:   mat(0x8f8f8f),
  stoneD:  mat(0x6f6f6a),
  trunk:   mat(0x6b4a37, { roughness: 0.9 }),
  pine:    mat(0x3f6b45),
  pineD:   mat(0x2f5738),
  maple:   mat(0xd24b3d),
  maple2:  mat(0xe88a3a),
  cherry:  [mat(0xf4b6c8), mat(0xf8cfdb), mat(0xe99ab3)],
  cherryTrunk: mat(0x5a3d33, { roughness: 0.9 }),
  // Transparent: the renderer draws it after opaque objects, blending it over
  // whatever is already behind (the pond floor and the koi).
  water:   new THREE.MeshStandardMaterial({
    color: 0x4aa3b8, transparent: true, opacity: 0.5,
    roughness: 0.3, metalness: 0.2, flatShading: true
  }),
  wood:    mat(0x9a5a3a, { roughness: 0.8 }),
  darkWood: mat(0x4a3428, { roughness: 0.85 }),
  bamboo:  mat(0x9bb34a, { roughness: 0.6 }),
  bambooD: mat(0x76883a, { roughness: 0.7 }),
  plaster: mat(0xece6d6, { roughness: 0.95 }),
  tatami:  mat(0xc9c08a, { roughness: 0.95 }),
  roof:    mat(0x3d3f46, { roughness: 0.8 }),
  gravel:  mat(0xe2dbc6, { roughness: 1 }),
  moss:    mat(0x5f7d3a, { roughness: 1 }),
  flower:  mat(0xe06f9a),
  pellet:  mat(0x8a5a2b),
  // Lantern paper glows on its own; at night its emissive intensity rises past the
  // bloom threshold so it halos.
  paper:   mat(0xfff7e8, { emissive: 0xffc870, emissiveIntensity: 0.6, roughness: 0.9 }),
  // The same texture as colour and as emissive map: at night the lit paper glows
  // while the wooden lattice (dark in the texture) stays dark.
  shoji:   new THREE.MeshStandardMaterial({
    map: shojiTex, emissive: 0xffd28a, emissiveMap: shojiTex, emissiveIntensity: 0, roughness: 0.9,
  }),
};
// The path lanterns' paper gets its own material so it can glow less (see dayNight.js).
M.pathPaper = M.paper.clone();
