import { Stage } from './engine/stage';
import { loadBakedLighting } from './engine/lighting';
import content from './content/chapters.json';
import type { Chapter } from './director/beats';

const status = document.getElementById('status')!;
const stage = new Stage(document.getElementById('stage') as HTMLCanvasElement);
const chapters = content.chapters as Chapter[];
if (import.meta.env.DEV) Object.assign(window, { __stage: stage });   // inspection from the console

// lighting first (small: manifest, two atlases, one probe) so geometry arrives already lit
const lighting = await loadBakedLighting(stage.renderer, stage.scene).catch((e) => {
  console.warn('[lighting] no bake found, using the stand-in environment', e);
  return null;
});
let baked = 0;
stage.onAsset = (root) => { baked += lighting?.apply(root) ?? 0; };

const assets = ['/assets/scanner.glb', '/assets/suite.glb'];
const results = await Promise.allSettled(assets.map((u) => stage.loadAsset(u)));
const missing = assets.filter((_, i) => results[i].status === 'rejected');
status.textContent = missing.length
  ? `Missing ${missing.join(', ')} (run tools/build-assets.ps1)`
  : `${stage.layers.size} layers · ${baked} baked meshes · ${chapters.length} chapters`;
