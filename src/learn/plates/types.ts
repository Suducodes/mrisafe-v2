import type { Stage } from '../../engine/stage';
import type { LayerSystem } from '../../engine/layers';
import type { CameraDirector } from '../../engine/director';
import type { ScannerAudio } from '../../audio/scanner';
import type { Studio } from '../../engine/studio';

export interface PlateCtx {
  stage: Stage;
  layers: LayerSystem;
  director: CameraDirector;
  audio: ScannerAudio;
  studio: Studio;
  /** The card body to append the instrument into. */
  root: HTMLElement;
}

/** An instrument for one chapter: builds its DOM and 3D, returns how to take them down. */
export type Plate = (ctx: PlateCtx) => { dispose(): void };
