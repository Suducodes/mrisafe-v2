import * as THREE from 'three';
import type { Stage } from '../engine/stage';
import { el } from '../ui/dom';

export interface Objective {
  step: string;              // "Step 2 of 5 · Equipment verification"
  text: string;              // what to do
  how: string;               // how to do it with these controls
  target: THREE.Vector3 | null;
  label: string;             // what the marker points at
}

const SEEN_KEY = 'mrisafe.walkhelp.seen';

/**
 * What to do next, on screen like a game: the objective at the top, a marker on the thing to go to
 * (it slides to the screen edge and points when the thing is behind you or off to the side), a label
 * on whatever is under the cursor that can be used, and a card with the controls.
 */
export class Guide {
  private readonly banner: HTMLElement;
  private readonly stepEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly howEl: HTMLElement;
  private readonly marker: HTMLElement;
  private readonly markerLabel: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly legend: HTMLElement;
  private readonly help: HTMLElement;
  private objective: Objective | null = null;
  private shown = false;
  private readonly v = new THREE.Vector3();

  constructor(private readonly stage: Stage, host: HTMLElement) {
    this.stepEl = el('div', { class: 'obj-step' });
    this.textEl = el('div', { class: 'obj-text' });
    this.howEl = el('div', { class: 'obj-how' });
    this.banner = el('div', { class: 'objective', 'aria-live': 'polite' }, this.stepEl, this.textEl, this.howEl);
    this.markerLabel = el('span', { class: 'wp-label' });
    this.marker = el('div', { class: 'waypoint' }, el('span', { class: 'wp-ring' }), el('span', { class: 'wp-arrow' }), this.markerLabel);
    this.tip = el('div', { class: 'hover-tip' });
    const key = (k: string) => el('kbd', {}, k);
    this.legend = el('div', { class: 'walk-legend' },
      el('span', {}, key('W'), key('A'), key('S'), key('D'), ' walk'), el('span', {}, key('Shift'), ' run'),
      el('span', {}, 'drag to look'), el('span', {}, 'click the floor to go there'), el('span', {}, key('H'), ' help'));
    this.help = el('div', { class: 'walk-help', role: 'dialog', 'aria-label': 'How to move' },
      el('h3', {}, 'You are in the MRI suite'),
      el('p', {}, 'Walk it like a game. The bar at the top always says what to do next, and the blue marker shows where.'),
      el('ul', {},
        el('li', {}, el('span', { class: 'keys' }, key('W'), key('A'), key('S'), key('D')), el('span', {}, 'walk forward, left, back, right (or the arrow keys; ← → turn)')),
        el('li', {}, el('span', { class: 'keys' }, key('Shift')), el('span', {}, 'hold to walk faster')),
        el('li', {}, el('span', { class: 'keys' }, el('span', { class: 'mouse' }, 'drag')), el('span', {}, 'look around')),
        el('li', {}, el('span', { class: 'keys' }, el('span', { class: 'mouse' }, 'click')), el('span', {}, 'the floor to walk there; equipment, the console or the patient to use them')),
        el('li', {}, el('span', { class: 'keys' }, key('1'), key('5')), el('span', {}, 'attest checkpoints T1 to T5 when a step is complete'))),
      el('button', { class: 'btn primary', onclick: () => this.closeHelp() }, 'Start walking'));
    for (const n of [this.banner, this.marker, this.tip, this.legend, this.help]) n.hidden = true;
    host.append(this.banner, this.marker, this.tip, this.legend, this.help);
    addEventListener('keydown', (e) => {
      if (!this.shown || (e.target instanceof Element && e.target.closest('input, textarea, select'))) return;
      if (e.key.toLowerCase() === 'h') this.help.hidden ? this.openHelp() : this.closeHelp();
      if (e.key === 'Enter' && !this.help.hidden) this.closeHelp();
    });
    stage.onFrame(() => this.place());
  }

  show(on: boolean) {
    this.shown = on;
    this.banner.hidden = this.legend.hidden = !on;
    if (!on) { this.marker.hidden = true; this.tip.hidden = true; this.help.hidden = true; return; }
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* private mode */ }
    if (!seen) this.openHelp();
  }

  openHelp() { this.help.hidden = false; (this.help.querySelector('button') as HTMLButtonElement).focus(); }
  closeHelp() {
    this.help.hidden = true;
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ }
  }

  set(o: Objective | null) {
    this.objective = o;
    this.banner.classList.toggle('done', !o?.text);
    this.stepEl.textContent = o?.step ?? '';
    this.textEl.textContent = o?.text ?? '';
    this.howEl.textContent = o?.how ?? '';
    this.markerLabel.textContent = o?.label ?? '';
    // a new objective pulses once so the change is noticed
    this.banner.classList.remove('pulse'); void this.banner.offsetWidth; this.banner.classList.add('pulse');
  }

  /** Label under the cursor for something that can be used (null hides it). */
  hover(text: string | null, x = 0, y = 0) {
    this.tip.hidden = !text || !this.shown;
    if (!text) return;
    this.tip.textContent = text;
    this.tip.style.transform = `translate(${x + 16}px, ${y + 14}px)`;
  }

  private place() {
    const o = this.objective;
    if (!this.shown || !o?.target) { this.marker.hidden = true; return; }
    const cam = this.stage.camera;
    this.v.copy(o.target).project(cam);
    const behind = this.v.z > 1;
    let x = (this.v.x * 0.5 + 0.5) * innerWidth, y = (-this.v.y * 0.5 + 0.5) * innerHeight;
    // the free part of the screen between the side panels
    const wide = innerWidth > 900;
    const L = (wide ? 300 : 20) + 24, R = innerWidth - (wide ? 440 : 20) - 24, T = 150, B = innerHeight - 70;
    const onScreen = !behind && x > L && x < R && y > T && y < B;
    if (!onScreen) {
      // point along the direction to the target from the middle of the free area
      const cx = (L + R) / 2, cy = (T + B) / 2;
      let dx = x - cx, dy = y - cy;
      if (behind) { dx = -dx; dy = -dy; if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dx = 1; }
      const s = Math.min((R - cx) / Math.max(Math.abs(dx), 1e-3), (B - cy) / Math.max(Math.abs(dy), 1e-3));
      x = cx + dx * s; y = cy + dy * s;
      this.marker.style.setProperty('--angle', `${Math.atan2(dy, dx)}rad`);
    }
    const dist = cam.position.distanceTo(o.target);
    this.markerLabel.textContent = `${o.label} · ${dist.toFixed(1)} m`;
    this.marker.classList.toggle('edge', !onScreen);
    this.marker.hidden = false;
    this.marker.style.transform = `translate(${x}px, ${y}px)`;
  }
}
