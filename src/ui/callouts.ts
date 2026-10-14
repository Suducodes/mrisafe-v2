import * as THREE from 'three';
import type { Stage } from '../engine/stage';
import type { V3 } from '../engine/director';

export interface Callout { text: string; at: V3; note?: string }

/**
 * Technical-drawing callouts: a dot on the part, a leader line, and the label set in one of two
 * columns at the screen edges, stacked so labels never overlap or leave the screen.
 */
export class Callouts {
  private readonly svg: SVGSVGElement;
  private readonly layer: HTMLDivElement;
  private items: { c: Callout; label: HTMLDivElement; line: SVGPolylineElement; dot: SVGCircleElement; hidden: boolean }[] = [];
  private readonly v = new THREE.Vector3();
  private readonly ray = new THREE.Raycaster();
  private shown = 0;
  private frame = 0;
  /** Hits to disregard when testing whether a part is hidden (e.g. geometry the cutaway removed). */
  ignore: (o: THREE.Object3D, p: THREE.Vector3) => boolean = () => false;

  constructor(private readonly stage: Stage, host: HTMLElement) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('callout-lines');
    this.layer = document.createElement('div');
    this.layer.className = 'callouts';
    host.append(this.svg, this.layer);
    stage.onFrame(() => this.layout());
  }

  set(list: Callout[] = []) {
    this.layer.replaceChildren(); this.svg.replaceChildren();
    this.items = list.map((c) => {
      const label = document.createElement('div');
      label.className = 'callout';
      label.innerHTML = `<span>${c.text}</span>${c.note ? `<small>${c.note}</small>` : ''}`;
      this.layer.append(label);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('r', '3');
      this.svg.append(line, dot);
      return { c, label, line, dot, hidden: false };
    });
    this.shown = performance.now();
    this.frame = 0;
  }

  /** A label for a part hidden behind something else would point at the wrong thing: drop it. */
  private updateOcclusion() {
    const cam = this.stage.camera.position;
    for (const it of this.items) {
      const target = new THREE.Vector3(...it.c.at);
      const dir = target.clone().sub(cam); const dist = dir.length();
      this.ray.set(cam, dir.normalize()); this.ray.far = dist; this.ray.camera = this.stage.camera;
      const hit = this.ray.intersectObjects(this.stage.scene.children, true).find((h) => {
        const m = h.object as THREE.Mesh;
        if (!m.isMesh || m.userData.isCap || (m as unknown as { isLineSegments2?: boolean }).isLineSegments2) return false;
        if (this.ignore(m, h.point)) return false;
        for (let p: THREE.Object3D | null = m; p; p = p.parent) if (!p.visible) return false;
        const mat = m.material as THREE.Material;
        return !(mat.transparent && mat.opacity < 0.6);
      });
      // anchors sit on (or just inside) the part they name; only something well in front hides them
      it.hidden = !!hit && hit.distance < dist - 0.15;
    }
  }

  private layout() {
    if (!this.items.length) return;
    if (this.frame++ % 12 === 0) this.updateOcclusion();
    const W = innerWidth, H = innerHeight;
    const reserveRight = document.body.classList.contains('card-open') && W > 900 ? 420 : 0;
    const leftX = W > 900 ? 300 : 16, rightX = W - reserveRight - 24;
    const pts = this.items.map((it) => {
      this.v.set(...it.c.at).project(this.stage.camera);
      return { it, x: (this.v.x * 0.5 + 0.5) * W, y: (-this.v.y * 0.5 + 0.5) * H, behind: this.v.z > 1 || it.hidden };
    });
    const mid = (leftX + rightX) / 2;
    for (const side of ['L', 'R'] as const) {
      const col = pts.filter((p) => !p.behind && (side === 'L' ? p.x < mid : p.x >= mid)).sort((a, b) => a.y - b.y);
      let y = 72;
      for (const p of col) {
        const h = p.it.label.offsetHeight || 22;
        y = Math.max(y, Math.min(p.y - h / 2, H - 40 - h));
        const lx = side === 'L' ? leftX : rightX - p.it.label.offsetWidth;
        p.it.label.style.transform = `translate(${lx}px, ${y}px)`;
        p.it.label.classList.toggle('right', side === 'R');
        const ex = side === 'L' ? lx + p.it.label.offsetWidth + 6 : lx - 6, ey = y + h / 2;
        const kx = side === 'L' ? ex + 18 : ex - 18;
        p.it.line.setAttribute('points', `${ex},${ey} ${kx},${ey} ${p.x},${p.y}`);
        p.it.dot.setAttribute('cx', String(p.x)); p.it.dot.setAttribute('cy', String(p.y));
        y += h + 10;
      }
    }
    for (const p of pts) {
      // a label that was not placed in a column this frame (behind, occluded, off-projection) stays hidden
      const vis = p.behind || !Number.isFinite(p.x) || !Number.isFinite(p.y) ? '0' : '1';
      p.it.label.style.opacity = vis; p.it.line.style.opacity = vis; p.it.dot.style.opacity = vis;
    }
    const age = (performance.now() - this.shown) / 600;
    this.layer.style.opacity = this.svg.style.opacity = String(Math.min(1, age));
  }
}
