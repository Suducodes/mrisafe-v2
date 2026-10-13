import * as THREE from 'three';
import type { Plate } from './types';
import { plateBox, seg, readouts, fmt } from './ui';
import { el } from '../../ui/dom';

// vent path in three.js coords: up from the turret, through the ceiling void, out of the cage
const VENT = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.16, 2.40, -0.44), new THREE.Vector3(-0.16, 2.86, -0.44), new THREE.Vector3(-0.16, 3.12, -0.55),
  new THREE.Vector3(-0.16, 3.22, -0.80), new THREE.Vector3(-0.16, 3.22, -2.66), new THREE.Vector3(-0.16, 3.22, -3.6),
], false, 'centripetal');
const LHE_LITRES = 1500, EXPANSION = 750, ROOM_L = 5.2 * 6.6 * 2.95 * 1000;

function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.5, 'rgba(240,244,246,0.35)'); r.addColorStop(1, 'rgba(240,244,246,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const quench: Plate = ({ stage, root, audio }) => {
  const tex = puffTexture();
  const NV = 260, NR = 900;
  const vent = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.16, map: tex, transparent: true, depthWrite: false, opacity: 0.9 }));
  const room = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.9, map: tex, transparent: true, depthWrite: false, opacity: 0.55 }));
  vent.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NV * 3), 3));
  room.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NR * 3), 3));
  vent.frustumCulled = room.frustumCulled = false;
  vent.visible = room.visible = false;
  stage.scene.add(vent, room);
  const ventU = Float32Array.from({ length: NV }, () => Math.random());
  const roomP = Array.from({ length: NR }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), born: Infinity }));

  // ghost the vent pipe while the quench runs so the flow inside it is visible
  const pipe = ['Quench_pipe', 'Quench_bellows', 'Quench_reducer'].map((n) => stage.scene.getObjectByName(n) as THREE.Mesh | undefined).filter((m): m is THREE.Mesh => !!m);
  const pipeMats = pipe.map((m) => m.material as THREE.MeshStandardMaterial);
  const ghost = (on: boolean) => pipe.forEach((m, i) => {
    if (on) { const g = pipeMats[i].clone(); g.transparent = true; g.opacity = 0.28; g.depthWrite = false; m.material = g; }
    else { (m.material as THREE.Material).dispose(); m.material = pipeMats[i]; }
  });

  let t = -1, blocked = false, ghosted = false;
  const ro = readouts([['b', 'Field'], ['lhe', 'Liquid helium left'], ['gas', 'Helium gas released'], ['o2', 'Oxygen, well-mixed worst case']]);
  const status = el('p', { class: 'note' }, 'A quench is the loss of superconductivity. The stored energy heats the windings and boils the helium in seconds.');
  const show = () => {
    const k = t < 0 ? 0 : Math.min(1, t / 26);                              // boil-off curve over ~26 display seconds
    const boiled = LHE_LITRES * (1 - Math.exp(-4 * k)) / (1 - Math.exp(-4));
    const B = t < 0 ? 1.5 : 1.5 * Math.exp(-t / 5);
    const gas = boiled * EXPANSION;
    const inRoom = blocked ? gas : gas * 0.002;                             // a working vent keeps it out
    // fixed room volume, incoming gas pushes the mix out through door gaps: air fraction = exp(-V_he / V_room)
    const o2 = 20.9 * Math.exp(-inRoom / ROOM_L);
    ro.set('b', B >= 0.01 ? `${fmt(B, 2)} T` : '≈ 0 T');
    ro.set('lhe', `${fmt(LHE_LITRES - boiled, 0)} L`);
    ro.set('gas', gas > 1e6 ? `${fmt(gas / 1e6, 2)} million L` : `${fmt(gas, 0)} L`);
    ro.set('o2', `${fmt(o2, 1)} %`, o2 < 19.5);
    return o2;
  };
  let alarmed = false;
  const start = el('button', { class: 'btn small primary', onclick: () => { audio.ensure(); t = 0; vent.visible = true; if (!ghosted) { ghost(true); ghosted = true; } status.textContent = 'Quench under way: the field collapses and helium boils off up the vent line.'; } }, 'Quench (simulated)');
  const reset = el('button', { class: 'btn small', onclick: () => {
    t = -1; vent.visible = room.visible = false; for (const r of roomP) r.born = Infinity;
    if (ghosted) { ghost(false); ghosted = false; } audio.setAlarm(false); alarmed = false; show();
    status.textContent = 'A quench is the loss of superconductivity. The stored energy heats the windings and boils the helium in seconds.';
  } }, 'Reset');
  const vs = seg<string>([['ok', 'Vent line working'], ['blocked', 'Vent line blocked']], 'ok', (v) => { blocked = v === 'blocked'; });
  const box = plateBox('Quench', 'simulation, not a procedure');
  box.append(el('div', { class: 'row' }, start, reset), el('div', { class: 'row' }, vs.el), ro.el, status,
    el('p', { class: 'note' }, 'The oxygen figure assumes the helium mixes evenly through the room. In reality it rises and layers under the ceiling, and the emergency exhaust starts automatically, but a blocked vent is still life-threatening.'));
  root.append(box);
  show();

  let spawn = 0;
  const off = stage.onFrame((dt) => {
    if (t < 0) return;
    t += dt;
    const o2 = show();
    if (o2 < 19.5 && !alarmed) { alarmed = true; audio.setAlarm(true); status.textContent = 'O₂ alarm. Helium has displaced the air: evacuate, keep the door open from outside, do not go in to help.'; }
    const rate = Math.max(0, Math.exp(-t / 9));
    // vent stream
    const pos = vent.geometry.attributes.position as THREE.BufferAttribute;
    const p = new THREE.Vector3();
    for (let i = 0; i < NV; i++) {
      ventU[i] = (ventU[i] + dt * (0.25 + 0.6 * rate)) % 1;
      VENT.getPointAt(ventU[i], p);
      pos.setXYZ(i, p.x + (Math.random() - 0.5) * 0.05, p.y + (Math.random() - 0.5) * 0.05, p.z + (Math.random() - 0.5) * 0.05);
    }
    pos.needsUpdate = true;
    (vent.material as THREE.PointsMaterial).opacity = 0.25 + 0.65 * rate;
    // blocked vent: cold vapour pours out of the turret, hugs the ceiling, then sinks into the room
    if (blocked) {
      room.visible = true;
      spawn += dt * 60 * (0.3 + rate);
      const rp = room.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < NR; i++) {
        const r = roomP[i];
        if (r.born === Infinity && spawn >= 1) {
          spawn -= 1; r.born = t;
          r.p.set(-0.16 + (Math.random() - 0.5) * 0.3, 2.45, -0.44 + (Math.random() - 0.5) * 0.3);
          const a = Math.random() * Math.PI * 2;
          r.v.set(Math.cos(a) * (0.6 + Math.random()), 0.9, Math.sin(a) * (0.6 + Math.random()));
        }
        if (r.born !== Infinity) {
          const age = t - r.born;
          r.v.y += (age > 2 ? -0.08 : 0.2) * dt;
          r.v.multiplyScalar(1 - dt * 0.35);
          r.p.addScaledVector(r.v, dt);
          r.p.x = THREE.MathUtils.clamp(r.p.x, -2.5, 2.5); r.p.z = THREE.MathUtils.clamp(r.p.z, -2.1, 4.3); r.p.y = THREE.MathUtils.clamp(r.p.y, 0.2, 2.85);
          rp.setXYZ(i, r.p.x, r.p.y, r.p.z);
        } else rp.setXYZ(i, 0, -50, 0);
      }
      rp.needsUpdate = true;
    }
  });
  return {
    dispose: () => {
      off(); audio.setAlarm(false);
      if (ghosted) ghost(false);
      stage.scene.remove(vent, room); vent.geometry.dispose(); room.geometry.dispose(); tex.dispose();
    },
  };
};
