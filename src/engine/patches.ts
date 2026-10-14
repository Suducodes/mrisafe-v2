import * as THREE from 'three';

/**
 * Shader patches shared by every material in the scene, composed in one onBeforeCompile so the
 * pieces never fight:
 *  - baked:  the lightmap is the diffuse light; the environment's diffuse term is scaled by a global
 *            (0 in the suite, where the bake already contains it; up in the studio, where it is not)
 *  - nano:   the nanotech dissolve. A front sweeps out from an origin across the surface in
 *            hexagonal tiles; tiles behind it are gone (or not yet formed), and the seam glows.
 * Uniform objects are shared by reference, so one value drives every material that uses it.
 */
export const GLOBAL = {
  uIblDiffuse: { value: 0 },          // 0..1: environment diffuse for baked materials
  uLightmapScale: { value: 1 },       // 0..1: how much of the baked light to keep
};

export interface NanoUniforms {
  uNanoActive: { value: number };     // 0 at rest (no cost, no glow)
  uNanoMode: { value: number };       // 1 dissolving away, 0 forming
  uNanoProgress: { value: number };   // 0..1
  uNanoOrigin: { value: THREE.Vector3 };
  uNanoSpan: { value: number };       // distance the front travels (farthest point + jitter + seam)
  uNanoScale: { value: number };      // hex tiles per metre
  uNanoEdge: { value: number };       // seam width, metres
  uNanoJitter: { value: number };     // per-tile spread of the front, metres
  uNanoColor: { value: THREE.Color };
}

export function nanoUniforms(tileMetres = 0.05): NanoUniforms {
  return {
    uNanoActive: { value: 0 }, uNanoMode: { value: 1 }, uNanoProgress: { value: 0 },
    uNanoOrigin: { value: new THREE.Vector3() }, uNanoSpan: { value: 3 },
    uNanoScale: { value: 1 / tileMetres }, uNanoEdge: { value: tileMetres * 1.3 }, uNanoJitter: { value: tileMetres * 2.5 },
    uNanoColor: { value: new THREE.Color(0.32, 0.82, 1.0).multiplyScalar(13) },   // HDR: clears the suite's bloom threshold
  };
}

const IBL_DIFFUSE = 'iblIrradiance += getIBLIrradiance( geometryNormal );';
const LM_LINE = 'vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;';
if (!THREE.ShaderChunk.lights_fragment_maps.includes(IBL_DIFFUSE) || !THREE.ShaderChunk.lights_fragment_maps.includes(LM_LINE)) {
  console.warn('[patches] three.js shader chunk changed; baked lighting patch may not apply');
}
const LIGHTS_MAPS_BAKED = THREE.ShaderChunk.lights_fragment_maps
  .replace(IBL_DIFFUSE, 'iblIrradiance += uIblDiffuse * getIBLIrradiance( geometryNormal );')
  .replace(LM_LINE, 'vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity * uLightmapScale;');

const NANO_COMMON = /* glsl */ `
varying vec3 vNanoPos;
varying vec3 vNanoNrm;
uniform float uNanoActive, uNanoMode, uNanoProgress, uNanoSpan, uNanoScale, uNanoEdge, uNanoJitter;
uniform vec3 uNanoOrigin, uNanoColor;
float nanoHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// hexagonal tiling: xy = tile id, z = distance to the tile edge (0 at the edge, 0.5 at the centre)
vec3 nanoHex(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hc.xy * s, p - (hc.zw + 0.5) * s);
  bool first = dot(h.xy, h.xy) < dot(h.zw, h.zw);
  vec2 gv = first ? h.xy : h.zw;
  vec2 id = first ? hc.xy : hc.zw + 0.5;
  vec2 a = abs(gv);
  return vec3(id, 0.5 - max(dot(a, s * 0.5), a.x));
}
float nanoGlow = 0.0;
float nanoBand = 0.0;
`;

const NANO_FRAGMENT = /* glsl */ `
if (uNanoActive > 0.5) {
  vec3 an = abs(vNanoNrm);
  vec2 p2 = (an.x > an.y && an.x > an.z) ? vNanoPos.yz : (an.y > an.z ? vNanoPos.xz : vNanoPos.xy);
  vec3 hex = nanoHex(p2 * uNanoScale);
  float e = length(vNanoPos - uNanoOrigin) + nanoHash(hex.xy) * uNanoJitter - uNanoProgress * uNanoSpan;
  if (uNanoMode > 0.5 ? e < 0.0 : e > 0.0) discard;
  float band = 1.0 - smoothstep(0.0, uNanoEdge, abs(e));
  nanoBand = 1.0 - smoothstep(0.0, uNanoEdge * 2.5, abs(e));     // plates near the front turn dark metal
  // thin lit seams around each plate, faces barely lit: the plates read as hardware, not as fog
  float rim = 1.0 - smoothstep(0.008, 0.05, hex.z);
  nanoGlow = band * band * (0.08 + 0.92 * rim);
}
`;

export interface PatchOptions {
  baked?: boolean;
  nano?: NanoUniforms | null;
  /** further edits applied after the shared patches (e.g. the section-cap hatch) */
  extra?: (shader: THREE.WebGLProgramParametersWithUniforms) => void;
  key?: string;
}

/**
 * Compose the patches on a material (Standard/Physical, or Basic for caps and screens).
 *
 * The dissolve code is compiled in only while the material is "live" (`setNanoLive`): a shader that
 * can `discard` turns off early depth rejection, and then every hidden layer nested inside the covers
 * is fully shaded every frame. At rest the lean program runs; both variants stay cached on the
 * material (three keeps one program per cache key), so switching never recompiles. The live flag is
 * read from the material the hooks are called on, so clones that borrow these hooks keep working.
 */
export function patchMaterial(m: THREE.Material, opts: PatchOptions & { live?: boolean }) {
  const baked = !!opts.baked, nano = opts.nano ?? null;
  m.userData.patch = { baked, nano: !!nano };
  m.userData.nanoLive = !!opts.live;
  const isStandard = (m as THREE.MeshStandardMaterial).isMeshStandardMaterial;
  m.onBeforeCompile = function (this: THREE.Material, shader) {
    if (baked && isStandard) {
      Object.assign(shader.uniforms, GLOBAL);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uIblDiffuse, uLightmapScale;')
        .replace('#include <lights_fragment_maps>', LIGHTS_MAPS_BAKED);
    }
    if (nano) Object.assign(shader.uniforms, nano);   // always: the uniform set must cover both variants
    if (nano && this.userData.nanoLive) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vNanoPos;\nvarying vec3 vNanoNrm;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvNanoPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvNanoNrm = normalize(mat3(modelMatrix) * normal);');   // the attribute: Basic materials have no objectNormal
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + NANO_COMMON)
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + NANO_FRAGMENT)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - 0.82 * nanoBand;');
      if (isStandard) shader.fragmentShader = shader.fragmentShader
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uNanoColor * nanoGlow;');
      else shader.fragmentShader = shader.fragmentShader
        .replace('#include <opaque_fragment>', 'outgoingLight += uNanoColor * nanoGlow;\n#include <opaque_fragment>');
    }
    opts.extra?.(shader);
  };
  m.customProgramCacheKey = function (this: THREE.Material) {
    return `patch:${baked ? 'b' : ''}${nano && this.userData.nanoLive ? 'n' : ''}:${opts.key ?? ''}`;
  };
  m.needsUpdate = true;
  return m;
}

/** Switch a patched material between its lean (at rest) and live (dissolving / sectioned) program. */
export function setNanoLive(m: THREE.Material, live: boolean) {
  if (!m.userData.patch?.nano || !!m.userData.nanoLive === live) return;
  m.userData.nanoLive = live;
  m.needsUpdate = true;
}
