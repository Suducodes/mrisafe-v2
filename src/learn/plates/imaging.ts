import * as THREE from 'three';
import type { Plate } from './types';
import { plateBox, seg, readouts, canvas, fmt, css } from './ui';
import { el } from '../../ui/dom';
import { PHYS } from '../../physics/sir';

const ISO = 1.05;

/** Chapter 11: a gradient makes frequency depend on position; the RF band picks a slice. */
export const slice: Plate = ({ stage, root }) => {
  let G = 10, BW = 1, OFF = 0;                       // mT/m, kHz, kHz (Allwyn Sir's defaults)
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 1, 64, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(css('--field')), transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.335, 1, 64, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(css('--field')), transparent: true, opacity: 0.55, side: THREE.DoubleSide, wireframe: true }));
  const grp = new THREE.Group(); grp.add(slab, rim); grp.rotation.x = Math.PI / 2; grp.position.set(0, ISO, 0);
  stage.scene.add(grp);
  const ro = readouts([['dz', 'Slice thickness'], ['z', 'Slice position'], ['f', 'Frequency spread over 40 cm']]);
  const cv = canvas(140);
  const apply = () => {
    const dz = PHYS.sliceThicknessMm(BW, G), z = PHYS.sliceOffsetMm(OFF, G);
    grp.position.z = z / 1000;
    grp.scale.set(1, Math.max(dz / 1000, 0.0015), 1);
    ro.set('dz', `${fmt(dz, 1)} mm`); ro.set('z', `${z >= 0 ? '+' : ''}${fmt(z, 0)} mm`);
    ro.set('f', `${fmt(PHYS.frequencyShiftKHz(0.2, G) * 2, 0)} kHz`);
    const { w, h } = cv.fit(); const g = cv.g;
    g.clearRect(0, 0, w, h);
    const zr = 0.2, fr = PHYS.frequencyShiftKHz(zr, 40);
    const X = (zm: number) => 10 + ((zm + zr) / (2 * zr)) * (w - 20), Y = (k: number) => h / 2 - (k / fr) * (h / 2 - 12);
    g.fillStyle = 'rgba(42,93,159,.12)'; g.fillRect(10, Y(OFF + BW / 2), w - 20, Y(OFF - BW / 2) - Y(OFF + BW / 2));
    g.strokeStyle = css('--field'); g.lineWidth = 2; g.beginPath(); g.moveTo(X(-zr), Y(PHYS.frequencyShiftKHz(-zr, G))); g.lineTo(X(zr), Y(PHYS.frequencyShiftKHz(zr, G))); g.stroke(); g.lineWidth = 1;
    const za = (OFF - BW / 2) / (PHYS.frequencyShiftKHz(1, G)), zb = (OFF + BW / 2) / (PHYS.frequencyShiftKHz(1, G));
    g.fillStyle = 'rgba(42,93,159,.35)'; g.fillRect(X(Math.min(za, zb)), 8, Math.max(2, X(Math.max(za, zb)) - X(Math.min(za, zb))), h - 16);
    g.fillStyle = 'rgba(27,33,36,.6)'; g.font = '10px "JetBrains Mono"';
    g.fillText('frequency offset', 12, 12); g.fillText('position along the bore →', w - 160, h - 4);
  };
  const slider = (label: string, min: number, max: number, step: number, value: number, set: (v: number) => void, unit: string) => {
    const s = el('input', { type: 'range', class: 'slider', min, max, step, value }) as HTMLInputElement;
    const out = el('span', {}, `${value} ${unit}`);
    s.addEventListener('input', () => { set(Number(s.value)); out.textContent = `${s.value} ${unit}`; apply(); });
    return [el('div', { class: 'label-row' }, el('span', {}, label), out), s];
  };
  const box = plateBox('Slice selection', 'Δz = BW / (γ̄ · G)');
  box.append(...slider('Gradient G', 2, 40, 1, G, (v) => (G = v), 'mT/m'), ...slider('RF bandwidth', 0.2, 5, 0.1, BW, (v) => (BW = v), 'kHz'),
    ...slider('RF frequency offset', -20, 20, 0.5, OFF, (v) => (OFF = v), 'kHz'), cv.el, ro.el);
  root.append(box);
  requestAnimationFrame(apply);
  return { dispose: () => { stage.scene.remove(grp); slab.geometry.dispose(); rim.geometry.dispose(); } };
};

/**
 * Chapter 12: k-space fills line by line, in time with the gradient knocks (or the EPI buzz),
 * and the image forms from it. Artefacts are injected into k-space, as they arise in a scanner.
 */
export const kspace: Plate = ({ stage, root, audio }) => {
  const N = 128;
  let preset = 'T1', seqKind: 'SE' | 'EPI' = 'SE', order: 'linear' | 'centre' = 'linear';
  const art = { motion: false, metal: false, door: false };
  let kRe = new Float64Array(N * N), kIm = new Float64Array(N * N);
  let filled = new Uint8Array(N), rowsDone = 0, playing = false, acc = 0;
  const labels = PHYS.headPhantom(N);

  const build = () => {
    const p = PHYS.PRESETS[preset];
    let img = PHYS.phantomImage(labels, p.TR, p.TE);
    if (art.metal) {
      // a dental-style implant: signal void plus a local field error that shifts nearby signal
      const out = new Float64Array(N * N), cx = 0.62 * N, cy = 0.28 * N;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const shift = d < 26 ? Math.round(9 * Math.exp(-d / 9)) : 0;
        const src = Math.min(N - 1, Math.max(0, x - shift));
        out[y * N + x] = d < 5 ? 0 : img[y * N + src] * (d < 9 ? 1.7 : 1);
      }
      img = out;
    }
    const re = Float64Array.from(img), im = new Float64Array(N * N);
    PHYS.fft2d(re, im, N, false);
    kRe = re; kIm = im;
    if (art.motion) {
      // the head moves between phase-encode lines: a position-dependent phase error per row
      for (let y = 0; y < N; y++) {
        const shiftPx = 2.2 * Math.sin(y * 0.9), ky = y < N / 2 ? y : y - N;
        for (let x = 0; x < N; x++) {
          const kx = x < N / 2 ? x : x - N;
          const ph = (-2 * Math.PI * (kx * shiftPx * 0.6 + ky * shiftPx * 0.2)) / N, c = Math.cos(ph), s = Math.sin(ph);
          const i = y * N + x, r = kRe[i], m = kIm[i];
          kRe[i] = r * c - m * s; kIm[i] = r * s + m * c;
        }
      }
    }
    if (art.door) {
      // RF leaking in through the open door: a narrowband signal at one readout frequency, every line
      const col = Math.round(N * 0.31);
      for (let y = 0; y < N; y++) { kRe[y * N + col] += 1800 * Math.cos(y * 2.1); kIm[y * N + col] += 1800 * Math.sin(y * 2.1); }
    }
  };

  const kc = canvas(176), ic = canvas(176);
  const kImg = new ImageData(N, N), iImg = new ImageData(N, N);
  const off1 = document.createElement('canvas'); off1.width = off1.height = N;
  const order_ = () => order === 'linear' ? [...Array(N).keys()] : [...Array(N).keys()].sort((a, b) => Math.abs(a - N / 2) - Math.abs(b - N / 2));
  let seq = order_();

  const paint = () => {
    // k-space magnitude, log-scaled, centre in the middle (shifted rows/cols)
    const h = N >> 1;
    let max = 0;
    const mag = new Float64Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, v = Math.log1p(Math.hypot(kRe[i], kIm[i])); mag[((y + h) % N) * N + ((x + h) % N)] = v; if (v > max) max = v;
    }
    for (let ys = 0; ys < N; ys++) {
      const on = filled[ys];
      for (let x = 0; x < N; x++) {
        const v = on ? Math.round((mag[ys * N + x] / max) * 255) : 0, o = (ys * N + x) * 4;
        kImg.data[o] = v * 0.62; kImg.data[o + 1] = v * 0.92; kImg.data[o + 2] = v; kImg.data[o + 3] = 255;
      }
    }
    const rec = PHYS.reconstruct(kRe, kIm, N, (ys) => !!filled[ys]);
    let rmax = 0; for (const v of rec) if (v > rmax) rmax = v;
    for (let p = 0; p < N * N; p++) { const v = rmax ? Math.round(Math.min(1, rec[p] / (rmax * 0.95)) * 255) : 0; iImg.data[p * 4] = iImg.data[p * 4 + 1] = iImg.data[p * 4 + 2] = v; iImg.data[p * 4 + 3] = 255; }
    for (const [c, data] of [[kc, kImg], [ic, iImg]] as const) {
      const { w, h: hh } = c.fit(); const g = c.g;
      off1.getContext('2d')!.putImageData(data, 0, 0);
      g.fillStyle = '#0d1012'; g.fillRect(0, 0, w, hh);
      const s = Math.min(w, hh); g.imageSmoothingEnabled = c === ic;
      g.drawImage(off1, (w - s) / 2, 0, s, s);
    }
    ro.set('lines', `${rowsDone} / ${N}`);
    ro.set('time', seqKind === 'SE' ? `${fmt((rowsDone * PHYS.PRESETS[preset].TR) / 1000, 0)} s` : `${fmt(rowsDone * 0.8, 0)} ms`);
  };

  // gradient coils pulse in 3D with every line
  const coils = ['Gradient_X_saddles', 'Gradient_Y_saddles', 'Gradient_Z_coil'].map((n) => stage.scene.getObjectByName(n) as THREE.Mesh | undefined)
    .filter((m): m is THREE.Mesh => !!m).map((mesh) => {
      const orig = mesh.material as THREE.MeshStandardMaterial;
      const mat = orig.clone(); mat.emissive = new THREE.Color(1, 0.55, 0.28); mat.emissiveIntensity = 0;
      mat.onBeforeCompile = orig.onBeforeCompile; mat.customProgramCacheKey = orig.customProgramCacheKey;
      mesh.material = mat;
      return { mat, restore: () => { mesh.material = orig; mat.dispose(); } };
    });
  const flash = (k: number) => { for (const c of coils) c.mat.emissiveIntensity = Math.max(c.mat.emissiveIntensity, k); };

  // the RF door swings with the zipper artefact
  const pivot = stage.scene.getObjectByName('Door_pivot');
  let doorAngle = 0;

  const reset = () => { filled = new Uint8Array(N); rowsDone = 0; seq = order_(); build(); paint(); };
  const ro = readouts([['lines', 'Phase-encode lines'], ['time', 'Scan time so far']]);
  const play = el('button', { class: 'btn small primary', onclick: () => { audio.ensure(); playing = !playing; play.textContent = playing ? 'Pause' : 'Scan'; if (rowsDone >= N) reset(); } }, 'Scan');
  const rs = el('button', { class: 'btn small', onclick: () => { playing = false; play.textContent = 'Scan'; reset(); } }, 'Clear');
  const ps = seg<string>([['T1', 'T1'], ['T2', 'T2'], ['PD', 'PD']], preset, (v) => { preset = v; build(); paint(); });
  const ss = seg<'SE' | 'EPI'>([['SE', 'Spin echo'], ['EPI', 'EPI']], seqKind, (v) => { seqKind = v; });
  const os = seg<'linear' | 'centre'>([['linear', 'Top to bottom'], ['centre', 'Centre out']], order, (v) => { order = v; reset(); });
  const toggle = (key: keyof typeof art, label: string) => {
    const b = el('button', { class: 'btn small', 'aria-pressed': 'false', onclick: () => { art[key] = !art[key]; b.setAttribute('aria-pressed', String(art[key])); b.classList.toggle('primary', art[key]); build(); paint(); } }, label);
    return b;
  };
  const box = plateBox('k-space → image', `${N} × ${N}`);
  box.append(el('div', { class: 'row' }, play, rs, ss.el), el('div', { class: 'row' }, ps.el, os.el),
    el('div', { class: 'row', style: 'display:grid;grid-template-columns:1fr 1fr;gap:6px' }, kc.el, ic.el),
    el('div', { class: 'label-row' }, el('span', {}, 'k-space (raw data)'), el('span', {}, 'image (inverse FFT)')), ro.el);
  const abox = plateBox('Break it', 'artefacts');
  abox.append(el('div', { class: 'row' }, toggle('motion', 'Patient moves'), toggle('metal', 'Metal implant'), toggle('door', 'RF door left open')),
    el('p', { class: 'note' }, 'Fill k-space centre-out and the image appears almost at once: the centre holds the contrast, the edges the detail. Movement smears copies of the head along the phase direction; metal leaves a void and bends the anatomy beside it; radio leaking in through an open door draws a bright line across the image.'));
  root.append(box, abox);
  reset();

  const off = stage.onFrame((dt) => {
    for (const c of coils) c.mat.emissiveIntensity = Math.max(0, c.mat.emissiveIntensity - dt * 6);
    const target = art.door ? -1.6 : 0;
    if (pivot && doorAngle !== target) { doorAngle += Math.sign(target - doorAngle) * Math.min(Math.abs(target - doorAngle), dt * 1.2); pivot.rotation.y = doorAngle; }
    if (!playing || rowsDone >= N) return;
    acc += dt;
    const perLine = seqKind === 'SE' ? 0.11 : 0.012;      // display seconds per line (SE slowed, EPI near real)
    let painted = false;
    while (acc >= perLine && rowsDone < N) {
      acc -= perLine;
      filled[seq[rowsDone]] = 1; rowsDone++;
      if (seqKind === 'SE') { audio.knock(undefined, 0.45, 1); audio.knock(audio.now + 0.035, 0.3, 1.15); flash(1.8); }
      else if (rowsDone % 16 === 1) { audio.buzz(undefined, 0.2); flash(1.2); }
      painted = true;
    }
    if (painted && (seqKind === 'SE' || rowsDone % 8 === 0 || rowsDone >= N)) paint();
    if (rowsDone >= N) { playing = false; play.textContent = 'Scan again'; paint(); }
  });
  return { dispose: () => { off(); for (const c of coils) c.restore(); if (pivot) pivot.rotation.y = 0; } };
};
