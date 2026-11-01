import * as THREE from 'three';

// ---- Clock ----
// Animation should depend on elapsed *time*, not on the number of frames drawn:
// a 144 Hz monitor draws more than twice as many frames as a 60 Hz one. Each frame
// animate() asks this clock for the time since the last frame (`dt`, "delta time")
// and every update scales its motion by it, e.g. `x += speed * dt`.
// There is exactly one clock, so everything agrees on what "now" is.
export const clock = new THREE.Clock();
