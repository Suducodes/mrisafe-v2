import type { Stage } from './engine/stage';
import { LayerSystem } from './engine/layers';
import { CameraDirector } from './engine/director';
import { ScannerAudio } from './audio/scanner';
import { Callouts } from './ui/callouts';
import { Learn } from './learn/learn';
import { Train } from './train/train';
import { HOME_SHOT } from './learn/chapters';
import { el } from './ui/dom';
import { Coach } from './coach/coach';
import { Controller } from './input/controller';
import { Hands } from './input/hands';
import * as THREE from 'three';
import { Studio } from './engine/studio';

export type Mode = 'home' | 'learn' | 'train';

/** The three places in the app, and the one scene they share. */
export class App {
  readonly layers: LayerSystem;
  readonly director: CameraDirector;
  readonly audio = new ScannerAudio();
  readonly callouts: Callouts;
  readonly learn: Learn;
  readonly train: Train;
  readonly coach: Coach;
  readonly controller: Controller;
  readonly hands: Hands;
  private mode: Mode = 'home';
  private readonly home: HTMLElement;
  private readonly modeButtons: Record<'learn' | 'train', HTMLButtonElement>;

  readonly studio: Studio;

  constructor(readonly stage: Stage, host: HTMLElement, probe: THREE.Texture | null) {
    this.layers = new LayerSystem(stage);
    this.layers.alwaysHidden.add('patient');               // the training patient appears only in Train
    this.layers.setHidden([], [], true);
    this.studio = new Studio(stage, probe);
    this.director = new CameraDirector(stage);
    this.callouts = new Callouts(stage, host);
    this.callouts.ignore = (o, p) => this.layers.removedByCut(o, p);
    const ctx = { stage, layers: this.layers, director: this.director, audio: this.audio, studio: this.studio };
    this.learn = new Learn(ctx, this.callouts, host);
    this.train = new Train(ctx, this.callouts, host);
    this.coach = new Coach(host, () => (this.mode === 'learn' ? this.learn.context() : this.mode === 'train' ? this.train.context() : {}));

    this.home = el('section', { class: 'home' },
      el('h1', {}, 'An MRI suite you can take apart.'),
      el('p', {}, 'A 1.5 T scanner and its shielded room, built to scale, with physics computed from the real geometry. Learn how it works, then practise the safety checks that keep people safe around it.'),
      el('div', { class: 'entries' },
        el('button', { class: 'entry', onclick: () => this.go('learn') }, el('b', {}, 'Learn how it works'), el('span', {}, '14 chapters · from the magnet to the image')),
        el('button', { class: 'entry', onclick: () => this.go('train') }, el('b', {}, 'Train the safety checks'), el('span', {}, 'screening, equipment, Zone IV access'))),
      el('p', { class: 'credit' }, 'After MRISafe Twin by Allwyn Sir. Educational simulation: not a substitute for local MR safety procedures or an MR safety officer.'));
    const sound = el('button', { class: 'icon', title: 'Sound', 'aria-pressed': 'true', onclick: () => {
      this.audio.ensure(); this.audio.setMuted(!this.audio.muted); sound.setAttribute('aria-pressed', String(!this.audio.muted)); sound.textContent = this.audio.muted ? 'Sound off' : 'Sound on';
    } }, 'Sound on');
    this.modeButtons = {
      learn: el('button', { onclick: () => this.go('learn') }, 'Learn'),
      train: el('button', { onclick: () => this.go('train') }, 'Train'),
    };
    const ctlBtn = el('button', { title: 'Connect the handheld controller', onclick: () => this.controller.connect() }, 'Controller');
    this.controller = this.makeController(ctlBtn);
    ctlBtn.hidden = !this.controller.supported;
    const handBtn = el('button', { title: 'Control with your hands (webcam, processed in this browser)', onclick: () => this.hands.toggle() }, 'Hands');
    this.hands = this.makeHands(handBtn);
    handBtn.hidden = !window.isSecureContext || !navigator.mediaDevices;
    host.append(this.home, el('div', { class: 'modebar' }, this.modeButtons.learn, this.modeButtons.train,
      el('button', { onclick: () => this.coach.toggle() }, 'Ask'), ctlBtn, handBtn, sound,
      el('button', { onclick: () => this.go('home') }, 'Home')));
    addEventListener('pointerdown', () => this.audio.ensure(), { once: true });
    this.director.cut(HOME_SHOT);
    this.setBodyMode('home');
  }

  /** Compile every shader the session can need before the first frame that needs it. */
  async warmUp() {
    const { renderer, scene, camera, composer } = this.stage;
    const hall = this.studio.group, was = hall.visible;
    hall.visible = true;
    // everything goes through the composer's scene target: those programs differ from on-screen ones
    // (tone mapping and the sRGB conversion happen later, in the output pass)
    const intoTarget = <T>(f: () => T) => {
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(composer.readBuffer);
      try { return f(); } finally { renderer.setRenderTarget(prev); }
    };
    await this.layers.warmUp(
      () => intoTarget(() => renderer.compileAsync(scene, camera)),
      () => {
        const culled: THREE.Object3D[] = [];
        scene.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
        intoTarget(() => renderer.render(scene, camera));
        for (const o of culled) o.frustumCulled = true;
      });
    hall.visible = was;
    // and the post chain, bloom included (it first runs at the first peel)
    const bloom = this.stage.bloom, on = bloom.enabled;
    bloom.enabled = true; composer.render(0); bloom.enabled = on;
  }

  /**
   * Allwyn Sir's ESP32 controller. Pads mean his Train/Learn pad map; tilt orbits the camera;
   * flicks change chapter; the magnetometer wand reading goes in the button's title. The button
   * only shows "connected" once the device has actually said hello.
   */
  private makeController(btn: HTMLButtonElement) {
    const learnPads: Record<string, () => void> = {
      T1: () => this.learn.prev(), T2: () => this.learn.next(), T3: () => this.learn.peel(1),
      T4: () => this.learn.peel(-1), T5: () => this.learn.toggleCut(), T6: () => this.learn.resetView(),
    };
    return new Controller({
      status: (text, ok) => { btn.title = text; btn.textContent = ok ? 'Controller ●' : 'Controller'; },
      pad: (id, seq) => { if (this.mode === 'train') this.train.pad(id, 'hw', seq); else if (this.mode === 'learn') learnPads[id]?.(); },
      gesture: (g) => {
        if (this.mode !== 'learn') return;
        if (g === 'flick_left') this.learn.prev();
        if (g === 'flick_right') this.learn.next();
        if (g === 'double_tap') this.learn.resetView();
      },
      tilt: (dAz, dEl) => {
        const c = this.stage.controls;
        const sph = new THREE.Spherical().setFromVector3(this.stage.camera.position.clone().sub(c.target));
        sph.theta += dAz;
        sph.phi = THREE.MathUtils.clamp(sph.phi - dEl, 0.15, Math.PI - 0.15);
        this.stage.camera.position.copy(c.target).add(new THREE.Vector3().setFromSpherical(sph));
      },
      wand: (text, _level, dmag) => { btn.title = `Wand meter: ${text} (${dmag.toFixed(0)} µT change)`; },
    });
  }

  /** Allwyn Sir's hand control: a pinch taps whatever is under the hand cursor (UI or 3D). */
  private makeHands(btn: HTMLButtonElement) {
    const orbit = (dAz: number, dEl: number) => {
      const c = this.stage.controls;
      const sph = new THREE.Spherical().setFromVector3(this.stage.camera.position.clone().sub(c.target));
      sph.theta += dAz; sph.phi = THREE.MathUtils.clamp(sph.phi - dEl, 0.15, Math.PI - 0.15);
      this.stage.camera.position.copy(c.target).add(new THREE.Vector3().setFromSpherical(sph));
    };
    return new Hands({
      status: (text, on) => { btn.title = text; btn.textContent = on ? 'Hands ●' : 'Hands'; },
      tap: (x, y) => {
        const target = document.elementFromPoint(x, y) as HTMLElement | null;
        if (target && target !== this.stage.renderer.domElement) { target.click(); return; }
        const canvas = this.stage.renderer.domElement;
        for (const type of ['pointerdown', 'pointerup']) canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }));
      },
      orbit: (dx, dy) => orbit(-dx * Math.PI * 1.4, dy * Math.PI * 0.9),
      zoom: (dz) => {
        const c = this.stage.controls, off = this.stage.camera.position.clone().sub(c.target);
        off.multiplyScalar(THREE.MathUtils.clamp(Math.exp(-dz * 1.6), 0.8, 1.25));
        if (off.length() > 0.25 && off.length() < c.maxDistance) this.stage.camera.position.copy(c.target).add(off);
      },
      reset: () => { if (this.mode === 'learn') this.learn.resetView(); },
    });
  }

  /** Route from the URL hash: #learn/ch05, #train. */
  start() {
    const [mode, arg] = location.hash.slice(1).split('/');
    if (mode === 'learn') this.go('learn', arg);
    else if (mode === 'train') this.go('train');
  }

  async go(mode: Mode, arg?: string) {
    if (mode === this.mode) return;
    const from = this.mode;
    if (from === 'learn') this.learn.leave();
    if (from === 'train') this.train.leave();
    this.mode = mode;
    this.setBodyMode(mode);
    this.home.classList.toggle('gone', mode !== 'home');
    this.home.style.pointerEvents = mode === 'home' ? '' : 'none';
    if (mode !== 'learn') this.studio.set(false);          // the real suite re-forms around the scanner
    if (mode === 'home') {
      history.replaceState(null, '', location.pathname);
      this.layers.setHidden([]); this.layers.setCut(false);
      await this.director.fly({ ...HOME_SHOT, via: [[-1.4, 1.62, 2.4], [-2.62, 1.55, 1.40]] });
    } else if (mode === 'learn') {
      const idx = arg ? Math.max(0, Number(arg.replace('ch', '')) - 1) : 0;
      await this.learn.enter(from === 'home' && !arg, idx);
    } else {
      await this.train.enter(from === 'home');
    }
  }

  private setBodyMode(mode: Mode) {
    document.body.classList.remove('mode-home', 'mode-learn', 'mode-train');
    document.body.classList.add(`mode-${mode}`);
    for (const [m, b] of Object.entries(this.modeButtons)) b.setAttribute('aria-pressed', String(m === mode));
  }
}
