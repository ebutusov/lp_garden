// ---- Seeded randomness ----
// The garden is laid out procedurally (code decides where trees, rocks and flowers
// go), but from a *seeded* pseudo-random number generator (PRNG) instead of
// Math.random. A PRNG is a small deterministic function: started from the same seed
// it always produces the same sequence of numbers, so the garden looks identical on
// every visit. Purely visual effects (petals, ripples, fireflies, the animals'
// wandering) still use Math.random, since nobody notices if those differ.
//
// main.js makes ONE generator from SEED and hands it to everything that places
// things (see garden.js). Because every placement draws from that one shared sequence,
// the ORDER in which they call rand() decides the layout, so garden.js builds the
// garden in a fixed order.

export const SEED = 123;

// mulberry32: a tiny, fast 32-bit PRNG. It returns a function, rand(), that carries
// its own state in a closure, so two generators made from the same seed are
// independent but produce identical sequences. Each call advances the state, scrambles it
// with integer multiplies and xor-shifts, and maps the result into [0, 1).
export function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
