import * as THREE from 'three';
import type { Stage } from '../engine/stage';
import type { Shot } from '../engine/director';
import { designMagnet, fieldMag, gradMag, pullOverWeight } from '../physics/field';

const ISO = 1.05;
export type ZoneId = 'ZONE_II' | 'ZONE_IV';
export type ItemId = 'o2' | 'wheelchair' | 'ivpole' | 'pads' | 'pump';

/** Camera positions for the walk from Zone II to Zone IV (three.js coords). */
export const SHOTS: Record<string, Shot> = {
  staging: { eye: [-0.2, 1.62, 6.75], target: [1.85, 0.62, 5.35] },
  corridor: { eye: [-3.1, 1.66, 6.8], target: [0.4, 0.95, 5.0] },
  door: { eye: [-1.35, 1.66, 6.65], target: [-1.35, 1.15, 4.5] },
  zone4: { eye: [2.2, 1.72, 3.85], target: [-0.3, 0.85, 0.9], via: [[-1.35, 1.66, 5.6], [-1.35, 1.6, 4.1]] },
  patient: { eye: [1.5, 1.55, 3.2], target: [0.0, 0.95, 1.9] },
  record: { eye: [-4.4, 1.62, 2.4], target: [-3.2, 0.9, 1.6] },
};

/** Where each item stands when it is in Zone IV (inside the magnet room). */
const ZONE4_SPOT: Record<ItemId, THREE.Vector3> = {
  o2: new THREE.Vector3(-1.15, 0, 1.75),
  wheelchair: new THREE.Vector3(1.45, 0, 3.35),
  ivpole: new THREE.Vector3(0.95, 0, 2.15),
  pads: new THREE.Vector3(1.95, -0.485, 1.25),            // on the floor beside the gantry (they sit on a bench in Zone II)
  pump: new THREE.Vector3(-1.85, -0.49 + 0.0, 0.7),        // on the floor by the wall (its stand is the bench in Zone II)
};

export class TrainScene {
  readonly items = new Map<ItemId, THREE.Object3D>();
  private readonly home = new Map<ItemId, THREE.Vector3>();
  private readonly moves = new Map<ItemId, { from: THREE.Vector3; to: THREE.Vector3; t: number; arc: number }>();
  private replay: null | { id: ItemId; root: THREE.Object3D; p: THREE.Vector3; v: number; start: THREE.Vector3; t: number; done: (speed: number) => void; hit: boolean } = null;
  private readonly pivot: THREE.Object3D | undefined;
  private door = 0; private doorTarget = 0;
  private fmd: THREE.MeshStandardMaterial[] = [];
  private fmdAlarm = 0;
  private readonly mag = designMagnet(1.5, true);
  private readonly highlight: THREE.Mesh;

  constructor(private readonly stage: Stage) {
    for (const id of ['o2', 'wheelchair', 'ivpole', 'pads', 'pump'] as ItemId[]) {
      const o = stage.scene.getObjectByName(`Item_${id}`);
      if (!o) continue;
      o.userData.itemId = id;
      this.items.set(id, o); this.home.set(id, o.position.clone());
    }
    this.pivot = stage.scene.getObjectByName('Door_pivot');
    for (const n of ['FMD_L_strip', 'FMD_R_strip']) {
      const m = stage.scene.getObjectByName(n) as THREE.Mesh | undefined;
      if (m) { const mat = (m.material as THREE.MeshStandardMaterial).clone(); m.material = mat; this.fmd.push(mat); }
    }
    this.addContactShadows();
    this.highlight = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.37, 64), new THREE.MeshBasicMaterial({ color: 0x1b2124, transparent: true, opacity: 0.0, depthWrite: false }));
    this.highlight.rotation.x = -Math.PI / 2; this.highlight.renderOrder = 2;
    stage.scene.add(this.highlight);
    stage.onFrame((dt) => this.tick(dt));
  }

  /**
   * Equipment moves between zones (and a scenario hides what it does not use), so its shadows are
   * not baked: each item carries a soft contact shadow of its own footprint that travels with it.
   */
  private addContactShadows() {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d')!, grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0.62)'); grad.addColorStop(0.45, 'rgba(0,0,0,0.38)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const o of this.items.values()) {
      o.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3()), at = box.getCenter(new THREE.Vector3());
      const root = o.getWorldPosition(new THREE.Vector3());
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      blob.rotation.x = -Math.PI / 2;
      blob.scale.set(size.x * 1.35 + 0.12, size.z * 1.35 + 0.12, 1);
      blob.position.set(at.x - root.x, box.min.y - root.y + 0.003, at.z - root.z);
      blob.raycast = () => {}; blob.userData.blob = true; blob.renderOrder = 1;
      o.add(blob);
      o.userData.foot = { dx: at.x - root.x, dz: at.z - root.z, base: box.min.y - root.y, r: Math.max(size.x, size.z) * 0.45 };
    }
  }

  /** Centre and radius of every item standing on the floor, for walking around them. */
  obstacles() {
    const out: { x: number; z: number; r: number }[] = [];
    const p = new THREE.Vector3();
    for (const o of this.items.values()) {
      const f = o.userData.foot;
      if (!o.visible || !f) continue;
      o.getWorldPosition(p);
      if (p.y + f.base > 0.3) continue;                   // sitting on the bench: the bench already blocks
      out.push({ x: p.x + f.dx, z: p.z + f.dz, r: f.r });
    }
    return out;
  }

  get replaying() { return this.replay !== null; }

  /** Item zones as the scenario sets them; snaps (no animation). */
  place(zones: Partial<Record<ItemId, ZoneId>>) {
    for (const [id, o] of this.items) {
      const z = zones[id];
      o.visible = !!z;
      if (z) o.position.copy(z === 'ZONE_IV' ? ZONE4_SPOT[id] : this.home.get(id)!);
    }
    this.moves.clear();
  }

  move(id: ItemId, zone: ZoneId) {
    const o = this.items.get(id); if (!o) return;
    this.moves.set(id, { from: o.position.clone(), to: (zone === 'ZONE_IV' ? ZONE4_SPOT[id] : this.home.get(id)!).clone(), t: 0, arc: 0 });
  }

  itemAt(clientX: number, clientY: number): ItemId | null {
    const hit = this.stage.pick(clientX, clientY);
    for (let o: THREE.Object3D | null = hit?.object ?? null; o; o = o.parent) if (o.userData.itemId) return o.userData.itemId as ItemId;
    return null;
  }

  isPatient(clientX: number, clientY: number) {
    const hit = this.stage.pick(clientX, clientY);
    return !!hit && /^(Patient_blanket|HeadCoil|Cradle|Mattress)/.test(hit.object.name);
  }

  select(id: ItemId | null) {
    const o = id ? this.items.get(id) : null;
    (this.highlight.material as THREE.MeshBasicMaterial).opacity = o ? 0.75 : 0;
    if (o) { const p = o.getWorldPosition(new THREE.Vector3()); this.highlight.position.set(p.x, 0.01 + Math.max(0, o.position.y), p.z); }
  }

  setDoor(open: boolean) { this.doorTarget = open ? -1.55 : 0; }

  /** The ferromagnetic detector at the Zone IV door: flashes red when steel is brought to it. */
  alarmDetector() { this.fmdAlarm = 2.4; }

  /**
   * "What would have happened": the blocked move replayed. The item is released at the door and
   * pulled along the axis by the real force curve (B dB/dx, saturating steel) into the bore.
   */
  replayProjectile(id: ItemId): Promise<number> {
    const o = this.items.get(id); if (!o) return Promise.resolve(0);
    const ghost = o.clone(true);
    ghost.traverse((n) => {
      const m = n as THREE.Mesh;
      if (m.userData.blob) { m.visible = false; return; }
      if (m.isMesh) { const mat = (m.material as THREE.MeshStandardMaterial).clone(); mat.transparent = true; mat.opacity = 0.85; m.material = mat; }
    });
    const start = new THREE.Vector3(-1.35, 0, 4.35);            // released just inside the RF door
    ghost.position.copy(start); ghost.visible = true;
    this.stage.scene.add(ghost);
    this.setDoor(true);
    // wheeled in at walking pace; within about a metre and a half of the bore the field takes over
    return new Promise((done) => { this.replay = { id, root: ghost, p: start.clone(), v: 0.9, start, t: 0, done, hit: false }; });
  }

  private tick(dt: number) {
    for (const [id, m] of this.moves) {
      m.t = Math.min(1, m.t + dt / 1.6);
      const k = m.t * m.t * (3 - 2 * m.t);
      const o = this.items.get(id)!;
      o.position.lerpVectors(m.from, m.to, k);
      o.position.y += Math.sin(Math.PI * k) * m.arc;
      if (m.t >= 1) this.moves.delete(id);
    }
    if (this.pivot && this.door !== this.doorTarget) {
      this.door += Math.sign(this.doorTarget - this.door) * Math.min(Math.abs(this.doorTarget - this.door), dt * 1.3);
      this.pivot.rotation.y = this.door;
    }
    if (this.fmdAlarm > 0 || this.fmd.length) {
      this.fmdAlarm = Math.max(0, this.fmdAlarm - dt);
      const on = this.fmdAlarm > 0 && Math.floor(this.fmdAlarm * 6) % 2 === 0;
      for (const m of this.fmd) m.emissive.setRGB(on ? 1.0 : 0.2, on ? 0.12 : 1.0, on ? 0.1 : 0.45);
    }
    const r = this.replay;
    if (r) {
      r.t += dt;
      if (!r.hit) {
        // integrate along the straight line from the door to the bore mouth (centre of mass at ~1 m)
        const target = new THREE.Vector3(0, 0.5, 0.9);           // root rises toward bore height as it is pulled in
        const dir = target.clone().sub(r.p); const dist = dir.length();
        const z = r.p.z, rho = Math.hypot(r.p.x, 1.0 - ISO);
        const pull = pullOverWeight(fieldMag(this.mag, rho, z, true), gradMag(this.mag, rho, z, 0, 1));
        const a = 9.81 * pull;
        r.v += a * dt * 0.5;                                       // shown at half speed so it can be followed
        const step = Math.min(dist, r.v * dt * 0.5);
        r.p.addScaledVector(dir.normalize(), step);
        r.root.position.copy(r.p);
        r.root.rotation.z += r.v * dt * 0.02;
        if (dist < 0.02) { r.hit = true; r.t = 0; }
      } else if (r.t > 2.2) {
        this.stage.scene.remove(r.root);
        this.setDoor(false);
        const speed = r.v; this.replay = null; r.done(speed);
      }
    }
  }
}
