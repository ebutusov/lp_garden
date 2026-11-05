// ---- Shared mutable state ----
// A module can export a `let`, but importers may only read it, never assign to it.
// Values that several modules change are therefore kept as properties of exported
// objects, which any importer can modify.

// Day/night. `nightMix` fades from 0 (day) to 1 (night); anything with a night look reads it.
// Rain works the same way: `isRaining` is the switch, `rainMix` fades 0 (clear) → 1 (rain).
export const env = {
  isNight: false,
  nightMix: 0,
  isRaining: false,
  rainMix: 0,
};

// The player's aim and movement mode.
export const player = {
  yaw: 0,           // turn left/right: radians around the world's vertical (Y) axis
  pitch: 0,         // look up/down: radians around the camera's sideways (X) axis
  flyMode: false,   // free 6-degrees-of-freedom flight instead of walking
  verticalVel: 0,   // units/sec, for jumping and falling
  onGround: true,
};
