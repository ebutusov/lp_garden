import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { scene } from './scene.js';
import { camera } from './camera.js';

// ---- Renderer + post-processing (bloom) ----
// The WebGLRenderer turns the scene graph into GPU draw calls on a <canvas>.
export const renderer = new THREE.WebGLRenderer({ antialias: true });
// High-DPI screens have 2–3 device pixels per CSS pixel. Rendering at full density
// costs pixels² of fill rate, so cap it at 2.
export const pixelRatio = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
// Shadow maps: each shadow-casting light renders the scene's depth from its own point
// of view into a texture. When shading a pixel, the GPU compares its distance to the
// light with that texture to decide whether something else is in the way.
// PCF ("percentage-closer filtering") samples several neighbours for softer edges.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Lighting maths happens in linear colour space; the screen expects sRGB. The final
// output is converted so mid-tones look right.
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);

// Post-processing: instead of drawing straight to the screen, the scene is rendered
// into an off-screen texture, then full-screen "passes" (each a shader over every
// pixel) transform it. The EffectComposer chains these passes.
// The render target is half-float, so values brighter than 1.0 survive for the bloom
// pass to find. It is also multisampled, which keeps the antialiasing the composer
// would otherwise lose.
export const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(
  window.innerWidth * pixelRatio, window.innerHeight * pixelRatio,
  { type: THREE.HalfFloatType, samples: 4 }
));
composer.setPixelRatio(pixelRatio);
composer.setSize(window.innerWidth, window.innerHeight);
// 1. Draw the scene as usual.
composer.addPass(new RenderPass(scene, camera));
// 2. Bloom: pixels brighter than `threshold` are blurred and added back on top, so
//    lanterns and fireflies seem to glow. Arguments: resolution, strength, radius,
//    threshold. Day/night changes strength and threshold (see dayNight.js).
export const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.12, 0.5, 1.1);
composer.addPass(bloom);
// 3. Tone mapping and the linear → sRGB conversion, as the renderer would do itself
//    when drawing straight to the screen.
composer.addPass(new OutputPass());
