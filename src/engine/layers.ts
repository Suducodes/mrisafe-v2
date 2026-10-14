import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import type { Stage } from './stage';
import { nanoUniforms, patchMaterial, type NanoUniforms } from './patches';

/** Scanner layers in the order they are built, outside in (bore-side parts last). */
export const SCANNER_LAYERS = [
  'covers', 'coldhead', 'cryostat', 'thermal_shield', 'he_vessel', 'windings',
  'gradient', 'shims', 'rf_shield', 'rf_body_coil', 'liner',
] as const;
/** Everything that is the room rather than the machine (hidden in the Learn studio). */
export const ROOM_LAYERS = ['room_finish', 'rf_cage', 'room_fixtures', 'room_services', 'room_signage', 'control_room', 'zones', 'equipment'];

const CUT_LAYERS = new Set<string>(SCANNER_LAYERS);
const ISO = new THREE.Vector3(0, 1.05, 0);
// hex tile size per layer: fine on the machine, coarse on walls
const TILE: Record<string, number> = { room_finish: 0.12, rf_cage: 0.12, control_room: 0.11, zones: 0.11, room_fixtures: 0.06, room_services: 0.06, room_signage: 0.04, equipment: 0.05 };

interface Anim { mode: 1 | 0; progress: number; dir: 1 | -1; seconds: number }
interface LayerState {
  name: string;
  root: THREE.Object3D;
  materials: THREE.Material[];
  caps: THREE.Mesh[];
  nano: NanoUniforms;
  shown: boolean;
  anim: Anim | null;
  span: number;
  origin: THREE.Vector3;
  particles: THREE.Points | null;
}

/** Hatched section cap: drawn on back faces exposed by the cut, so shells read as solid. */
function capMaterial(color: THREE.Color, planes: THREE.Plane[], nano: NanoUniforms) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, clippingPlanes: planes, clipIntersection: true });
  patchMaterial(m, { nano, extra: (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\n' +
      'float hatch = step(0.82, fract((vNanoPos.x + vNanoPos.y + vNanoPos.z) / 0.022));\n' +
      'diffuseColor.rgb *= 1.0 - 0.34 * hatch;');
  }, key: 'cap' });
  return m;
}

/** Nanobots: points sampled over the layer's surface that stream off (or onto) it as the front passes. */
function particleMaterial(nano: NanoUniforms) {
  return new THREE.ShaderMaterial({
    uniforms: { ...nano, uSize: { value: 26 }, uPixelRatio: { value: Math.min(devicePixelRatio, 2) }, uLife: { value: 0.55 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uNanoActive, uNanoMode, uNanoProgress, uNanoSpan, uSize, uPixelRatio, uLife;
      attribute vec3 aNormal; attribute float aDist; attribute float aSeed;
      varying float vAlpha;
      void main() {
        // dissolving: lives for uLife after the front passes; forming: flies in during the uLife before it
        float front = uNanoProgress * uNanoSpan;
        float k = uNanoMode > 0.5 ? (front - aDist) / uLife : (front + uLife - aDist) / uLife;
        if (uNanoActive < 0.5 || k < 0.0 || k > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        float t = uNanoMode > 0.5 ? k : 1.0 - k;                 // dissolving: leaves; forming: arrives
        vec3 lift = normalize(aNormal + vec3(0.0, 0.7, 0.0));
        vec3 swirl = vec3(sin(aSeed * 41.0 + t * 7.0), 0.0, cos(aSeed * 37.0 + t * 7.0)) * 0.07 * t;
        vec3 p = position + lift * (0.02 + 0.42 * t * t) + swirl;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.45 + aSeed) * uPixelRatio / max(-mv.z, 0.2);
        vAlpha = sin(3.14159 * k) * (1.0 - 0.5 * t);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uNanoColor;
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        gl_FragColor = vec4(uNanoColor * 0.22, 1.0) * pow(1.0 - r, 2.0) * vAlpha;
      }`,
  });
}

export class LayerSystem {
  private readonly states = new Map<string, LayerState>();
  private readonly hiddenObjects = new Map<string, THREE.Object3D>();
  /** Quarter cutaway: removes x > 0 and y > isocentre (both, hence clipIntersection). */
  private readonly planes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 100), new THREE.Plane(new THREE.Vector3(0, -1, 0), 100)];
  private cut = 0;            // 0 closed .. 1 open
  private cutTarget = 0;
  private readonly cutMeshes = new Set<THREE.Object3D>();
  /** Layers kept hidden whatever a chapter asks for (Learn hides the room and the patient). */
  readonly alwaysHidden = new Set<string>();

  constructor(private readonly stage: Stage) {
    stage.scene.updateMatrixWorld(true);
    for (const [name, root] of stage.layers) {
      const nano = nanoUniforms(TILE[name] ?? 0.045);
      const materials: THREE.Material[] = [];
      const caps: THREE.Mesh[] = [];
      const clones = new Map<string, THREE.Material>();
      const cuttable = CUT_LAYERS.has(name);
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || mesh.userData.isCap) return;
        const src = mesh.material as THREE.MeshStandardMaterial;
        let m = clones.get(src.uuid);
        if (!m) {
          m = src.clone();
          if (cuttable) {
            m.side = THREE.FrontSide;                          // closed shells; back faces become caps
            m.clippingPlanes = this.planes; m.clipIntersection = true;
          }
          patchMaterial(m, { baked: !!src.userData.patch?.baked, nano });
          clones.set(src.uuid, m); materials.push(m);
        }
        mesh.material = m;
        if (cuttable) {
          this.cutMeshes.add(mesh);
          const cap = new THREE.Mesh(mesh.geometry, capMaterial(capColour((m as THREE.MeshStandardMaterial).color), this.planes, nano));
          cap.userData.isCap = true; cap.visible = false; cap.raycast = () => {};
          mesh.add(cap); caps.push(cap);
        }
        this.hiddenObjects.set(mesh.name, mesh);
      });
      // the front starts at the layer's upper front corner (scanner) or at the scanner (room)
      const box = new THREE.Box3().setFromObject(root);
      const origin = ROOM_LAYERS.includes(name) ? ISO.clone() : new THREE.Vector3(box.max.x, box.max.y, box.max.z);
      let span = 0;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) span = Math.max(span, origin.distanceTo(new THREE.Vector3(x, y, z)));
      nano.uNanoOrigin.value.copy(origin);
      nano.uNanoSpan.value = span + nano.uNanoJitter.value + nano.uNanoEdge.value;
      this.states.set(name, { name, root, materials, caps, nano, shown: true, anim: null, span: nano.uNanoSpan.value, origin, particles: null });
    }
    stage.onFrame((dt) => this.tick(dt));
  }

  has(name: string) { return this.states.has(name); }

  /** Show exactly the layers not listed; listed layers dissolve away, the rest form back.
   *  `instant` snaps instead (start-up state). */
  setHidden(layers: Iterable<string>, objects: Iterable<string> = [], instant = false) {
    const hide = new Set([...layers, ...this.alwaysHidden]);
    for (const s of this.states.values()) {
      if (!instant) { this.transition(s, !hide.has(s.name)); continue; }
      s.anim = null; s.shown = !hide.has(s.name); s.root.visible = s.shown; s.nano.uNanoActive.value = 0;
    }
    const hideObj = new Set(objects);
    for (const [name, o] of this.hiddenObjects) {
      if (hideObj.has(name)) o.userData.peeled = true;
      else if (o.userData.peeled) { o.userData.peeled = false; o.visible = true; }
    }
    for (const name of hideObj) { const o = this.hiddenObjects.get(name); if (o) o.visible = false; }
  }

  /** True while any layer is dissolving or forming. */
  get busy() { for (const s of this.states.values()) if (s.anim) return true; return false; }

  private transition(s: LayerState, show: boolean) {
    const a = s.anim;
    if (a) {
      // mid-flight: run the same front backwards rather than popping to the other mode
      const wantsShow = a.mode === 1 ? a.dir === -1 : a.dir === 1;
      if (wantsShow !== show) a.dir = a.dir === 1 ? -1 : 1;
      return;
    }
    if (s.shown === show) return;
    const seconds = THREE.MathUtils.clamp(0.8 + s.span * 0.32, 1.1, 3.2);
    s.anim = { mode: show ? 0 : 1, progress: 0, dir: 1, seconds };
    s.nano.uNanoMode.value = s.anim.mode; s.nano.uNanoProgress.value = 0; s.nano.uNanoActive.value = 1;
    s.root.visible = true;
    s.particles ??= this.makeParticles(s);
    if (s.particles) s.particles.visible = true;
  }

  /** Sample every layer's particle cloud in idle time after load and compile the particle shader,
   *  so the first peel (in the middle of the cold open) does not stall on either. */
  prewarm() {
    const queue = [...this.states.values()];
    const idle = (cb: () => void) => { if ('requestIdleCallback' in window) requestIdleCallback(cb, { timeout: 1500 }); else setTimeout(cb, 60); };
    let compiled = false;
    const next = () => {
      const s = queue.shift();
      if (!s) return;
      if (!s.particles) {
        s.particles = this.makeParticles(s);
        if (s.particles && !s.anim) s.particles.visible = false;
      }
      if (s.particles && !compiled) {
        const was = s.particles.visible;
        s.particles.visible = true;
        this.stage.renderer.compile(s.particles, this.stage.camera, this.stage.scene);
        s.particles.visible = was; compiled = true;
      }
      idle(next);
    };
    idle(next);
  }

  private makeParticles(s: LayerState) {
    const meshes: THREE.Mesh[] = [];
    let area = 0;
    s.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.isCap || !m.geometry.attributes.position) return;
      meshes.push(m);
      const b = new THREE.Box3().setFromObject(m), d = b.getSize(new THREE.Vector3());
      area += 2 * (d.x * d.y + d.y * d.z + d.x * d.z);
    });
    if (!meshes.length) return null;
    const total = THREE.MathUtils.clamp(Math.round(area * 260), 400, 5000);
    const pos: number[] = [], nrm: number[] = [], dist: number[] = [], seed: number[] = [];
    const p = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const m of meshes) {
      const b = new THREE.Box3().setFromObject(m), d = b.getSize(new THREE.Vector3());
      const count = Math.round(total * (2 * (d.x * d.y + d.y * d.z + d.x * d.z)) / Math.max(area, 1e-6));
      if (count < 1) continue;
      let sampler: MeshSurfaceSampler;
      try { sampler = new MeshSurfaceSampler(m).build(); } catch { continue; }
      m.updateMatrixWorld(); nm.getNormalMatrix(m.matrixWorld);
      for (let i = 0; i < count; i++) {
        sampler.sample(p, n);
        p.applyMatrix4(m.matrixWorld); n.applyMatrix3(nm).normalize();
        pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z);
        dist.push(p.distanceTo(s.origin) + Math.random() * s.nano.uNanoJitter.value);
        seed.push(Math.random());
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aNormal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    const pts = new THREE.Points(g, particleMaterial(s.nano));
    pts.frustumCulled = false; pts.raycast = () => {}; pts.renderOrder = 3;
    this.stage.scene.add(pts);
    return pts;
  }

  setCut(open: boolean) { this.cutTarget = open ? 1 : 0; }

  /** Raycasts ignore clipping: true if this hit lies in the part the cutaway has removed. */
  removedByCut(o: THREE.Object3D, p: THREE.Vector3) {
    return this.cut > 0 && this.cutMeshes.has(o) && p.x > this.planes[0].constant && p.y > this.planes[1].constant;
  }

  private tick(dt: number) {
    for (const s of this.states.values()) {
      const a = s.anim;
      if (!a) continue;
      a.progress = THREE.MathUtils.clamp(a.progress + (a.dir * dt) / a.seconds, 0, 1);
      // ease the front: quick start, settle at the end
      const k = a.progress < 0.5 ? 2 * a.progress * a.progress : 1 - (-2 * a.progress + 2) ** 2 / 2;
      s.nano.uNanoProgress.value = k;
      if ((a.dir === 1 && a.progress >= 1) || (a.dir === -1 && a.progress <= 0)) {
        const visibleAtEnd = a.mode === 1 ? a.progress <= 0 : a.progress >= 1;
        s.shown = visibleAtEnd;
        s.root.visible = visibleAtEnd;
        s.nano.uNanoActive.value = 0;
        s.anim = null;
        if (s.particles) s.particles.visible = false;
      }
    }
    if (this.cut !== this.cutTarget) {
      this.cut = THREE.MathUtils.clamp(this.cut + Math.sign(this.cutTarget - this.cut) * dt / 1.2, 0, 1);
      const k = this.cut * this.cut * (3 - 2 * this.cut);
      // planes sweep in from outside the scanner to the isocentre axes
      this.planes[0].constant = this.cut === 0 ? 100 : THREE.MathUtils.lerp(1.4, 0, k);
      this.planes[1].constant = this.cut === 0 ? 100 : THREE.MathUtils.lerp(2.6, 1.05, k);
      for (const s of this.states.values()) for (const c of s.caps) c.visible = this.cut > 0;
    }
  }
}

function capColour(c: THREE.Color) {
  // the part's own colour lifted toward paper, so dark epoxy and black seams stay legible in section
  return c.clone().lerp(new THREE.Color(0.92, 0.91, 0.88), 0.35);
}
