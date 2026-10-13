import * as THREE from 'three';
import type { Stage } from './stage';

/** Scanner layers in the order they are built, outside in (bore-side parts last). */
export const SCANNER_LAYERS = [
  'covers', 'coldhead', 'cryostat', 'thermal_shield', 'he_vessel', 'windings',
  'gradient', 'shims', 'rf_shield', 'rf_body_coil', 'liner',
] as const;
export type LayerName = (typeof SCANNER_LAYERS)[number] | 'table' | 'rf_head_coil' | 'room_finish' | 'rf_cage'
  | 'room_fixtures' | 'room_services' | 'room_signage' | 'control_room';

const CUT_LAYERS = new Set<string>(SCANNER_LAYERS);
const LIFT = 0.45;          // metres a peeled layer rises while it fades

interface LayerState {
  root: THREE.Object3D;
  baseY: number;
  materials: THREE.MeshStandardMaterial[];
  caps: THREE.Mesh[];
  shown: number;            // 0..1, animated toward target
  target: number;
}

/** Hatched section cap: drawn on back faces exposed by the cut, so shells read as solid. */
function capMaterial(color: THREE.Color, planes: THREE.Plane[]) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, clippingPlanes: planes, clipIntersection: true });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <color_fragment>',
        '#include <color_fragment>\n' +
        'float hatch = step(0.82, fract((vWorldPos.x + vWorldPos.y + vWorldPos.z) / 0.022));\n' +
        'diffuseColor.rgb *= 1.0 - 0.34 * hatch;');
  };
  m.customProgramCacheKey = () => 'section-cap';
  return m;
}

export class LayerSystem {
  private readonly states = new Map<string, LayerState>();
  private readonly hiddenObjects = new Map<string, THREE.Object3D>();
  /** Quarter cutaway: removes x > 0 and y > isocentre (both, hence clipIntersection). */
  private readonly planes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 100), new THREE.Plane(new THREE.Vector3(0, -1, 0), 100)];
  private cut = 0;            // 0 closed .. 1 open
  private cutTarget = 0;
  private readonly cutMeshes = new Set<THREE.Object3D>();

  constructor(private readonly stage: Stage) {
    for (const [name, root] of stage.layers) {
      const materials: THREE.MeshStandardMaterial[] = [];
      const caps: THREE.Mesh[] = [];
      const clones = new Map<string, THREE.MeshStandardMaterial>();
      const cuttable = CUT_LAYERS.has(name);
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || mesh.userData.isCap) return;
        const src = mesh.material as THREE.MeshStandardMaterial;
        let m = clones.get(src.uuid);
        if (!m) {
          m = src.clone();
          m.userData.baseOpacity = src.opacity;
          m.userData.baseTransparent = src.transparent;
          m.onBeforeCompile = src.onBeforeCompile;               // keep baked-lighting patch
          m.customProgramCacheKey = src.customProgramCacheKey;
          if (cuttable) {
            m.side = THREE.FrontSide;                          // closed shells; back faces become caps
            m.clippingPlanes = this.planes; m.clipIntersection = true;
          }
          clones.set(src.uuid, m); materials.push(m);
        }
        mesh.material = m;
        if (cuttable) {
          this.cutMeshes.add(mesh);
          const cap = new THREE.Mesh(mesh.geometry, capMaterial(capColour(m.color), this.planes));
          cap.userData.isCap = true; cap.visible = false; cap.raycast = () => {};
          mesh.add(cap); caps.push(cap);
        }
        this.hiddenObjects.set(mesh.name, mesh);
      });
      this.states.set(name, { root, baseY: root.position.y, materials, caps, shown: 1, target: 1 });
    }
    stage.onFrame((dt) => this.tick(dt));
  }

  has(name: string) { return this.states.has(name); }

  /** Show exactly the layers not listed; listed layers peel away (lift + fade). */
  setHidden(layers: Iterable<string>, objects: Iterable<string> = []) {
    const hide = new Set(layers);
    for (const [name, s] of this.states) s.target = hide.has(name) ? 0 : 1;
    const hideObj = new Set(objects);
    for (const [name, o] of this.hiddenObjects) {
      if (hideObj.has(name)) o.userData.peeled = true;
      else if (o.userData.peeled) { o.userData.peeled = false; o.visible = true; }
    }
    for (const name of hideObj) { const o = this.hiddenObjects.get(name); if (o) o.visible = false; }
  }

  setCut(open: boolean) { this.cutTarget = open ? 1 : 0; }

  /** Raycasts ignore clipping: true if this hit lies in the part the cutaway has removed. */
  removedByCut(o: THREE.Object3D, p: THREE.Vector3) {
    return this.cut > 0 && this.cutMeshes.has(o) && p.x > this.planes[0].constant && p.y > this.planes[1].constant;
  }

  private tick(dt: number) {
    for (const s of this.states.values()) {
      if (s.shown === s.target) continue;
      s.shown = THREE.MathUtils.clamp(s.shown + Math.sign(s.target - s.shown) * dt / 0.9, 0, 1);
      const k = s.shown * s.shown * (3 - 2 * s.shown);                  // smoothstep
      s.root.visible = s.shown > 0.001;
      s.root.position.y = s.baseY + (1 - k) * LIFT;
      for (const m of s.materials) {
        const fading = k < 0.999;
        m.transparent = fading || m.userData.baseTransparent;
        m.opacity = m.userData.baseOpacity * k;
        m.depthWrite = !fading;
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
