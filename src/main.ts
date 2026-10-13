import { Stage } from './engine/stage';
import content from './content/chapters.json';
import type { Chapter } from './director/beats';

const status = document.getElementById('status')!;
const stage = new Stage(document.getElementById('stage') as HTMLCanvasElement);
const chapters = content.chapters as Chapter[];

const assets = ['/assets/scanner.glb', '/assets/suite.glb'];
Promise.allSettled(assets.map((u) => stage.loadAsset(u))).then((results) => {
  const missing = assets.filter((_, i) => results[i].status === 'rejected');
  status.textContent = missing.length
    ? `Missing ${missing.join(', ')} (build from assets-src/blender)`
    : `${stage.layers.size} layers · ${chapters.length} chapters`;
});
