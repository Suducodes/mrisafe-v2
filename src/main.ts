import './ui/app.css';
import { Stage } from './engine/stage';
import { loadBakedLighting } from './engine/lighting';
import { App } from './app';
import { startConsole } from './engine/console';

const status = document.getElementById('status')!;
const stage = new Stage(document.getElementById('stage') as HTMLCanvasElement);
const ASSETS = `${import.meta.env.BASE_URL}assets/`;      // relative base: works from any sub-path (GitHub Pages)

// lighting first (small: manifest, two atlases, one probe) so geometry arrives already lit
const lighting = await loadBakedLighting(stage.renderer, stage.scene, ASSETS).catch((e) => {
  console.warn('[lighting] no bake found, using the stand-in environment', e);
  return null;
});
stage.onAsset = (root) => { lighting?.apply(root); };

const assets = [`${ASSETS}scanner.glb`, `${ASSETS}suite.glb`];
const results = await Promise.allSettled(assets.map((u) => stage.loadAsset(u)));
const missing = assets.filter((_, i) => results[i].status === 'rejected');
if (missing.length) {
  status.textContent = `Missing ${missing.join(', ')} (run tools/build-assets.ps1)`;
} else {
  startConsole(stage);
  const app = new App(stage, document.getElementById('ui')!, lighting?.probe ?? null);
  status.textContent = 'Preparing the scanner…';
  await app.warmUp();
  status.textContent = '';
  app.start();
  if (import.meta.env.DEV) Object.assign(window, { __stage: stage, __app: app, __THREE: await import('three') });
}
