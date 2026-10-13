import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Plate } from './types';
import { plateBox, seg, readouts, fmt, css } from './ui';
import { el } from '../../ui/dom';
import { designMagnet, fieldAt, fieldMag, gradMag, pullOverWeight, contour, fieldLine, type Magnet } from '../../physics/field';
import { larmorMHz } from '../../physics/sir';

const ISO = 1.05;
const FIVE_GAUSS = 5e-4;
const EARTH = 50e-6;
const WRENCH_X = 0.55, WRENCH_Y = 1.02;

/** Spanner outline (ring end, shaft, open jaw), 21 cm long, extruded 6 mm with a soft bevel. */
function wrenchGeometry() {
  const s = new THREE.Shape();
  const L = 0.21, w = 0.011, rr = 0.017;
  s.moveTo(-L / 2 + rr, -w); s.lineTo(L / 2 - 0.02, -w * 0.9);
  s.absarc(L / 2 - 0.004, 0, 0.02, -2.3, 2.3, false);       // open end, jaw cut below
  s.lineTo(-L / 2 + rr, w);
  s.absarc(-L / 2 + 0.002, 0, rr, 0.75, -0.75 + Math.PI * 2, false);
  const ring = new THREE.Path(); ring.absarc(-L / 2 + 0.002, 0, 0.009, 0, Math.PI * 2, true); s.holes.push(ring);
  const jaw = new THREE.Path();
  jaw.moveTo(L / 2 + 0.03, -0.0065); jaw.lineTo(L / 2 - 0.006, -0.0065); jaw.lineTo(L / 2 - 0.006, 0.0065); jaw.lineTo(L / 2 + 0.03, 0.0065);
  s.holes.push(jaw);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.001, bevelSegments: 2, curveSegments: 24 });
  g.center();
  return g;
}

export const field: Plate = ({ stage, root }) => {
  let B0 = 1.5, shielded = true;
  let mag: Magnet = designMagnet(B0, shielded);
  const group = new THREE.Group(); group.name = 'field-viz'; stage.scene.add(group);
  const lineMat = new LineMaterial({ color: new THREE.Color(css('--field')), linewidth: 1.25, transparent: true, opacity: 0.7, depthTest: true });
  const gaussMat = new LineMaterial({ color: new THREE.Color(css('--zone-4')), linewidth: 3.2, transparent: true, opacity: 0.95 });
  const setRes = () => { const s = stage.renderer.getSize(new THREE.Vector2()); lineMat.resolution.copy(s); gaussMat.resolution.copy(s); };
  setRes(); addEventListener('resize', setRes);

  let lines: LineSegments2[] = [];
  let gauss: LineSegments2 | null = null;
  let grow = 0;
  let labelZ = 4.1;           // where the 5 G line crosses x = 0.8 m on the floor (cached per magnet)
  const label = el('div', { class: 'callout' }, el('span', {}, '5 gauss line'), el('small', {}, '0.5 mT · Zone IV boundary'));
  label.style.position = 'fixed'; label.style.zIndex = '3';
  document.body.append(label);

  const rebuild = () => {
    for (const l of lines) { group.remove(l); l.geometry.dispose(); }
    lines = [];
    if (gauss) { group.remove(gauss); gauss.geometry.dispose(); }
    // field lines in three meridional planes: the vertical one lies on the cut face, like a textbook figure
    const seeds = [0.07, 0.17, 0.27, 0.34, 1.3, 2.0];
    const halves = seeds.flatMap((r) => fieldLine(mag, r, 0, FIVE_GAUSS * 0.8));
    for (const phi of [Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const c = Math.cos(phi), sn = Math.sin(phi);
      for (const h of halves) {
        if (h.length < 3) continue;
        const pos: number[] = [];
        for (let i = 1; i < h.length; i++) {
          const [r0, z0] = h[i - 1], [r1, z1] = h[i];
          pos.push(r0 * c, ISO + r0 * sn, z0, r1 * c, ISO + r1 * sn, z1);
        }
        const g = new LineSegmentsGeometry(); g.setPositions(pos);
        const seg2 = new LineSegments2(g, lineMat); seg2.userData.total = h.length - 1;
        g.instanceCount = 0;
        group.add(seg2); lines.push(seg2);
      }
    }
    // the 5 gauss contour where it meets the floor (y = 0): rho = sqrt(x^2 + ISO^2)
    const ext = shielded ? 6 : 13;
    const segs = contour((x, z) => fieldMag(mag, Math.hypot(x, ISO), z, true), FIVE_GAUSS, -ext, ext, -ext - 1, ext + 1, 140, 160);
    const pos: number[] = [];
    for (let i = 0; i < segs.length; i += 4) pos.push(segs[i], 0.006, segs[i + 1], segs[i + 2], 0.006, segs[i + 3]);
    const g = new LineSegmentsGeometry(); g.setPositions(pos);
    gauss = new LineSegments2(g, gaussMat); gauss.renderOrder = 1;
    group.add(gauss);
    grow = 0;
    labelZ = 4.1;
    for (let d = 0.5; d < 30; d += 0.05) if (fieldMag(mag, Math.hypot(0.8, ISO), d, true) < FIVE_GAUSS) { labelZ = Math.min(d, 4.1); break; }
    updateReadouts();
  };

  // --- wrench: steel tool carried toward the bore along the table side --------------------
  const wrench = new THREE.Mesh(wrenchGeometry(), new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 1, roughness: 0.28 }));
  wrench.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  group.add(wrench);
  let wz = 3.2, flight: { y: number; z: number; vy: number; vz: number } | null = null;
  const pullAt = (z: number, y = WRENCH_Y) => {
    const rho = Math.hypot(WRENCH_X, y - ISO);
    return pullOverWeight(fieldMag(mag, rho, z), gradMag(mag, rho, z, 0, 1));
  };

  // --- UI --------------------------------------------------------------------------------
  const ro = readouts([['larmor', 'Larmor frequency'], ['earth', 'Field vs Earth'], ['axial', '5 G line, along the bore'], ['radial', '5 G line, sideways']]);
  const b0 = seg<number>([[0.5, '0.5 T'], [1.5, '1.5 T'], [3, '3 T']], B0, (v) => { B0 = v; mag = designMagnet(B0, shielded); rebuild(); });
  const sh = seg<string>([['s', 'Actively shielded'], ['u', 'Unshielded']], 's', (v) => { shielded = v === 's'; mag = designMagnet(B0, shielded); rebuild(); });
  const box = plateBox('Main field B0', 'computed from the coils');
  box.append(el('div', { class: 'row' }, b0.el), el('div', { class: 'row' }, sh.el), ro.el);

  const wro = readouts([['b', 'Field at the wrench'], ['pull', 'Pull, × its weight']]);
  const slider = el('input', { type: 'range', class: 'slider', min: 0.95, max: 4.0, step: 0.01, value: wz }) as HTMLInputElement;
  const result = el('p', { class: 'note' }, 'Slide the wrench toward the bore, then let go.');
  const letGo = el('button', { class: 'btn small primary', onclick: () => { flight = { y: WRENCH_Y, z: wz, vy: 0, vz: 0 }; letGo.disabled = true; slider.disabled = true; } }, 'Let go');
  const resetW = el('button', { class: 'btn small', onclick: () => { flight = null; wz = Number(slider.value); slider.disabled = false; letGo.disabled = false; result.textContent = 'Slide the wrench toward the bore, then let go.'; placeWrench(WRENCH_Y, wz); } }, 'Reset');
  slider.addEventListener('input', () => { wz = Number(slider.value); placeWrench(WRENCH_Y, wz); });
  const wbox = plateBox('Projectile effect', 'steel spanner, 0.2 kg');
  wbox.append(slider, el('div', { class: 'label-row' }, el('span', {}, 'bore entrance'), el('span', {}, '4 m from isocentre')), wro.el, el('div', { class: 'row' }, letGo, resetW), result);
  root.append(box, wbox);

  function placeWrench(y: number, z: number) {
    wrench.position.set(WRENCH_X, y, z);
    const rho = Math.hypot(WRENCH_X, y - ISO);
    const B = fieldMag(mag, rho, z), p = pullAt(z, y);
    wro.set('b', B >= 0.1 ? `${fmt(B, 2)} T` : `${fmt(B * 1000, 1)} mT`);
    wro.set('pull', `${fmt(p, p < 10 ? 1 : 0)} ×`, p > 1);
  }

  function updateReadouts() {
    ro.set('larmor', `${fmt(larmorMHz(B0), 1)} MHz`);
    ro.set('earth', `${Math.round(fieldAt(mag, 0, 0)[1] / EARTH).toLocaleString('en-GB')} ×`);
    const ext = (f: (d: number) => number) => { for (let d = 0.5; d < 30; d += 0.02) if (f(d) < FIVE_GAUSS) return d; return 30; };
    const ax = ext((d) => fieldMag(mag, 0, d, true)), rad = ext((d) => fieldMag(mag, d, 0, true));
    ro.set('axial', `${fmt(ax, 1)} m`, ax > 4.4);
    ro.set('radial', `${fmt(rad, 1)} m`, rad > 2.6);
    placeWrench(flight ? flight.y : WRENCH_Y, flight ? flight.z : wz);
  }

  // --- per frame: grow the lines outward from the bore, place the floor label, fly the wrench
  const tmp = new THREE.Vector3();
  const off = stage.onFrame((dt) => {
    if (grow < 1) {
      grow = Math.min(1, grow + dt / 2.4);
      const k = 1 - (1 - grow) ** 3;
      for (const l of lines) (l.geometry as LineSegmentsGeometry).instanceCount = Math.floor(l.userData.total * k);
    }
    // floor label near the line's front-most point
    tmp.set(0.8, 0, labelZ).project(stage.camera);
    label.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * innerWidth}px, ${(-tmp.y * 0.5 + 0.5) * innerHeight}px)`;
    label.style.opacity = tmp.z < 1 ? '1' : '0';
    if (flight) {
      const steps = 8, h = dt / steps;
      for (let i = 0; i < steps && flight; i++) {
        const a = 9.81 * pullAt(flight.z, flight.y);
        flight.vz -= a * h;                       // pulled toward isocentre (z decreasing)
        flight.vy -= 9.81 * h;
        flight.z += flight.vz * h; flight.y += flight.vy * h;
        if (flight.y < 0.01) { flight.y = 0.01; flight.vy = 0; flight.vz *= 0.9; }
        if (flight.z < 0.88) {
          const speed = Math.hypot(flight.vy, flight.vz);
          result.textContent = `It hit the bore at ${fmt(speed, 1)} m/s (${fmt(speed * 3.6, 0)} km/h). A cylinder or chair does the same with far more mass.`;
          flight.z = 0.88; placeWrench(flight.y, flight.z); flight = null; break;
        }
        if (Math.abs(flight.vz) < 0.02 && flight.y <= 0.01) {
          result.textContent = 'It dropped to the floor: here the pull is weaker than gravity. Move closer and it will not.';
          placeWrench(flight.y, flight.z); flight = null; break;
        }
      }
      if (flight) placeWrench(flight.y, flight.z);
    }
  });

  rebuild();
  return {
    dispose: () => {
      off(); removeEventListener('resize', setRes);
      stage.scene.remove(group);
      for (const l of lines) l.geometry.dispose();
      gauss?.geometry.dispose(); lineMat.dispose(); gaussMat.dispose(); wrench.geometry.dispose();
      label.remove();
    },
  };
};
