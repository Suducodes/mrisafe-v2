import * as THREE from 'three';
import type { Stage } from './stage';

export type V3 = [number, number, number];
export interface Shot { eye: V3; target: V3; via?: V3[]; seconds?: number; fov?: number }

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Flies the camera between authored shots. Eye and target travel separate curves (the eye can
 * pass through waypoints such as the RF window); orbit controls hand back on arrival.
 */
export class CameraDirector {
  private flight: null | {
    eye: THREE.CatmullRomCurve3; target: THREE.CatmullRomCurve3; t: number; seconds: number; done: () => void;
  } = null;

  constructor(private readonly stage: Stage) {
    stage.onFrame((dt) => this.tick(dt));
  }

  get flying() { return this.flight !== null; }

  fly(shot: Shot): Promise<void> {
    const cam = this.stage.camera, ctl = this.stage.controls;
    const from = cam.position.clone(), fromT = ctl.target.clone();
    const to = new THREE.Vector3(...shot.eye), toT = new THREE.Vector3(...shot.target);
    const dist = from.distanceTo(to) + fromT.distanceTo(toT);
    const seconds = shot.seconds ?? THREE.MathUtils.clamp(0.9 + dist * 0.28, 1.1, 3.4);
    const via = (shot.via ?? []).map((v) => new THREE.Vector3(...v));
    this.flight?.done();
    ctl.enabled = false;
    return new Promise((done) => {
      this.flight = {
        eye: new THREE.CatmullRomCurve3([from, ...via, to], false, 'centripetal'),
        target: new THREE.CatmullRomCurve3([fromT, toT]),
        t: 0, seconds, done,
      };
    });
  }

  /** Jump without flying (first frame, reduced motion). */
  cut(shot: Shot) {
    this.flight?.done(); this.flight = null;
    this.stage.camera.position.set(...shot.eye);
    this.stage.controls.target.set(...shot.target);
    this.stage.controls.enabled = true;
  }

  private tick(dt: number) {
    const f = this.flight;
    if (!f) return;
    f.t = Math.min(1, f.t + dt / f.seconds);
    const k = ease(f.t);
    this.stage.camera.position.copy(f.eye.getPoint(k));
    this.stage.controls.target.copy(f.target.getPoint(k));
    if (f.t >= 1) {
      this.flight = null;
      this.stage.controls.enabled = true;
      f.done();
    }
  }
}
