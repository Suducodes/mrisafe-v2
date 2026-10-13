import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Plate, PlateCtx } from './types';
import { plateBox, seg, readouts, canvas, fmt, css } from './ui';
import { el } from '../../ui/dom';
import { PHYS, larmorMHz } from '../../physics/sir';

const ISO = new THREE.Vector3(0, 1.05, 0);
const NX = 7, NY = 7, NZ = 3, SP = 0.034;
const COUNT = NX * NY * NZ;

/** Arrow geometry along +Y, unit length, base at the origin. */
function arrowGeometry() {
  const shaft = new THREE.CylinderGeometry(0.055, 0.055, 0.72, 8); shaft.translate(0, 0.36, 0);
  const head = new THREE.ConeGeometry(0.15, 0.28, 12); head.translate(0, 0.86, 0);
  return mergeGeometries([shaft, head]);
}

/**
 * A small ensemble of proton magnetisations at isocentre. Physics frame: z = B0 (the bore axis,
 * three.js +z). State is integrated in the rotating frame; the lab view adds precession, slowed.
 */
class SpinField {
  readonly m = new Float64Array(COUNT * 3);      // per-spin magnetisation (mx, my, mz)
  readonly w = new Float64Array(COUNT);          // off-resonance, rad per display second
  readonly pos: THREE.Vector3[] = [];
  readonly mesh: THREE.InstancedMesh;
  readonly net: THREE.Mesh;
  T1 = 6; T2 = 3;                                 // display seconds
  lab = false; labPhase = 0;
  private pulse: { axis: 'x' | 'y'; left: number; rate: number } | null = null;
  private readonly q = new THREE.Quaternion();
  private readonly mtx = new THREE.Matrix4();

  constructor(private readonly ctx: PlateCtx, sigma = 1.6) {
    const geo = arrowGeometry();
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x2b3236, roughness: 0.45, metalness: 0.1 }), COUNT);
    this.net = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color(css('--field')), roughness: 0.35, emissive: new THREE.Color(css('--field')), emissiveIntensity: 0.25 }));
    let i = 0;
    for (let a = 0; a < NX; a++) for (let b = 0; b < NY; b++) for (let c = 0; c < NZ; c++, i++) {
      this.pos.push(new THREE.Vector3((a - (NX - 1) / 2) * SP, (b - (NY - 1) / 2) * SP, (c - (NZ - 1) / 2) * SP * 1.4).add(ISO));
    }
    this.setSigma(sigma);
    this.align();
    ctx.stage.scene.add(this.mesh, this.net);
  }

  /** Field inhomogeneity: off-resonance varies smoothly across the voxel (static, so echoes refocus). */
  setSigma(sigma: number) {
    for (let i = 0; i < COUNT; i++) {
      const p = this.pos[i].clone().sub(ISO);
      this.w[i] = sigma * (p.x / (SP * 3) + 0.6 * p.y / (SP * 3) + 0.25 * Math.sin(i * 12.9898) );
    }
  }

  align() { for (let i = 0; i < COUNT; i++) this.m.set([0, 0, 1], i * 3); this.pulse = null; }

  randomise(excess: number) {
    for (let i = 0; i < COUNT; i++) {
      let u = Math.random() * 2 - 1;                           // cos(theta), biased toward +z
      if (Math.random() < excess) u = Math.abs(u);
      const ph = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      this.m.set([s * Math.cos(ph), s * Math.sin(ph), u], i * 3);
    }
  }

  /** RF pulse with B1 along x' (or y'): rotate every spin by `deg` over `seconds`. */
  rf(deg: number, axis: 'x' | 'y' = 'x', seconds = 0.45) {
    this.pulse = { axis, left: seconds, rate: THREE.MathUtils.degToRad(deg) / seconds };
  }

  signal() {
    let x = 0, y = 0;
    for (let i = 0; i < COUNT; i++) { x += this.m[i * 3]; y += this.m[i * 3 + 1]; }
    return Math.hypot(x, y) / COUNT;
  }

  mz() { let z = 0; for (let i = 0; i < COUNT; i++) z += this.m[i * 3 + 2]; return z / COUNT; }

  step(dt: number, relax = true, precess = true) {
    const e2 = Math.exp(-dt / this.T2), e1 = Math.exp(-dt / this.T1);
    const p = this.pulse;
    let ang = 0;
    if (p) { const h = Math.min(dt, p.left); ang = p.rate * h; p.left -= h; if (p.left <= 0) this.pulse = null; }
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = 0; i < COUNT; i++) {
      let mx = this.m[i * 3], my = this.m[i * 3 + 1], mz = this.m[i * 3 + 2];
      if (ang) {
        if (p!.axis === 'x') { const y2 = my * ca - mz * sa, z2 = my * sa + mz * ca; my = y2; mz = z2; }
        else { const x2 = mx * ca + mz * sa, z2 = -mx * sa + mz * ca; mx = x2; mz = z2; }
      }
      if (precess) { const a = this.w[i] * dt, c = Math.cos(a), s = Math.sin(a); const x2 = mx * c - my * s; my = mx * s + my * c; mx = x2; }
      if (relax) { mx *= e2; my *= e2; mz = 1 - (1 - mz) * e1; }
      this.m[i * 3] = mx; this.m[i * 3 + 1] = my; this.m[i * 3 + 2] = mz;
    }
  }

  draw(dt: number) {
    if (this.lab) this.labPhase += dt * Math.PI * 2 * 0.6;        // Larmor, slowed ~10^8 times
    const c = Math.cos(this.labPhase), s = Math.sin(this.labPhase);
    const up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sum = new THREE.Vector3();
    for (let i = 0; i < COUNT; i++) {
      const mx = this.m[i * 3], my = this.m[i * 3 + 1], mz = this.m[i * 3 + 2];
      v.set(mx * c - my * s, mx * s + my * c, mz);                  // physics z = three z (bore axis)
      sum.add(v);
      const len = v.length();
      this.q.setFromUnitVectors(up, len > 1e-6 ? v.clone().divideScalar(len) : up);
      this.mtx.compose(this.pos[i], this.q, new THREE.Vector3(0.028, 0.028 * Math.max(len, 0.08), 0.028));
      this.mesh.setMatrixAt(i, this.mtx);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    sum.divideScalar(COUNT);
    const L = sum.length();
    this.net.visible = L > 0.03;
    this.q.setFromUnitVectors(up, L > 1e-6 ? sum.clone().divideScalar(L) : up);
    // net magnetisation drawn below the voxel, with a display gain so a small M is still readable
    this.net.position.copy(ISO).add(new THREE.Vector3(0, -SP * 4.2, 0));
    this.net.quaternion.copy(this.q);
    this.net.scale.set(0.045, 0.03 + 0.11 * Math.min(1, L * 2.2), 0.045);
  }

  dispose() {
    this.ctx.stage.scene.remove(this.mesh, this.net);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose(); (this.net.material as THREE.Material).dispose();
  }
}

/** Oscilloscope trace: signal over the last few seconds, with RF pulse marks. */
function scope(height = 120) {
  const cv = canvas(height);
  const samples: number[] = [], marks: { at: number; label: string }[] = [];
  const SPAN = 600;
  return {
    el: cv.el,
    push(v: number) { samples.push(v); if (samples.length > SPAN) { samples.shift(); for (const m of marks) m.at--; } },
    mark(label: string) { marks.push({ at: samples.length, label }); },
    clear() { samples.length = 0; marks.length = 0; },
    draw() {
      const { w, h } = cv.fit(); const g = cv.g;
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#12171a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(160,190,200,.12)';
      for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(0, (h * k) / 4); g.lineTo(w, (h * k) / 4); g.stroke(); }
      g.strokeStyle = '#7fd3c4'; g.lineWidth = 1.6; g.beginPath();
      samples.forEach((v, i) => { const x = (i / SPAN) * w, y = h - 8 - v * (h - 22); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke(); g.lineWidth = 1;
      g.fillStyle = 'rgba(230,200,120,.9)'; g.font = '10px "JetBrains Mono"';
      for (const m of marks) { if (m.at < 0) continue; const x = (m.at / SPAN) * w; g.fillRect(x, 6, 1, h - 12); g.fillText(m.label, x + 3, 14); }
      g.fillStyle = 'rgba(200,220,225,.55)'; g.fillText('signal  |Mxy|', 6, h - 6);
    },
  };
}

/** Chapter 8: protons line up (very slightly) and precess. */
export const spins: Plate = (ctx) => {
  const sf = new SpinField(ctx, 0);
  sf.lab = true;
  const B0 = 1.5, T = 310;
  // Boltzmann excess: dN/N = gamma hbar B0 / (2 k T)
  const excess = (2.675e8 * 1.0546e-34 * B0) / (2 * 1.380649e-23 * T);
  let on = true;
  const apply = () => { if (on) { sf.randomise(0.28); sf.lab = true; } else { sf.randomise(0); sf.lab = false; } };
  apply();
  const ro = readouts([['f', 'Precession (Larmor)'], ['ex', 'Excess spins aligned'], ['net', 'Net magnetisation']]);
  ro.set('f', `${fmt(larmorMHz(B0), 1)} MHz`); ro.set('ex', `${fmt(excess * 1e6, 1)} per million`);
  const s = seg<string>([['on', 'Magnet on'], ['off', 'No field']], 'on', (v) => { on = v === 'on'; apply(); });
  const box = plateBox('Protons at isocentre', 'lab frame, slowed');
  box.append(el('div', { class: 'row' }, s.el), ro.el,
    el('p', { class: 'note' }, 'The blue arrow is the net magnetisation. The tilt toward the field is exaggerated so you can see it; the real excess is the figure above, which is still billions of protons in every voxel.'));
  ctx.root.append(box);
  const off = ctx.stage.onFrame((dt) => { sf.step(dt, false, false); sf.draw(dt); ro.set('net', on ? 'along B0' : 'zero'); });
  return { dispose: () => { off(); sf.dispose(); } };
};

/** Chapter 9: tip with RF, watch the spins fan out, refocus them into an echo. */
export const excite: Plate = (ctx) => {
  const sf = new SpinField(ctx, 1.6);
  sf.T1 = 40; sf.T2 = 9;
  const sc = scope();
  let auto: number[] = [];
  const clearAuto = () => { for (const t of auto) clearTimeout(t); auto = []; };
  const p90 = el('button', { class: 'btn small primary', onclick: () => { clearAuto(); sf.rf(90); sc.mark('90°'); } }, '90° pulse');
  const p180 = el('button', { class: 'btn small', onclick: () => { clearAuto(); sf.rf(180, 'y'); sc.mark('180°'); } }, '180° pulse');
  const echo = el('button', { class: 'btn small', onclick: () => {
    clearAuto(); sf.align(); sc.clear(); sf.rf(90); sc.mark('90°');
    auto.push(window.setTimeout(() => { sf.rf(180, 'y'); sc.mark('180°'); }, 1700));
    auto.push(window.setTimeout(() => sc.mark('echo'), 3600));
  } }, 'Spin echo');
  const reset = el('button', { class: 'btn small', onclick: () => { clearAuto(); sf.align(); sc.clear(); } }, 'Reset');
  const inh = el('input', { type: 'range', class: 'slider', min: 0.2, max: 3, step: 0.05, value: 1.6 }) as HTMLInputElement;
  inh.addEventListener('input', () => sf.setSigma(Number(inh.value)));
  const box = plateBox('Excitation and echo', 'rotating frame');
  box.append(el('div', { class: 'row' }, p90, p180, echo, reset), sc.el,
    el('div', { class: 'label-row' }, el('span', {}, 'uniform field'), el('span', {}, 'field inhomogeneity'), el('span', {}, 'poor shim')), inh,
    el('p', { class: 'note' }, 'After the 90° pulse every spin points the same way and the coil sees a strong signal. Tiny field differences make them drift apart, so the signal fades (T2*). A 180° pulse flips the fan over; the fast spins catch up with the slow ones and the signal comes back as an echo.'));
  ctx.root.append(box);
  const off = ctx.stage.onFrame((dt) => { sf.step(dt); sf.draw(dt); sc.push(sf.signal()); sc.draw(); });
  return { dispose: () => { off(); clearAuto(); sf.dispose(); } };
};

/** Chapter 10: T1 recovery and T2 decay by tissue, and how TR/TE turn them into contrast. */
export const relax: Plate = (ctx) => {
  const tissues = ['wm', 'gm', 'csf', 'fat'] as const;
  let tissue: (typeof tissues)[number] = 'wm';
  const TIME = 1 / 250;                                    // display seconds per real ms: one uniform slow-down, so arrows match the curves
  const sf = new SpinField(ctx, 0.25);
  const setTissue = () => { const t = PHYS.TISSUES[tissue]; sf.T1 = t.t1 * TIME; sf.T2 = t.t2 * TIME; };
  setTissue();
  let tMs = 0, running = false;
  const curves = canvas(150);
  const bars = canvas(96);
  let preset = 'T1';
  const colour: Record<string, string> = { wm: '#2a5d9f', gm: '#6f8b3a', csf: '#b8321a', fat: '#b8921c' };
  const drawCurves = () => {
    const { w, h } = curves.fit(); const g = curves.g;
    g.clearRect(0, 0, w, h);
    const T = 4500, px = (ms: number) => 8 + (ms / T) * (w - 16), py = (v: number) => h - 14 - v * (h - 28);
    g.strokeStyle = 'rgba(27,33,36,.18)'; g.beginPath(); g.moveTo(8, py(0)); g.lineTo(w - 8, py(0)); g.stroke();
    for (const k of tissues) {
      g.strokeStyle = colour[k]; g.lineWidth = k === tissue ? 2.2 : 1; g.globalAlpha = k === tissue ? 1 : 0.45;
      g.beginPath(); for (let ms = 0; ms <= T; ms += 30) { const r = PHYS.relax(ms, k, 90); const x = px(ms), y = py(r.mz); ms ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      g.setLineDash([3, 3]);
      g.beginPath(); for (let ms = 0; ms <= T; ms += 10) { const r = PHYS.relax(ms, k, 90); const x = px(ms), y = py(r.mxy); ms ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      g.setLineDash([]);
    }
    g.globalAlpha = 1; g.lineWidth = 1;
    g.fillStyle = 'rgba(27,33,36,.55)'; g.fillRect(px(Math.min(tMs, T)), 6, 1, h - 18);
    g.font = '10px "JetBrains Mono"'; g.fillText('Mz recovers (T1) ——   Mxy decays (T2) - - -', 8, 11); g.fillText('0', 8, h - 2); g.fillText('4.5 s', w - 34, h - 2);
  };
  const drawBars = () => {
    const { w, h } = bars.fit(); const g = bars.g;
    g.clearRect(0, 0, w, h);
    const p = PHYS.PRESETS[preset];
    const vals = tissues.map((k) => PHYS.signalSE(k, p.TR, p.TE));
    const max = Math.max(...vals, 1e-6), bw = (w - 16) / tissues.length;
    tissues.forEach((k, i) => {
      const v = vals[i] / max;
      g.fillStyle = colour[k]; g.globalAlpha = 0.85; g.fillRect(8 + i * bw + 6, h - 18 - v * (h - 30), bw - 12, v * (h - 30)); g.globalAlpha = 1;
      g.fillStyle = 'rgba(27,33,36,.7)'; g.font = '11px "Inter Tight"'; g.fillText(PHYS.TISSUES[k].name.split(' ')[0], 8 + i * bw + 6, h - 4);
    });
  };
  const ts = seg<string>(tissues.map((k) => [k, PHYS.TISSUES[k].name.replace('Cerebrospinal fluid', 'CSF')] as [string, string]), tissue, (v) => {
    tissue = v as typeof tissue; setTissue(); drawCurves();
  });
  const go = el('button', { class: 'btn small primary', onclick: () => { sf.align(); sf.rf(90, 'x', 0.3); tMs = 0; running = true; } }, '90° pulse, then watch');
  const ps = seg<string>([['T1', 'T1-weighted'], ['T2', 'T2-weighted'], ['PD', 'PD']], preset, (v) => { preset = v; drawBars(); note.textContent = PHYS.PRESETS[v].note; });
  const note = el('p', { class: 'note' }, PHYS.PRESETS[preset].note);
  const box1 = plateBox('Relaxation', 'Allwyn Sir’s tissue values');
  box1.append(el('div', { class: 'row' }, ts.el), el('div', { class: 'row' }, go), curves.el);
  const box2 = plateBox('Contrast from TR and TE', 'spin echo');
  box2.append(el('div', { class: 'row' }, ps.el), bars.el, note);
  ctx.root.append(box1, box2);
  const off = ctx.stage.onFrame((dt) => {
    sf.step(dt); sf.draw(dt);
    if (running) { tMs += dt / TIME; if (tMs > 4500) running = false; drawCurves(); }
  });
  requestAnimationFrame(() => { drawCurves(); drawBars(); });
  return { dispose: () => { off(); sf.dispose(); } };
};
