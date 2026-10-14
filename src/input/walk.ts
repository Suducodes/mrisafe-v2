import * as THREE from 'three';
import type { Stage } from '../engine/stage';
import type { CameraDirector } from '../engine/director';

const EYE = 1.62;              // eye height, metres
const RADIUS = 0.24;           // body radius for collisions
const WALK = 1.5, RUN = 2.9;   // m/s
const TURN = 1.9;              // rad/s for the arrow keys
const CELL = 0.04;             // occupancy grid resolution
const SLAB: [number, number] = [0.14, 1.8];   // what blocks you: anything between shin and head height
const FOV = 62;                // wider than the authored shots: first person needs peripheral view

/**
 * Where you cannot stand: everything between shin and head height, rasterised once from the actual
 * geometry onto a 4 cm grid of the floor plan. Walls with openings keep their openings, desks and
 * the gantry block, the glass of the RF window blocks. Moving equipment and the RF door are left out
 * here and handled live (they move).
 */
class Occupancy {
  private readonly minX: number; private readonly minZ: number;
  private readonly w: number; private readonly h: number;
  private readonly cells: Uint8Array;

  constructor(meshes: THREE.Mesh[], bounds: THREE.Box3) {
    this.minX = bounds.min.x; this.minZ = bounds.min.z;
    this.w = Math.ceil((bounds.max.x - bounds.min.x) / CELL) + 1;
    this.h = Math.ceil((bounds.max.z - bounds.min.z) / CELL) + 1;
    this.cells = new Uint8Array(this.w * this.h);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (const m of meshes) {
      const pos = m.geometry.attributes.position as THREE.BufferAttribute | undefined;
      if (!pos) continue;
      m.updateWorldMatrix(true, false);
      const box = new THREE.Box3().setFromBufferAttribute(pos).applyMatrix4(m.matrixWorld);
      if (box.max.y < SLAB[0] || box.min.y > SLAB[1]) continue;
      const idx = m.geometry.index;
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i += 3) {
        const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(m.matrixWorld);
        b.fromBufferAttribute(pos, ib).applyMatrix4(m.matrixWorld);
        c.fromBufferAttribute(pos, ic).applyMatrix4(m.matrixWorld);
        if (Math.max(a.y, b.y, c.y) < SLAB[0] || Math.min(a.y, b.y, c.y) > SLAB[1]) continue;
        // sample the triangle densely enough that no cell it crosses is skipped
        const len = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
        const k = Math.max(1, Math.ceil(len / (CELL * 0.7)));
        e1.subVectors(b, a); e2.subVectors(c, a);
        for (let u = 0; u <= k; u++) for (let v = 0; v <= k - u; v++) {
          p.copy(a).addScaledVector(e1, u / k).addScaledVector(e2, v / k);
          if (p.y >= SLAB[0] && p.y <= SLAB[1]) this.mark(p.x, p.z);
        }
      }
    }
  }

  private mark(x: number, z: number) {
    const i = Math.floor((x - this.minX) / CELL), j = Math.floor((z - this.minZ) / CELL);
    if (i >= 0 && j >= 0 && i < this.w && j < this.h) this.cells[j * this.w + i] = 1;
  }

  /** True if a body of radius r centred here would overlap anything; outside the plan is blocked. */
  blocked(x: number, z: number, r = RADIUS) {
    const i0 = Math.floor((x - r - this.minX) / CELL), i1 = Math.floor((x + r - this.minX) / CELL);
    const j0 = Math.floor((z - r - this.minZ) / CELL), j1 = Math.floor((z + r - this.minZ) / CELL);
    if (i0 < 0 || j0 < 0 || i1 >= this.w || j1 >= this.h) return true;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!this.cells[j * this.w + i]) continue;
      const cx = this.minX + (i + 0.5) * CELL, cz = this.minZ + (j + 0.5) * CELL;
      if ((cx - x) ** 2 + (cz - z) ** 2 < r * r) return true;
    }
    return false;
  }
}

export interface WalkOptions {
  /** meshes that block (built into the floor plan once) */
  colliders: () => THREE.Mesh[];
  /** extent of the walkable plan */
  bounds: () => THREE.Box3;
  /** things that move (equipment): centre and radius, checked live */
  dynamic?: () => { x: number; z: number; r: number }[];
}

/**
 * First-person walking, the way games do it: W A S D or the arrow keys to walk (left/right arrows
 * turn), Shift to run, drag to look, click the floor to walk there. Camera flights (the "Go to"
 * buttons, close-ups) still play; walking picks up from wherever they land.
 */
export class Walker {
  private enabled = false;
  private grid: Occupancy | null = null;
  private yaw = 0; private pitch = 0;
  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector2();
  private readonly keys = new Set<string>();
  private drag: { x: number; y: number; moved: number } | null = null;
  private goal: THREE.Vector2 | null = null;
  private resync = true;
  private readonly goalMarker: THREE.Mesh;

  constructor(private readonly stage: Stage, private readonly director: CameraDirector, private readonly opts: WalkOptions) {
    const canvas = stage.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.drag = { x: e.clientX, y: e.clientY, moved: 0 };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.enabled || !this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY; this.drag.moved += Math.abs(dx) + Math.abs(dy);
      if (this.drag.moved < 5 || this.director.flying) return;
      // dragging across the full height of the screen turns by about one field of view
      const k = THREE.MathUtils.degToRad(this.stage.camera.fov) / innerHeight * 1.15;
      this.yaw -= dx * k;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -1.25, 1.25);
      this.goal = null;
    });
    const end = () => { this.drag = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    addEventListener('keydown', (e) => {
      if (!this.enabled || (e.target instanceof Element && e.target.closest('input, textarea, select'))) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        this.keys.add(k); this.goal = null;
        if (k.startsWith('arrow')) e.preventDefault();
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());

    this.goalMarker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 48), new THREE.MeshBasicMaterial({ color: 0x5fd0ff, transparent: true, opacity: 0, depthWrite: false }));
    this.goalMarker.rotation.x = -Math.PI / 2; this.goalMarker.renderOrder = 4; this.goalMarker.visible = false;
    stage.scene.add(this.goalMarker);
    stage.onFrame((dt, t) => this.tick(dt, t));
  }

  get active() { return this.enabled; }

  enable() {
    if (this.enabled) return;
    this.grid ??= new Occupancy(this.opts.colliders(), this.opts.bounds());
    this.enabled = true; this.resync = true;
    this.stage.orbitActive = false; this.stage.controls.enabled = false;
    this.stage.setFov(FOV);
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false; this.keys.clear(); this.goal = null; this.goalMarker.visible = false;
    this.stage.orbitActive = true; this.stage.controls.enabled = true;
    this.stage.setFov(42);
  }

  /** Where you stand (for door sensors and distances). */
  get position() { return this.pos; }

  /** A click that hit nothing interactive: if it was the floor, walk there. */
  clickTo(clientX: number, clientY: number) {
    if (!this.enabled) return false;
    const hit = this.stage.pick(clientX, clientY);
    if (!hit || !hit.face) return false;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (n.y < 0.7 || hit.point.y > 0.3) return false;
    this.goal = new THREE.Vector2(hit.point.x, hit.point.z);
    this.goalMarker.position.set(hit.point.x, hit.point.y + 0.01, hit.point.z);
    this.goalMarker.visible = true;
    return true;
  }

  private syncFromCamera() {
    const cam = this.stage.camera;
    this.pos.copy(cam.position);
    const dir = this.stage.controls.target.clone().sub(cam.position).normalize();
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  }

  private free(x: number, z: number) {
    if (this.grid!.blocked(x, z)) return false;
    for (const d of this.opts.dynamic?.() ?? []) if ((d.x - x) ** 2 + (d.z - z) ** 2 < (d.r + RADIUS) ** 2) return false;
    return true;
  }

  private tick(dt: number, t: number) {
    if (!this.enabled) return;
    this.stage.controls.enabled = false;             // a finished flight hands control back to orbit; not here
    if (this.director.flying) { this.resync = true; return; }
    if (this.resync) { this.syncFromCamera(); this.resync = false; }

    const k = this.keys;
    const fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const side = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
    this.yaw += ((k.has('arrowleft') ? 1 : 0) - (k.has('arrowright') ? 1 : 0)) * TURN * dt;
    const speed = k.has('shift') ? RUN : WALK;
    const f = new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw)), r = new THREE.Vector2(Math.cos(this.yaw), -Math.sin(this.yaw));
    const want = f.multiplyScalar(fwd).add(r.multiplyScalar(side));
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(speed);
    else if (this.goal) {
      const to = this.goal.clone().sub(new THREE.Vector2(this.pos.x, this.pos.z));
      const d = to.length();
      if (d < 0.08) { this.goal = null; }
      else {
        want.copy(to).multiplyScalar(Math.min(WALK, d * 2.2) / d);
        // turn gently toward where we are going
        const yawTo = Math.atan2(-to.x, -to.y);
        let dy = yawTo - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.yaw += dy * Math.min(1, dt * 2.5);
      }
    }
    this.vel.lerp(want, 1 - Math.exp(-dt * 9));
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.y * dt;
    const stuck = !this.free(this.pos.x, this.pos.z);   // spawned inside something: let it walk out
    if (stuck || this.free(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
    else if (this.free(nx, this.pos.z)) { this.pos.x = nx; this.vel.y = 0; }      // slide along walls
    else if (this.free(this.pos.x, nz)) { this.pos.z = nz; this.vel.x = 0; }
    else { this.vel.set(0, 0); this.goal = null; }
    this.pos.y += (EYE - this.pos.y) * (1 - Math.exp(-dt * 3));

    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    const cam = this.stage.camera;
    cam.position.copy(this.pos);
    this.stage.controls.target.copy(this.pos).add(dir);
    cam.lookAt(this.stage.controls.target);

    const m = this.goalMarker.material as THREE.MeshBasicMaterial;
    m.opacity = this.goal ? 0.55 + 0.25 * Math.sin(t * 6) : Math.max(0, m.opacity - dt * 2);
    this.goalMarker.visible = m.opacity > 0.01;
  }
}
