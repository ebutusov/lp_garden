import * as THREE from 'three';
import { POND_R } from '../core/layout.js';

// ---- Pond water: a lit material with custom shader code patched in ----
// Writing a whole ShaderMaterial (like the sky) means redoing lighting, fog and
// shadows by hand. Instead this starts from MeshStandardMaterial and, just before
// three compiles it, splices a few lines of GLSL into its shaders (onBeforeCompile).
// The sun, the lanterns' lights and the fog all keep working, and the water adds:
//  - waves: the vertex shader lifts each vertex by a sum of sine waves. With flat
//    shading every facet tilts as the waves pass, so the sun and lanterns glint off
//    them, the low-poly way;
//  - a mirror reflection of everything above the water (see "Planar reflection" below),
//    broken up a little by the tilt of each facet;
//  - the Fresnel effect: water is clear looking straight down and a mirror at a
//    grazing angle;
//  - a lighter, less transparent band of shallows along the rim;
//  - a round edge: the mesh is a square grid, and pixels beyond the pond's radius are
//    thrown away (discard). The ragged cut is hidden under the stone rim.
//
// The shader code here goes in as plain strings, replacing #include lines. Each
// #include <name> pulls in one of three's shader "chunks"; their names are stable
// within a three version (r160 here).

const WAVE_GLSL = /* glsl */`
  uniform float uTime;
  uniform mat4 uMirrorMatrix;
  varying vec2 vPondPos;
  varying vec4 vMirrorCoord;
  // Height of the water at pond-local (x, z): three sine waves in different directions,
  // lengths and speeds, so the pattern never visibly repeats. About ±0.035 at most.
  float waveHeight(vec2 p) {
    return 0.016 * sin(dot(p, vec2(0.80, 0.60)) * 1.7 + uTime * 1.3)
         + 0.012 * sin(dot(p, vec2(-0.45, 0.89)) * 2.4 + uTime * 1.9)
         + 0.007 * sin(dot(p, vec2(0.96, -0.28)) * 3.9 + uTime * 2.7);
  }
`;

export function makeWaterMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x2f8ea0, roughness: 0.12, metalness: 0.1, flatShading: true, transparent: true,
  });
  // Shared with the shader, so changing .value here (every frame) reaches the GPU.
  const uniforms = {
    uTime: { value: 0 },
    uMirror: { value: null },                    // the reflection texture
    uMirrorMatrix: { value: new THREE.Matrix4() }, // water vertex → place in that texture
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + WAVE_GLSL)
      // `transformed` is the vertex position the rest of three's code goes on to use
      // (for the screen position, lighting and fog), so moving it here moves everything.
      .replace('#include <begin_vertex>', /* glsl */`
        #include <begin_vertex>
        vPondPos = position.xz;
        transformed.y += waveHeight(position.xz);
        vMirrorCoord = uMirrorMatrix * vec4(transformed, 1.0);
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        uniform sampler2D uMirror;
        varying vec2 vPondPos;
        varying vec4 vMirrorCoord;
      `)
      .replace('#include <clipping_planes_fragment>', /* glsl */`
        #include <clipping_planes_fragment>
        float pondR = length(vPondPos);
        if (pondR > ${POND_R.toFixed(2)}) discard;
      `)
      // Runs after lighting (outgoingLight is the lit colour) and before fog.
      .replace('#include <opaque_fragment>', /* glsl */`
        // vViewPosition points from the camera to this point, in view space, and
        // \`normal\` is the facet's normal (flat shading: one per triangle).
        vec3 toEye = normalize(vViewPosition);
        float facing = clamp(dot(normal, toEye), 0.0, 1.0); // 1 = looking straight down
        // Schlick's approximation of Fresnel reflectance, softened (power 3, not 5) for
        // a stylised look: reflections build up well before the angle gets shallow.
        float fresnel = 0.05 + 0.95 * pow(1.0 - facing, 3.0);
        // The mirror image. vMirrorCoord is a "projective" coordinate: dividing by its w
        // (texture2DProj does that) gives the spot in the reflection texture. Each facet's
        // tilt (its normal turned back into world space: multiplying a vector by
        // viewMatrix from the left applies the inverse rotation) nudges that spot, so the
        // reflection breaks into facets as the waves pass.
        vec3 worldNormal = (vec4(normal, 0.0) * viewMatrix).xyz;
        vec4 mirrorCoord = vMirrorCoord;
        mirrorCoord.xy += worldNormal.xz * 0.35 * mirrorCoord.w;
        vec3 mirror = texture2DProj(uMirror, mirrorCoord).rgb;
        outgoingLight = mix(outgoingLight, mirror, fresnel * 0.85);
        // Shallows along the rim: paler, and harder to see through.
        float shore = smoothstep(${(POND_R - 1.4).toFixed(2)}, ${(POND_R - 0.3).toFixed(2)}, pondR);
        outgoingLight = mix(outgoingLight, outgoingLight * 1.6 + vec3(0.04, 0.06, 0.06), shore * 0.5);
        // Clear from above, opaque at a glance.
        diffuseColor.a = mix(0.42, 0.95, max(fresnel, shore * 0.6));
        #include <opaque_fragment>
      `);
  };

  return { material, uniforms };
}

// ---- Planar reflection: the "virtual camera" trick ----
// A flat mirror shows the world as seen by a camera reflected through the mirror's
// plane: the same distance below the water as the real camera is above it, looking up
// at the mirrored angle. So, every frame, just before the water is drawn:
//  1. place a virtual camera at the real camera's mirror image;
//  2. render the scene from it into an off-screen texture (a render target), with the
//     water itself hidden and everything below the surface clipped away;
//  3. the water's shader then looks up, for each of its pixels, the matching spot in
//     that texture.
// This is what three's Reflector addon does; it's spelt out here to show the steps,
// and so the result can feed a lit, wavy material instead of a plain mirror.
// It costs a second render of the scene, at half resolution, and only while the water
// is on screen: three calls onBeforeRender only for objects that will be drawn.
const UP = new THREE.Vector3(0, 1, 0);
// Render-target pixels per screen pixel. Half is plenty under the waves' distortion.
const MIRROR_SCALE = 0.5;

export function addMirror(mesh, uniforms) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  uniforms.uMirror.value = target.texture;
  const virtualCamera = new THREE.PerspectiveCamera();
  const planePos = new THREE.Vector3(), camPos = new THREE.Vector3();
  const lookAt = new THREE.Vector3(), rotation = new THREE.Matrix4();
  const plane = new THREE.Plane(), clipPlane = new THREE.Vector4(), q = new THREE.Vector4();
  const size = new THREE.Vector2();
  // Maps clip space (-1…1) to texture space (0…1).
  const toTexture = new THREE.Matrix4().set(
    0.5, 0, 0, 0.5,
    0, 0.5, 0, 0.5,
    0, 0, 0.5, 0.5,
    0, 0, 0, 1,
  );

  mesh.onBeforeRender = (renderer, scene, camera) => {
    // Keep the texture in step with the screen size.
    renderer.getDrawingBufferSize(size).multiplyScalar(MIRROR_SCALE).floor();
    if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y);

    planePos.setFromMatrixPosition(mesh.matrixWorld); // a point on the water plane
    camPos.setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y < planePos.y) return; // under the surface: nothing to mirror

    // 1. Mirror the camera's position, and the point it looks at, through the plane
    //    (the plane is horizontal, so mirroring just flips the height about it).
    virtualCamera.position.set(camPos.x, 2 * planePos.y - camPos.y, camPos.z);
    rotation.extractRotation(camera.matrixWorld);
    lookAt.set(0, 0, -1).applyMatrix4(rotation).add(camPos); // a point straight ahead
    lookAt.y = 2 * planePos.y - lookAt.y;
    virtualCamera.up.set(0, 1, 0).applyMatrix4(rotation).reflect(UP);
    virtualCamera.lookAt(lookAt);
    virtualCamera.far = camera.far;
    virtualCamera.updateMatrixWorld();
    virtualCamera.projectionMatrix.copy(camera.projectionMatrix);

    // Where each water vertex lands in the texture: through the virtual camera's
    // view and projection, then into 0…1. The shader multiplies its vertices by this.
    uniforms.uMirrorMatrix.value.copy(toTexture)
      .multiply(virtualCamera.projectionMatrix)
      .multiply(virtualCamera.matrixWorldInverse)
      .multiply(mesh.matrixWorld);

    // 2a. Oblique near plane. The virtual camera sits under the water, so the koi and
    //     the pond floor are right in front of it. Tilting its near clipping plane to
    //     lie along the water surface clips away everything below the surface for free
    //     (Lengyel's technique: rewrite the projection matrix's third row).
    plane.setFromNormalAndCoplanarPoint(UP, planePos).applyMatrix4(virtualCamera.matrixWorldInverse);
    clipPlane.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const p = virtualCamera.projectionMatrix.elements;
    q.set(
      (Math.sign(clipPlane.x) + p[8]) / p[0],
      (Math.sign(clipPlane.y) + p[9]) / p[5],
      -1,
      (1 + p[10]) / p[14],
    );
    clipPlane.multiplyScalar(2 / clipPlane.dot(q));
    p[2] = clipPlane.x;
    p[6] = clipPlane.y;
    p[10] = clipPlane.z + 1 - 0.003; // a small bias keeps the waterline itself out
    p[14] = clipPlane.w;

    // 2b. Render into the texture. This happens in the middle of the main render, so
    //     everything changed here is put back afterwards. Shadows are reused, not redrawn.
    mesh.visible = false; // the water mustn't reflect itself
    const prevTarget = renderer.getRenderTarget();
    const prevShadowUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(target);
    renderer.state.buffers.depth.setMask(true);
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, virtualCamera);
    renderer.shadowMap.autoUpdate = prevShadowUpdate;
    renderer.setRenderTarget(prevTarget);
    mesh.visible = true;
  };
}

// A square grid wide enough to cover the pond, lying flat. Its inner vertices are
// nudged by a fixed pattern (not rand(), which would shift the garden's layout), so
// the facets come out as uneven triangles rather than a regular grid.
export function makeWaterGeometry() {
  const size = POND_R * 2 + 1, segs = 22;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, cell = size / segs;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setXYZ(i,
      x + Math.sin(x * 12.9898 + z * 78.233) * 0.3 * cell,
      0,
      z + Math.sin(x * 39.346 + z * 11.135) * 0.3 * cell);
  }
  return geo;
}
