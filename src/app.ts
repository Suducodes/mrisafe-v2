import type { Stage } from './engine/stage';
import { LayerSystem } from './engine/layers';
import { CameraDirector } from './engine/director';
import { ScannerAudio } from './audio/scanner';
import { Callouts } from './ui/callouts';
import { Learn } from './learn/learn';
import { Train } from './train/train';
import { HOME_SHOT } from './learn/chapters';
import { el } from './ui/dom';

export type Mode = 'home' | 'learn' | 'train';

/** The three places in the app, and the one scene they share. */
export class App {
  readonly layers: LayerSystem;
  readonly director: CameraDirector;
  readonly audio = new ScannerAudio();
  readonly callouts: Callouts;
  readonly learn: Learn;
  readonly train: Train;
  private mode: Mode = 'home';
  private readonly home: HTMLElement;
  private readonly modeButtons: Record<'learn' | 'train', HTMLButtonElement>;

  constructor(readonly stage: Stage, host: HTMLElement) {
    this.layers = new LayerSystem(stage);
    this.director = new CameraDirector(stage);
    this.callouts = new Callouts(stage, host);
    this.callouts.ignore = (o, p) => this.layers.removedByCut(o, p);
    const ctx = { stage, layers: this.layers, director: this.director, audio: this.audio };
    this.learn = new Learn(ctx, this.callouts, host);
    this.train = new Train(ctx, this.callouts, host);

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
    host.append(this.home, el('div', { class: 'modebar' }, this.modeButtons.learn, this.modeButtons.train, sound,
      el('button', { onclick: () => this.go('home') }, 'Home')));
    addEventListener('pointerdown', () => this.audio.ensure(), { once: true });
    this.director.cut(HOME_SHOT);
    this.setBodyMode('home');
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
