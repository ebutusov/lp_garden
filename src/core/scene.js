import * as THREE from 'three';

// ---- Scene ----
// A Three.js Scene is the root of a tree of objects, the "scene graph". Every object
// (mesh, light, group, camera) has a position, rotation and scale relative to its
// parent. Moving a parent carries all its children along, which is how a tree's crown
// sways as one piece or a dog's leg swings from its hip. Each frame the renderer walks
// this tree, multiplies the transforms together into world space, and draws what the
// camera sees.
export const scene = new THREE.Scene();

// Linear fog blends every fogged material toward one colour, from none at 35 units
// to full at 150. It gives a sense of depth and hides the edge of the world. The
// background is set to the same colour, so distant things melt into the horizon.
export const fog = new THREE.Fog(0xd6e7ee, 35, 150);
scene.fog = fog;
scene.background = fog.color.clone();
