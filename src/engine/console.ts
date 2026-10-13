import * as THREE from 'three';
import type { Stage } from './stage';
import { PHYS } from '../physics/sir';

/**
 * The control-room monitors: a scanner console drawn on canvases. Left: patient and protocol queue.
 * Right: image viewer with Allwyn Sir's head phantom. Small screen: magnet status. Unlit, toned
 * down so they glow like real displays instead of clipping under AgX.
 */
const W = 960, H = 576;
const INK = '#d7e2e4', DIM = '#7f9195', ACC = '#7fd3c4', BG = '#0d1214', RULE = 'rgba(160,190,200,.16)';

function screen(stage: Stage, name: string) {
  const mesh = stage.scene.getObjectByName(name) as THREE.Mesh | undefined;
  if (!mesh) return null;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // the screen is a thin box whose default UVs are a cube cross; project fresh ones across its face:
  // seen by the operator (looking +x), +z is to the right and +y is up
  const geo = mesh.geometry.clone(); geo.computeBoundingBox();
  const bb = geo.boundingBox!, pos = geo.attributes.position, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getZ(i) - bb.min.z) / (bb.max.z - bb.min.z);
    uv[i * 2 + 1] = (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  mesh.geometry = geo;
  mesh.material = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.62, 0.62, 0.62), toneMapped: true });
  return { g: c.getContext('2d')!, tex, mesh };
}

function header(g: CanvasRenderingContext2D, title: string, right: string) {
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  g.fillStyle = '#141b1e'; g.fillRect(0, 0, W, 54);
  g.fillStyle = INK; g.font = '600 26px "Inter Tight", Arial'; g.fillText(title, 26, 36);
  g.fillStyle = DIM; g.font = '20px "JetBrains Mono", Consolas, monospace'; g.textAlign = 'right'; g.fillText(right, W - 26, 36); g.textAlign = 'left';
}

export function startConsole(stage: Stage) {
  const left = screen(stage, 'Mon_console_L_screen');
  const right = screen(stage, 'Mon_console_R_screen');
  const mon = screen(stage, 'Mon_monitoring_screen');
  // the phantom image once, T1-weighted
  const N = 128, img = PHYS.phantomImage(PHYS.headPhantom(N), 500, 15);
  let max = 0; for (const v of img) max = Math.max(max, v);
  const phantom = document.createElement('canvas'); phantom.width = phantom.height = N;
  const id = new ImageData(N, N);
  for (let p = 0; p < N * N; p++) { const v = Math.round((img[p] / max) * 235); id.data[p * 4] = id.data[p * 4 + 1] = id.data[p * 4 + 2] = v; id.data[p * 4 + 3] = 255; }
  phantom.getContext('2d')!.putImageData(id, 0, 0);

  const protocols = [['Localizer', '0:18', 'done'], ['T1 SE axial', '2:08', 'done'], ['T2 TSE axial', '3:12', 'running'], ['FLAIR axial', '3:40', 'queued'], ['DWI EPI', '1:05', 'queued']];
  let t = 0;
  const draw = () => {
    const now = new Date(); const clock = now.toTimeString().slice(0, 5);
    if (left) {
      const g = left.g; header(g, 'Examination', clock);
      g.fillStyle = INK; g.font = '600 24px "Inter Tight", Arial'; g.fillText('Training Patient A', 26, 98);
      g.fillStyle = DIM; g.font = '19px "JetBrains Mono", Consolas, monospace'; g.fillText('MRN TR-00417  ·  DOB 1984-03-12  ·  Head first, supine', 26, 128);
      g.fillStyle = INK; g.font = '20px "Inter Tight", Arial'; g.fillText('MRI brain without contrast', 26, 160);
      protocols.forEach(([n, d, s], i) => {
        const y = 210 + i * 62;
        g.strokeStyle = RULE; g.beginPath(); g.moveTo(26, y - 34); g.lineTo(W - 26, y - 34); g.stroke();
        g.fillStyle = s === 'running' ? ACC : s === 'done' ? INK : DIM; g.font = '22px "Inter Tight", Arial'; g.fillText(n, 26, y);
        g.fillStyle = DIM; g.font = '19px "JetBrains Mono", Consolas, monospace'; g.fillText(d, 560, y); g.fillText(s, 680, y);
        if (s === 'running') { const k = (t * 0.02) % 1; g.fillStyle = 'rgba(127,211,196,.18)'; g.fillRect(26, y + 10, (W - 52), 6); g.fillStyle = ACC; g.fillRect(26, y + 10, (W - 52) * k, 6); }
      });
      left.tex.needsUpdate = true;
    }
    if (right) {
      const g = right.g; header(g, 'Viewer · T1 SE axial', 'slice 12 / 24');
      const s = H - 90; g.imageSmoothingEnabled = true; g.drawImage(phantom, 26, 72, s, s);
      g.drawImage(phantom, 26 + s + 24, 72, s * 0.62, s * 0.62);
      g.fillStyle = DIM; g.font = '18px "JetBrains Mono", Consolas, monospace';
      g.fillText('TR 500  TE 15', 26 + s + 24, 72 + s * 0.62 + 34); g.fillText('FOV 230 mm', 26 + s + 24, 72 + s * 0.62 + 62); g.fillText('256 × 256', 26 + s + 24, 72 + s * 0.62 + 90);
      right.tex.needsUpdate = true;
    }
    if (mon) {
      const g = mon.g; header(g, 'Magnet', 'normal');
      const rows: [string, string][] = [['B0', '1.500 T'], ['Helium level', '96 %'], ['Cold head', 'running'], ['Shield temp.', '43 K'], ['O₂ (room)', '20.9 %']];
      rows.forEach(([k, v], i) => { const y = 120 + i * 84; g.fillStyle = DIM; g.font = '26px "Inter Tight", Arial'; g.fillText(k, 30, y); g.fillStyle = i === 4 ? ACC : INK; g.font = '600 34px "JetBrains Mono", Consolas, monospace'; g.textAlign = 'right'; g.fillText(v, W - 30, y); g.textAlign = 'left'; });
      mon.tex.needsUpdate = true;
    }
  };
  document.fonts?.ready.then(draw);
  draw();
  let acc = 0;
  stage.onFrame((dt) => { t += dt * 60; acc += dt; if (acc > 0.5) { acc = 0; draw(); } });
}
