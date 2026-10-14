import content from '../content/chapters.json';
import type { Chapter } from '../director/beats';
import { STAGING, THROUGH_GLASS, HOME_SHOT } from './chapters';
import { PLATES } from './plates';
import type { PlateCtx } from './plates/types';
import { el, richText } from '../ui/dom';
import type { Callouts } from '../ui/callouts';
import { ROOM_LAYERS } from '../engine/layers';

const CHAPTERS = content.chapters as Chapter[];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Learn {
  private readonly index: HTMLElement;
  private readonly card: HTMLElement;
  private readonly body: HTMLElement;
  private readonly prog: HTMLElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private current = -1;
  private plate: { dispose(): void } | null = null;
  private skipIntro: (() => void) | null = null;
  private active = false;

  constructor(private readonly ctx: Omit<PlateCtx, 'root'>, private readonly callouts: Callouts, host: HTMLElement) {
    this.index = el('nav', { class: 'index', 'aria-label': 'Chapters' });
    let group = '';
    CHAPTERS.forEach((c, i) => {
      if (c.group !== group) { group = c.group; this.index.append(el('h4', {}, group)); }
      this.index.append(el('button', { 'data-i': i, onclick: () => { document.body.classList.remove('index-open'); this.go(i); } },
        el('span', { class: 'n' }, String(i + 1).padStart(2, '0')), c.title));
    });
    this.body = el('div', { class: 'body' });
    this.prog = el('span', { class: 'prog' });
    this.prevBtn = el('button', { class: 'btn', onclick: () => this.go(this.current - 1) }, '←  Back');
    this.nextBtn = el('button', { class: 'btn primary', onclick: () => this.go(this.current + 1) }, 'Next  →');
    this.card = el('article', { class: 'card out', 'aria-live': 'polite' }, this.body,
      el('div', { class: 'foot' }, el('button', { class: 'btn small index-toggle', onclick: () => document.body.classList.toggle('index-open') }, 'Chapters'),
        el('button', { class: 'btn small', title: 'Peel the next layer away (T3); shift-click to restore (T4)', onclick: (e: Event) => this.peel((e as MouseEvent).shiftKey ? -1 : 1) }, 'Peel'),
        el('button', { class: 'btn small', title: 'Open or close the quarter section (T5)', onclick: () => this.toggleCut() }, 'Section'),
        this.prog, this.prevBtn, this.nextBtn));
    this.index.hidden = true;
    host.append(this.index, this.card);
    addEventListener('resize', () => { if (this.current >= 0) this.frame(); });
    addEventListener('keydown', (e) => {
      if (!this.active || (e.target as HTMLElement).closest('input, textarea')) return;
      if (e.key === 'ArrowRight') this.go(this.current + 1);
      if (e.key === 'ArrowLeft') this.go(this.current - 1);
      if (e.key === 'Escape') this.skipIntro?.();
    });
  }

  /** Enter Learn. From home, play the cold open first. */
  async enter(fromHome: boolean, chapter = 0) {
    this.active = true;
    if (fromHome) await this.coldOpen();
    this.index.hidden = false;
    this.go(chapter, true);
  }

  // --- controller pads in Learn (Allwyn Sir's map: prev, next, peel, restore, explode, reset) ----
  private manualPeel = 0;
  private manualCut = false;
  prev() { this.go(this.current - 1); }
  next() { this.go(this.current + 1); }
  peel(step: number) {
    const order = ['covers', 'coldhead', 'cryostat', 'thermal_shield', 'he_vessel', 'liner', 'rf_body_coil', 'rf_shield', 'gradient', 'shims'];
    // wraps: after the innermost layer, the next peel brings everything back
    const next = this.manualPeel + step;
    this.manualPeel = next > order.length ? 0 : Math.max(0, next);
    this.ctx.layers.setHidden(order.slice(0, this.manualPeel));
  }
  toggleCut() { this.manualCut = !this.manualCut; this.ctx.layers.setCut(this.manualCut); }
  resetView() { this.manualPeel = 0; this.go(this.current, true); }

  /** What the coach should know about the current chapter. */
  context() {
    const ch = CHAPTERS[this.current];
    return ch ? { chapter: ch.title, notes: [ch.lead, ch.body, ch.safety].filter(Boolean).join('\n\n').replace(/\*\*/g, '') } : {};
  }

  /** Studio (the room falls away) or the real suite, for chapters that are about the room. */
  private setEnvironment(studio: boolean) {
    for (const l of ROOM_LAYERS) { if (studio) this.ctx.layers.alwaysHidden.add(l); else this.ctx.layers.alwaysHidden.delete(l); }
    this.ctx.studio.set(studio);
    document.body.classList.toggle('theme-dark', studio);       // the console theme suits the dark hall
  }

  leave() {
    this.active = false;
    for (const l of ROOM_LAYERS) this.ctx.layers.alwaysHidden.delete(l);
    document.body.classList.remove('theme-dark');
    this.index.hidden = true;
    this.card.classList.add('out');
    document.body.classList.remove('card-open');
    this.plate?.dispose(); this.plate = null;
    this.callouts.set([]);
    this.ctx.stage.setInsets(0, 0);
    this.current = -1;
  }

  go(i: number, force = false) {
    if (i < 0 || i >= CHAPTERS.length || (i === this.current && !force)) return;
    this.current = i;
    const ch = CHAPTERS[i];
    const st = STAGING[ch.id] ?? STAGING.ch01;
    history.replaceState(null, '', `#learn/${ch.id}`);
    for (const b of this.index.querySelectorAll('button')) b.setAttribute('aria-current', String(Number(b.dataset.i) === i));

    this.plate?.dispose(); this.plate = null;
    this.callouts.set([]);
    this.manualPeel = 0; this.manualCut = !!st.cut;
    this.setEnvironment(st.env !== 'suite');
    this.ctx.layers.setHidden(st.hide ?? [], st.hideObjects ?? []);
    this.ctx.layers.setCut(!!st.cut);
    this.ctx.director.fly(st.shot).then(() => { if (this.current === i) this.callouts.set(st.callouts); });

    const bold = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    this.body.replaceChildren(
      el('div', { class: 'eyebrow' }, el('span', { class: 'num' }, String(i + 1).padStart(2, '0')), ch.group),
      el('h2', {}, ch.title),
      ...(ch.lead ? [el('p', { class: 'lead', html: bold(ch.lead) })] : []),
      richText(ch.body ?? ''),
      ...(ch.safety ? [el('div', { class: 'safety', html: bold(ch.safety) })] : []),
    );
    const make = st.plate ? PLATES[st.plate] : undefined;
    if (make) this.plate = make({ ...this.ctx, root: this.body });
    this.body.scrollTop = 0;
    this.prog.textContent = `${String(i + 1).padStart(2, '0')} / ${CHAPTERS.length}`;
    this.prevBtn.disabled = i === 0;
    this.nextBtn.disabled = i === CHAPTERS.length - 1;
    this.card.classList.remove('out');
    document.body.classList.add('card-open');
    this.frame();
  }

  /** Keep the subject centred in the space the index and card leave free. */
  private frame() {
    const narrow = innerWidth <= 900;
    if (narrow) this.ctx.stage.setInsets(0, 0, Math.min(innerHeight * 0.46, this.card.offsetHeight + 16));
    else this.ctx.stage.setInsets(this.index.hidden ? 0 : 280, 420);
  }

  /**
   * Cold open: from behind the operator, through the RF glass; then the room dissolves in nanotech
   * tiles and falls away, leaving the scanner in a vast dark hall. It comes apart layer by layer down
   * to the superconducting windings, and builds itself back.
   */
  private async coldOpen() {
    const { director, layers } = this.ctx;
    let skipped = false;
    const skipBtn = el('button', { class: 'skip', onclick: () => this.skipIntro?.() }, 'Skip intro  (Esc)');
    document.body.append(skipBtn);
    const skip = new Promise<void>((r) => { this.skipIntro = () => { skipped = true; r(); }; });
    const step = (p: Promise<unknown> | number) => Promise.race([typeof p === 'number' ? wait(p) : p, skip]);

    await step(director.fly({ eye: [2.2, 1.7, 2.9], target: [0, 1.15, 0], via: THROUGH_GLASS, seconds: 4.2 }));
    if (!skipped) {
      // the room goes; the camera rises and pulls back into the hall as it does
      this.setEnvironment(true);
      layers.setHidden([]);
      await step(director.fly({ eye: [5.6, 2.9, 6.6], target: [0, 1.0, 0.2], seconds: 4.6 }));
    }
    if (!skipped) await step(director.fly({ eye: [3.3, 2.25, 3.7], target: [0, 1.15, 0], seconds: 2.2 }));
    const peel: [string[], string, [number, number, number]][] = [
      [['covers', 'coldhead'], 'Covers', [0.9, 1.6, 0.4]],
      [['covers', 'coldhead', 'cryostat'], 'Vacuum vessel · 300 K', [0.75, 1.75, 0.2]],
      [['covers', 'coldhead', 'cryostat', 'thermal_shield'], 'Thermal shield · 50 K', [0.72, 1.72, 0.1]],
      [['covers', 'coldhead', 'cryostat', 'thermal_shield', 'he_vessel'], 'Helium vessel · 4.2 K', [0.7, 1.7, 0]],
    ];
    for (const [hide, text, at] of peel) {
      if (skipped) break;
      layers.setHidden(hide);
      this.callouts.set([{ text, at }]);
      await step(1900);
    }
    if (!skipped) {
      this.callouts.set([{ text: 'Niobium-titanium windings', at: [0.0, 1.66, 0.37], note: 'superconducting, 1.5 T' },
        { text: 'Shield coils', at: [0.0, 1.93, 0.56] }]);
      await step(2400);
    }
    this.callouts.set([]);
    this.setEnvironment(true);
    layers.setHidden([]);                               // everything builds itself back
    skipBtn.remove();
    this.skipIntro = null;
    if (skipped) director.cut(STAGING.ch01.shot);
    else await wait(2400);
  }
}

export { HOME_SHOT };
