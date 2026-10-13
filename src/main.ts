import { Stage } from './engine/stage';
import content from './content/chapters.json';
import type { Chapter } from './director/beats';

const status = document.getElementById('status')!;
const stage = new Stage(document.getElementById('stage') as HTMLCanvasElement);
const chapters = content.chapters as Chapter[];

stage.loadScanner('/assets/scanner.glb')
  .then(() => { status.textContent = `${stage.layers.size} layers · ${chapters.length} chapters`; })
  .catch(() => { status.textContent = 'Scanner asset not built yet (assets-src/scanner.blend → public/assets/scanner.glb)'; });
