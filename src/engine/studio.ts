import * as THREE from 'three';
import type { Stage } from './stage';
import { GLOBAL } from './patches';

/**
 * The Learn environment: the room falls away and the scanner stands in a vast dark exhibition
 * space. A graphite floor runs to a fogged horizon under a faint technical grid, a soft contact
 * shadow grounds the machine, a key light and two rims model it, and a softbox environment gives
 * the covers long product-shot highlights. Crossfades with the suite rig (baked room light).
 */
const SUITE = { ev: -2.1, bloom: 9.0, lightmap: 1.0, ibl: 0.0, fog: 0.0 };      // calmer than the bake's own exposure; only nano glow blooms
const STUDIO = { ev: -1.0, bloom: 5.0, lightmap: 0.3, ibl: 1.0, fog: 0.028 };

function softboxEnvironment(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  // a dim graded cyclorama, not black: polished steel (the vacuum vessel) needs something to mirror
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      varying vec3 vP;
      void main() {
        float h = normalize(vP).y;
        vec3 c = h < 0.0 ? mix(vec3(0.16, 0.18, 0.19), vec3(0.025, 0.028, 0.03), smoothstep(0.0, -0.35, h))
                         : mix(vec3(0.16, 0.18, 0.19), vec3(0.05, 0.055, 0.06), smoothstep(0.0, 0.7, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  })));
  const box = (w: number, h: number, pos: [number, number, number], look: [number, number, number], k: number, tint = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); scene.add(m);
  };
  box(9, 2.2, [0, 8, 1], [0, 0, 0], 5.0);                // long overhead strip
  box(2.6, 7, [-9, 4, 2], [0, 1, 0], 1.8, 0xd8e8ff);    // cool side strip
  box(2.6, 6, [8, 3.5, -5], [0, 1, 0], 2.4, 0xfff0e0);  // warm back rim
  box(5, 4, [9, 2.5, 6], [0, 1, 0], 0.9);               // broad front-right fill (the key side)
  box(14, 1.2, [0, 0.6, 12], [0, 1, 0], 0.5);           // low front bounce
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  return tex;
}

function sky() {
  return new THREE.Mesh(new THREE.SphereGeometry(90, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      varying vec3 vP;
      void main() {
        float h = normalize(vP).y;
        vec3 floorC = vec3(0.028, 0.034, 0.038), horizon = vec3(0.060, 0.074, 0.082), top = vec3(0.020, 0.025, 0.030);
        vec3 c = h < 0.0 ? mix(horizon, floorC, smoothstep(0.0, -0.25, h)) : mix(horizon, top, smoothstep(0.0, 0.6, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
}

function grid() {
  return new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    vertexShader: 'varying vec2 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `
      varying vec2 vW;
      float line(vec2 p, float step) { vec2 g = abs(fract(p / step - 0.5) - 0.5) * step / fwidth(p); return 1.0 - min(min(g.x, g.y), 1.0); }
      void main() {
        float r = length(vW);
        float fade = 1.0 - smoothstep(5.0, 32.0, r);
        float a = (line(vW, 0.5) * 0.07 + line(vW, 5.0) * 0.16) * fade;
        gl_FragColor = vec4(0.55, 0.68, 0.74, a);
      }`,
  }));
}

/** Soft shadow footprints of the gantry and the table, blurred once on a canvas. */
function contactShadow() {
  const S = 512, SIZE = 9;                       // texture covers 9 x 9 m around the scanner
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  const px = (m: number) => (m / SIZE) * S;
  const at = (x: number, z: number) => [S / 2 + px(x), S / 2 + px(z)];
  g.filter = 'blur(16px)';
  g.fillStyle = 'rgba(0,0,0,0.85)';
  const rect = (x: number, z: number, w: number, d: number) => { const [cx, cz] = at(x, z); g.fillRect(cx - px(w) / 2, cz - px(d) / 2, px(w), px(d)); };
  rect(0, 0, 2.15, 1.75);                         // gantry
  rect(0, 1.93, 0.62, 1.7);                       // table pedestal
  g.filter = 'blur(42px)'; g.fillStyle = 'rgba(0,0,0,0.45)';
  rect(0, 0.6, 3.0, 4.2);                         // broad ambient occlusion
  const tex = new THREE.CanvasTexture(c);
  // the canvas alpha is the shadow (map alpha multiplies opacity); colour stays black
  const m = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0x000000 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.002;
  return m;
}

export class Studio {
  readonly group = new THREE.Group();
  private readonly lights: { light: THREE.Light; full: number }[] = [];
  private readonly env: THREE.Texture;
  private k = 0;
  private target = 0;
  private readonly fog = new THREE.FogExp2(0x0d1113, 0);

  constructor(private readonly stage: Stage, private readonly probe: THREE.Texture | null) {
    this.env = softboxEnvironment(stage.renderer);
    stage.scene.fog = this.fog;                      // always present (density animates) so nothing recompiles
    const floor = new THREE.Mesh(new THREE.CircleGeometry(80, 128), new THREE.MeshStandardMaterial({ color: 0x15191b, roughness: 0.55, metalness: 0, envMapIntensity: 0.16 }));   // satin: no mirror of the overhead softbox
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004;
    const gridMesh = grid(); gridMesh.rotation.x = -Math.PI / 2; gridMesh.position.y = 0.0;
    this.group.add(sky(), floor, gridMesh, contactShadow());
    // the lights stay in the scene at all times (at zero in the suite): hiding them would change the
    // light count, and every lit material in the scene would recompile at each crossfade
    const rig = new THREE.Group();
    const spot = (color: number, full: number, pos: [number, number, number], angle: number) => {
      const s = new THREE.SpotLight(color, 0, 30, angle, 0.75, 1.6);
      s.position.set(...pos); s.target.position.set(0, 1.0, 0.3);
      rig.add(s, s.target); this.lights.push({ light: s, full });
    };
    spot(0xfff2e6, 85, [4.6, 6.8, 5.6], 0.62);       // key, front right, high (soft: no hot spot on the floor)
    spot(0xcfe2ff, 120, [-5.2, 4.2, -4.8], 0.6);     // cool rim, back left
    spot(0xffe6cc, 70, [5.4, 3.0, -4.6], 0.6);       // warm rim, back right
    const hemi = new THREE.HemisphereLight(0xa9bcc8, 0x0a0c0d, 0); rig.add(hemi); this.lights.push({ light: hemi, full: 0.35 });
    this.group.visible = false;
    stage.scene.add(this.group, rig);
    stage.onFrame((dt) => this.tick(dt));
    this.apply();
  }

  /** true: the Learn studio. false: the real suite. */
  set(studio: boolean) { this.target = studio ? 1 : 0; }
  get active() { return this.target === 1; }

  private tick(dt: number) {
    if (this.k === this.target) return;
    this.k = THREE.MathUtils.clamp(this.k + Math.sign(this.target - this.k) * dt / 2.2, 0, 1);
    this.apply();
  }

  private apply() {
    const k = this.k * this.k * (3 - 2 * this.k);
    const mix = (a: number, b: number) => a + (b - a) * k;
    this.group.visible = k > 0.001;
    for (const { light, full } of this.lights) light.intensity = full * k;
    GLOBAL.uLightmapScale.value = mix(SUITE.lightmap, STUDIO.lightmap);
    GLOBAL.uIblDiffuse.value = mix(SUITE.ibl, STUDIO.ibl);
    this.stage.exposureEV = mix(SUITE.ev, STUDIO.ev);
    this.stage.bloom.threshold = mix(SUITE.bloom, STUDIO.bloom);
    this.fog.density = mix(SUITE.fog, STUDIO.fog);
    this.stage.controls.maxDistance = mix(9, 24);
    this.stage.scene.environment = k > 0.5 ? this.env : (this.probe ?? this.env);
  }
}
