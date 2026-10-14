import * as THREE from 'three';
import type { Plate } from './types';
import { plateBox, seg, readouts, canvas, fmt, css } from './ui';
import { el } from '../../ui/dom';
import { designMagnet, fieldMag } from '../../physics/field';
import { larmorMHz } from '../../physics/sir';
import { ROOM_SHELL } from '../chapters';

/** Cryostat: the temperature ladder, and the cold head's 1 Hz cycle you can hear in the room. */
export const cryo: Plate = ({ root, audio }) => {
  const ro = readouts([['room', 'Vacuum vessel'], ['shield', 'Thermal shield'], ['lhe', 'Liquid helium'], ['nbti', 'NbTi stops superconducting']]);
  ro.set('room', '≈ 300 K'); ro.set('shield', '≈ 40–50 K'); ro.set('lhe', '4.2 K'); ro.set('nbti', '≈ 9 K', true);
  const pulse = el('span', { class: 'num' }, '●');
  const box = plateBox('Temperature ladder', '');
  box.append(ro.el, el('p', { class: 'note' }, pulse, '  The cold head cycles about once a second. In a quiet suite that soft chuff is the sound of the magnet staying cold.'));
  root.append(box);
  audio.setAmbience(true);
  const t = window.setInterval(() => { pulse.style.opacity = '1'; setTimeout(() => (pulse.style.opacity = '0.25'), 220); }, 1020);
  return { dispose: () => { clearInterval(t); audio.setAmbience(false); } };
};

/** Shimming: field error over a 40 cm sphere, straight from the coil model, before and after. */
export const shim: Plate = ({ root }) => {
  const mag = designMagnet(1.5, true);
  const b0 = fieldMag(mag, 0, 0);
  const N = 64, R = 0.2;
  const ppm = new Float32Array(N * N);
  let maxAbs = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const z = ((i + 0.5) / N * 2 - 1) * R, r = ((j + 0.5) / N * 2 - 1) * R;
    const inside = z * z + r * r <= R * R;
    const v = inside ? ((fieldMag(mag, Math.abs(r), z) - b0) / b0) * 1e6 : NaN;
    ppm[j * N + i] = v;
    if (inside) maxAbs = Math.max(maxAbs, Math.abs(v));
  }
  let shimmed = false;
  const cv = canvas(210);
  const ro = readouts([['pp', 'Peak error, 40 cm sphere'], ['hz', 'Frequency spread']]);
  const draw = () => {
    const { w, h } = cv.fit(); const g = cv.g;
    g.clearRect(0, 0, w, h);
    const s = Math.min(w, h) - 16, x0 = (w - s) / 2, y0 = 8, cell = s / N;
    const scale = shimmed ? 0.008 : 1;                       // passive + active shims: idealised residual
    const lim = Math.max(maxAbs * scale, 1);
    const blue = new THREE.Color(css('--field')), red = new THREE.Color(css('--zone-4')), paper = new THREE.Color(0xf4f5f3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = ppm[j * N + i];
      if (Number.isNaN(v)) continue;
      const k = THREE.MathUtils.clamp((v * scale) / lim, -1, 1);
      const c = paper.clone().lerp(k < 0 ? blue : red, Math.abs(k));
      g.fillStyle = `#${c.getHexString()}`;
      g.fillRect(x0 + i * cell, y0 + j * cell, cell + 0.5, cell + 0.5);
    }
    g.strokeStyle = 'rgba(27,33,36,.5)'; g.beginPath(); g.arc(x0 + s / 2, y0 + s / 2, s / 2, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(27,33,36,.6)'; g.font = '11px "JetBrains Mono"';
    g.fillText('← bore axis →', x0 + s / 2 - 42, y0 + s + 2 > h ? h - 4 : y0 + s - 4);
    const pp = maxAbs * scale;
    ro.set('pp', `${fmt(pp, pp < 10 ? 1 : 0)} ppm`, !shimmed);
    ro.set('hz', `${fmt(pp * larmorMHz(1.5), 0)} Hz`, !shimmed);
  };
  const s = seg<string>([['raw', 'Coils only'], ['shim', 'With shims (idealised)']], 'raw', (v) => { shimmed = v === 'shim'; draw(); });
  const box = plateBox('Field error map', 'axial plane, 40 cm DSV');
  box.append(el('div', { class: 'row' }, s.el), cv.el, ro.el,
    el('p', { class: 'note' }, 'Left map: six coils alone, computed from their geometry. Shimming takes it to a few parts per million; the shimmed map is an idealised illustration.'));
  root.append(box);
  requestAnimationFrame(draw);
  return { dispose: () => {} };
};

/** Gradient coils: pulse one axis, see its windings light up and the field slope it adds. */
export const gradients: Plate = ({ stage, root, audio }) => {
  const names: Record<string, string> = { x: 'Gradient_X_saddles', y: 'Gradient_Y_saddles', z: 'Gradient_Z_coil' };
  const glow: Record<string, { mat: THREE.MeshStandardMaterial; restore: () => void }> = {};
  for (const [axis, name] of Object.entries(names)) {
    const mesh = stage.scene.getObjectByName(name) as THREE.Mesh | undefined;
    if (!mesh) continue;
    const orig = mesh.material as THREE.MeshStandardMaterial;
    const mat = orig.clone(); mat.emissive = new THREE.Color(1.0, 0.55, 0.28); mat.emissiveIntensity = 0;
    mat.onBeforeCompile = orig.onBeforeCompile; mat.customProgramCacheKey = orig.customProgramCacheKey;
    mesh.material = mat;
    glow[axis] = { mat, restore: () => { mesh.material = orig; mat.dispose(); } };
  }
  let axis: 'x' | 'y' | 'z' = 'z';
  const G = 30;                                               // mT/m, a typical clinical gradient
  const cv = canvas(130);
  const draw = () => {
    const { w, h } = cv.fit(); const g = cv.g;
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(27,33,36,.25)'; g.beginPath(); g.moveTo(10, h / 2); g.lineTo(w - 10, h / 2); g.moveTo(w / 2, 8); g.lineTo(w / 2, h - 8); g.stroke();
    g.strokeStyle = css('--field'); g.lineWidth = 2; g.beginPath(); g.moveTo(10, h / 2 + 34); g.lineTo(w - 10, h / 2 - 34); g.stroke(); g.lineWidth = 1;
    g.fillStyle = 'rgba(27,33,36,.65)'; g.font = '11px "JetBrains Mono"';
    g.fillText(`B along ${axis}`, 12, 16); g.fillText('−20 cm', 10, h - 6); g.fillText('+20 cm', w - 52, h - 6); g.fillText('B0', w / 2 + 4, h / 2 - 4);
  };
  const ro = readouts([['g', 'Gradient strength'], ['db', 'Extra field at 20 cm'], ['df', 'Larmor shift at 20 cm'], ['dt', 'Switching time']]);
  const pulse = (a: 'x' | 'y' | 'z') => {
    axis = a; draw(); audio.knock(undefined, 0.6, a === 'x' ? 1 : a === 'y' ? 1.12 : 0.86);
    const gl = glow[a]; if (gl) gl.mat.emissiveIntensity = 2.2;
  };
  ro.set('g', `${G} mT/m`); ro.set('db', `${fmt(G * 0.2, 0)} mT`); ro.set('df', `${fmt(42.577 * G * 0.2, 0)} kHz`); ro.set('dt', '≈ 0.2 ms');
  const s = seg<'x' | 'y' | 'z'>([['x', 'Pulse X'], ['y', 'Pulse Y'], ['z', 'Pulse Z']], 'z', pulse);
  let seqTimer: number | null = null;
  const play = el('button', { class: 'btn small', onclick: () => {
    if (seqTimer) { clearInterval(seqTimer); seqTimer = null; play.textContent = 'Play a scan rhythm'; return; }
    let k = 0; play.textContent = 'Stop';
    seqTimer = window.setInterval(() => { const a = (['z', 'y', 'x', 'x'] as const)[k++ % 4]; s.set(a); pulse(a); }, 160);
  } }, 'Play a scan rhythm');
  const box = plateBox('Gradient set', 'X, Y, Z');
  box.append(el('div', { class: 'row' }, s.el, play), cv.el, ro.el,
    el('p', { class: 'note' }, 'Each switch drives a current pulse through a coil sitting in 1.5 T. The Lorentz force flexes it: that is the knock you hear.'));
  root.append(box);
  const off = stage.onFrame((dt) => { for (const g of Object.values(glow)) g.mat.emissiveIntensity = Math.max(0, g.mat.emissiveIntensity - dt * 7); });
  requestAnimationFrame(draw);
  return { dispose: () => { off(); if (seqTimer) clearInterval(seqTimer); for (const g of Object.values(glow)) g.restore(); } };
};

/** RF: the Larmor frequency the body coil transmits at, and the copper room that keeps radio out. */
export const rf: Plate = ({ root, layers, director }) => {
  const ro = readouts([['f', 'Transmit frequency, 1.5 T'], ['f3', 'At 3 T'], ['fm', 'FM radio band'], ['att', 'Typical cage attenuation']]);
  ro.set('f', `${fmt(larmorMHz(1.5), 1)} MHz`); ro.set('f3', `${fmt(larmorMHz(3), 1)} MHz`); ro.set('fm', '88–108 MHz'); ro.set('att', '≥ 100 dB');
  let cage = false;
  const btn = el('button', { class: 'btn small primary', onclick: () => {
    cage = !cage;
    if (cage) {
      layers.setHidden(['covers', 'coldhead', 'liner'], ROOM_SHELL); layers.setCut(false);
      director.fly({ eye: [2.15, 2.25, 3.95], target: [-0.6, 1.5, -0.6] });
      btn.textContent = 'Back to the coil';
    } else {
      layers.setHidden(['covers', 'coldhead', 'liner']); layers.setCut(true);
      director.fly({ eye: [0.48, 1.28, 1.6], target: [0, 1.05, 0] });
      btn.textContent = 'Show the Faraday cage';
    }
  } }, 'Show the Faraday cage');
  const box = plateBox('Radio frequency', '');
  box.append(ro.el, el('div', { class: 'row' }, btn),
    el('p', { class: 'note' }, 'The walls hide a continuous copper skin. Every cable crosses it through a filter on the penetration panel; air and gas cross through waveguides. An open door breaks the cage.'));
  root.append(box);
  return { dispose: () => {} };
};
