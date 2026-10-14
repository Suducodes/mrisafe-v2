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
/** The quarter section: fragments with x > uCut.x and y > uCut.y are cut away (live programs only).
 *  Done here rather than with three.js clipping planes so every program's key is known up front. */
export const CUT = { uCut: { value: new THREE.Vector2(100, 100) } };

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
  uNanoCut: { value: number };        // 1: this layer is opened by the quarter section
}

export function nanoUniforms(tileMetres = 0.05): NanoUniforms {
  return {
    uNanoActive: { value: 0 }, uNanoMode: { value: 1 }, uNanoProgress: { value: 0 },
    uNanoOrigin: { value: new THREE.Vector3() }, uNanoSpan: { value: 3 },
    uNanoScale: { value: 1 / tileMetres }, uNanoEdge: { value: tileMetres * 1.3 }, uNanoJitter: { value: tileMetres * 2.5 },
    uNanoColor: { value: new THREE.Color(0.32, 0.82, 1.0).multiplyScalar(13) },   // HDR: clears the suite's bloom threshold
    uNanoCut: { value: 0 },
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
uniform float uNanoActive, uNanoMode, uNanoProgress, uNanoSpan, uNanoScale, uNanoEdge, uNanoJitter, uNanoCut;
uniform vec3 uNanoOrigin, uNanoColor;
uniform vec2 uCut;
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
if (uNanoCut > 0.5 && vNanoPos.x > uCut.x && vNanoPos.y > uCut.y) discard;
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

/**
 * Surface detail, procedural and in world space (no UVs, nothing to download): the texture a real
 * surface has at arm's length. Each family is modelled on the real finish. Every pattern fades out
 * once a pixel covers more than its feature size, so close up it is crisp and far away it never
 * shimmers. 0 = none.
 */
export const DETAIL = { none: 0, vinyl: 1, paint: 2, tile: 3, brushed: 4, copper: 5, oak: 6, fabric: 7, coat: 8 } as const;

/**
 * Tiling noise, computed once: R = fBm (lattice 8 per tile, four octaves), G and B = independent
 * smooth value noise (lattice 16 per tile). One texture read replaces a dozen hash evaluations
 * (8 ms a frame on Intel UHD), and its mipmaps antialias the pattern at a distance for free.
 */
let noiseTex: THREE.DataTexture | null = null;
export function detailNoise() {
  if (noiseTex) return noiseTex;
  const N = 256, data = new Uint8Array(N * N * 4);
  let s = 0x9e3779b9;
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const lattice = (L: number) => Float32Array.from({ length: L * L }, rnd);
  const smooth = (g: Float32Array, L: number, x: number, y: number) => {
    const fx = x * L, fy = y * L, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (i: number, j: number) => g[((j % L) + L) % L * L + ((i % L) + L) % L];
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
  const oct = [8, 16, 32, 64].map((L) => [L, lattice(L)] as const), g16 = lattice(16), b16 = lattice(16);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i / N, y = j / N;
    let f = 0, w = 0.5;
    for (const [L, g] of oct) { f += w * smooth(g, L, x, y); w *= 0.5; }
    const k = (j * N + i) * 4;
    data[k] = Math.round((f / 0.9375) * 255); data[k + 1] = Math.round(smooth(g16, 16, x, y) * 255);
    data[k + 2] = Math.round(smooth(b16, 16, x, y) * 255); data[k + 3] = 255;
  }
  noiseTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter; noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true; noiseTex.anisotropy = 8;
  noiseTex.colorSpace = THREE.NoColorSpace; noiseTex.needsUpdate = true;
  return noiseTex;
}

const DETAIL_COMMON = /* glsl */ `
varying vec3 vDetPos;
varying vec3 vDetNrm;
uniform float uDetail;
uniform sampler2D uDetailTex;
float detH = 0.0;          // height (metres) for the bump
float detRough = 0.0;      // roughness offset
float dHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// texture noise, lattice spacing 1 in p: fBm and two independent smooth noises (mipmapped: no aliasing)
float nF(vec2 p) { return texture2D(uDetailTex, p * 0.125).r; }
float nG(vec2 p) { return texture2D(uDetailTex, p * 0.0625).g; }
float nB(vec2 p) { return texture2D(uDetailTex, p * 0.0625).b; }
// 1 while a pixel is much smaller than the feature, 0 once it covers it
float dFade(float feature, float px) { return 1.0 - smoothstep(feature * 0.5, feature * 1.5, px); }
vec3 detailColor(vec3 base) {
  vec3 an = abs(vDetNrm);
  vec2 p = (an.x > an.y && an.x > an.z) ? vDetPos.zy : (an.y > an.z ? vDetPos.xz : vDetPos.xy);
  float px = length(fwidth(p));
  vec3 c = base;
  if (uDetail < 1.5) {                                   // sheet vinyl: chips, mottle, welded seams every 2 m
    vec2 cell = floor(p / 0.005);
    float h = dHash(cell), h2 = dHash(cell + 17.0);
    float chip = step(0.84, h) * dFade(0.005, px);
    c *= mix(vec3(1.0), h2 < 0.5 ? vec3(0.58, 0.6, 0.63) : vec3(1.32, 1.3, 1.24), chip);
    float m = nF(p * 1.3);
    c *= 0.86 + 0.28 * m;
    float d = abs(fract(p.x / 2.0 + 0.5) - 0.5) * 2.0;
    float seam = (1.0 - smoothstep(0.0, 0.0035, d)) * dFade(0.0035, px);
    c *= 1.0 - 0.16 * seam;
    detRough = (nG(p * 40.0) - 0.5) * 0.12 + (m - 0.45) * 0.1 - 0.06 * seam;
    detH = chip * 0.00004 - seam * 0.00008;
  } else if (uDetail < 2.5) {                            // eggshell paint: faint mottle, orange peel
    c *= 1.0 + (nF(p * 4.0) - 0.47) * 0.07;
    detH = (nG(p * 520.0) - 0.5) * 0.00006;
    detRough = (nB(p * 9.0) - 0.5) * 0.06;
  } else if (uDetail < 3.5) {                            // mineral fibre tile: pin holes and fissures
    vec2 g = p / 0.006, f = fract(g) - 0.5, id = floor(g);
    vec2 jit = vec2(dHash(id + 3.1), dHash(id + 8.7)) - 0.5;
    float pit = step(0.5, dHash(id)) * (1.0 - smoothstep(0.08, 0.2, length(f - jit * 0.5))) * dFade(0.006, px);
    float fis = (1.0 - smoothstep(0.0, 0.05, abs(nG(p * 80.0) - 0.5))) * dFade(0.012, px);
    c *= (1.0 - 0.32 * pit) * (1.0 - 0.13 * fis) * (0.96 + 0.08 * nF(p * 3.0));
    detH = -(pit + 0.5 * fis) * 0.0004;
    detRough = 0.04;
  } else if (uDetail < 4.5) {                            // brushed metal: fine streaks along one axis
    float s = nG(vec2(p.x * 3.0, p.y * 900.0)), s2 = nB(vec2(p.x * 1.0, p.y * 140.0));
    c *= 1.0 + (s - 0.5) * 0.05 + (s2 - 0.5) * 0.03;
    detRough = (s - 0.5) * 0.16 + (s2 - 0.5) * 0.06;
  } else if (uDetail < 5.5) {                            // rolled copper sheet: rolling marks, oxidised patches
    float s = nG(vec2(p.x * 2.0, p.y * 500.0));
    float o = smoothstep(0.5, 0.82, nF(p * 2.2));
    c = mix(c * (1.0 + (s - 0.5) * 0.06), c * vec3(0.72, 0.56, 0.48), o * 0.45);
    detRough = (s - 0.5) * 0.1 + o * 0.18;
  } else if (uDetail < 6.5) {                            // oak laminate: grain lines along the board
    float w = nF(p * vec2(1.2, 7.0)) * 0.05;
    float g = 0.5 + 0.5 * sin((p.y + w) * 640.0);
    float k = dFade(0.01, px);
    c *= mix(1.0, 0.86 + 0.24 * g * g * g, k);
    c *= 0.94 + 0.12 * nB(p * vec2(0.8, 14.0));
    detH = g * 0.00002 * k;
  } else if (uDetail < 7.5) {                            // woven fabric
    float wv = sin(p.x * 1400.0) * sin(p.y * 1400.0) * dFade(0.0045, px);
    c *= 1.0 + 0.09 * wv;
    detH = wv * 0.00004;
    detRough = 0.04;
  } else {                                               // powder coat, laminate, painted covers: fine orange peel
    detH = (nG(p * 700.0) - 0.5) * 0.000012;
    c *= 1.0 + (nF(p * 6.0) - 0.47) * 0.02;
  }
  return c;
}
// three.js's bump-mapping maths (perturbNormalArb), for a procedural height
vec3 detailBump(vec3 surfPos, vec3 surfNorm, float faceDir) {
  vec2 dH = vec2(dFdx(detH), dFdy(detH));
  vec3 sx = normalize(dFdx(surfPos)), sy = normalize(dFdy(surfPos));
  vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

export interface PatchOptions {
  baked?: boolean;
  nano?: NanoUniforms | null;
  /** surface detail family (DETAIL.*); Standard/Physical only */
  detail?: number;
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
  const detail = { value: opts.detail ?? 0 };
  m.userData.detail = detail.value;
  m.onBeforeCompile = function (this: THREE.Material, shader) {
    if (isStandard) {
      // always compiled in (the family is a uniform), so detail never changes a program's key
      shader.uniforms.uDetail = detail;
      shader.uniforms.uDetailTex = { value: detailNoise() };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vDetPos;\nvarying vec3 vDetNrm;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvDetPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvDetNrm = normalize(mat3(modelMatrix) * objectNormal);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + DETAIL_COMMON)
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (uDetail > 0.5) diffuseColor.rgb = detailColor(diffuseColor.rgb);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + detRough, 0.03, 1.0);')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif (uDetail > 0.5) normal = detailBump(-vViewPosition, normal, faceDirection);');
    }
    if (baked && isStandard) {
      Object.assign(shader.uniforms, GLOBAL);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uIblDiffuse, uLightmapScale;')
        .replace('#include <lights_fragment_maps>', LIGHTS_MAPS_BAKED);
    }
    if (nano) Object.assign(shader.uniforms, nano, CUT);   // always: the uniform set must cover both variants
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
