import * as THREE from 'three';
import type { PlateCtx } from '../learn/plates/types';
import type { Callouts } from '../ui/callouts';
import { el } from '../ui/dom';
import { ENGINE } from '../physics/sir';
import { TrainScene, SHOTS, type ItemId, type ZoneId } from './scene';
import { showReport } from './report';
import { runQuenchDrill } from './drill';
import { CEILING } from '../learn/chapters';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Outcome = any;
const E = ENGINE;
const PAD_ORDER = ['T1', 'T2', 'T3', 'T4', 'T5'];
const LABEL_TEXT: Record<string, string> = { MR_SAFE: 'MR Safe', MR_CONDITIONAL: 'MR Conditional', MR_UNSAFE: 'MR Unsafe' };

/** Small inline ASTM-style mark for the inspector (simplified rendering, as on the signs). */
function mark(label: string | null) {
  if (label === 'MR_UNSAFE') return '<svg viewBox="0 0 40 40" class="mark"><circle cx="20" cy="20" r="17" fill="#fff" stroke="#b8322a" stroke-width="4"/><text x="20" y="25" text-anchor="middle" font-size="13" font-weight="700" font-family="Inter Tight, Arial">MR</text><line x1="8" y1="8" x2="32" y2="32" stroke="#b8322a" stroke-width="4"/></svg>';
  if (label === 'MR_CONDITIONAL') return '<svg viewBox="0 0 40 40" class="mark"><path d="M20 3 L38 36 L2 36 Z" fill="#f0c419" stroke="#111" stroke-width="3" stroke-linejoin="round"/><text x="20" y="31" text-anchor="middle" font-size="11" font-weight="700" font-family="Inter Tight, Arial">MR</text></svg>';
  if (label === 'MR_SAFE') return '<svg viewBox="0 0 40 40" class="mark"><rect x="3" y="3" width="34" height="34" fill="#007a3d"/><text x="20" y="25" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" font-family="Inter Tight, Arial">MR</text></svg>';
  return '<svg viewBox="0 0 40 40" class="mark"><rect x="3" y="3" width="34" height="34" fill="none" stroke="#9aa3a6" stroke-width="2" stroke-dasharray="4 3"/><text x="20" y="24" text-anchor="middle" font-size="10" fill="#7c878b" font-family="Inter Tight, Arial">none</text></svg>';
}

export class Train {
  private session: any = null;
  private scene: TrainScene | null = null;
  private readonly panel: HTMLElement;
  private readonly card: HTMLElement;
  private readonly body: HTMLElement;
  private readonly feedback: HTMLElement;
  private readonly logEl: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private view: { kind: 'intro' } | { kind: 'record' } | { kind: 'item'; id: ItemId } | { kind: 'patient' } = { kind: 'intro' };
  private active = false;
  private down: { x: number; y: number } | null = null;
  private tableIn = 0;

  constructor(private readonly ctx: Omit<PlateCtx, 'root'>, private readonly callouts: Callouts, host: HTMLElement) {
    this.panel = el('nav', { class: 'index procedure', 'aria-label': 'Procedure' });
    this.body = el('div', { class: 'view' });
    this.feedback = el('div', { class: 'feedback', 'aria-live': 'polite' });
    this.logEl = el('ol', { class: 'log' });
    this.scoreEl = el('span', { class: 'prog' });
    this.card = el('article', { class: 'card out train-card' },
      el('div', { class: 'body' }, this.feedback, this.body, el('details', { class: 'logbox' }, el('summary', {}, 'Event log'), this.logEl)),
      el('div', { class: 'foot' }, el('button', { class: 'btn small index-toggle', onclick: () => document.body.classList.toggle('index-open') }, 'Checkpoints'), this.scoreEl));
    this.panel.hidden = true;
    host.append(this.panel, this.card);

    const canvas = ctx.stage.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => { this.down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.active || !this.down || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5 || !this.scene) return;
      const id = this.scene.itemAt(e.clientX, e.clientY);
      if (id && this.attempt.items[id]) this.openItem(id);
      else if (this.scene.isPatient(e.clientX, e.clientY)) this.openPatient();
      else if (this.isConsole(e.clientX, e.clientY)) this.openRecord();
    });
    addEventListener('keydown', (e) => {
      if (!this.active || (e.target as HTMLElement).closest('input, textarea, select')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 6) this.pad(`T${n}`, 'kbd');
    });
    ctx.stage.onFrame((dt) => this.slideTable(dt));
  }

  private get attempt() { return this.session.current; }

  /** What the coach should know: this attempt's violations. */
  context() { return this.session ? { violations: this.attempt.violations() } : {}; }

  async enter(_fromHome: boolean) {
    this.active = true;
    this.ctx.layers.alwaysHidden.clear();
    this.ctx.layers.setHidden([]); this.ctx.layers.setCut(false);
    this.scene ??= new TrainScene(this.ctx.stage);
    if (!this.session) this.session = new E.Session({ scenarioId: 'guided', trainee: 'Trainee' });
    history.replaceState(null, '', '#train');
    this.panel.hidden = false;
    this.card.classList.remove('out');
    document.body.classList.add('card-open');
    this.ctx.stage.setInsets(innerWidth > 900 ? 280 : 0, innerWidth > 900 ? 420 : 0, innerWidth > 900 ? 0 : innerHeight * 0.42);
    this.syncScene();
    this.renderPanel();
    this.view = { kind: 'intro' };
    this.renderView();
    await this.ctx.director.fly({ ...SHOTS.corridor, via: [[-4.4, 1.62, 3.4], [-4.6, 1.62, 4.9]] });
  }

  leave() {
    this.active = false;
    this.drill?.dispose(); this.drill = null;
    this.panel.hidden = true;
    this.card.classList.add('out');
    document.body.classList.remove('card-open');
    this.ctx.stage.setInsets(0, 0);
    this.ctx.layers.alwaysHidden.add('patient');
    this.scene?.select(null);
    this.scene?.setDoor(false);
    this.tableIn = 0; this.setTable(0);
    this.callouts.set([]);
  }

  // ---------------------------------------------------------------------------------------
  private handle(evt: Record<string, unknown>, src = 'ui'): Outcome {
    const before = this.attempt;
    const out = this.session.handle({ ...evt, src });
    this.showOutcome(out);
    for (const fx of out.effects ?? []) {
      if (fx.type === 'move') this.scene?.move(fx.id, fx.zone);
      if (fx.type === 'reset') { this.syncScene(); this.feedback.replaceChildren(); this.tableIn = 0; }
      if (fx.type === 'scan') this.tableIn = 1;
    }
    if (out.event === 'MOVE' && !out.accepted && evt.value === 'ZONE_IV') this.consequence(evt.target as ItemId, out);
    this.renderPanel();
    if (out.effects?.some((f: any) => f.type === 'complete')) {
      setTimeout(() => showReport(this.session, before, out.recommendation, (next) => this.startScenario(next)), 2600);
    } else this.renderView();
    this.appendLog(out);
    return out;
  }

  /** A pad touch from the screen, keys 1-6 (src ui/kbd) or the ESP32 controller (src hw). */
  pad(p: string, src = 'ui', seq?: number) {
    if (!this.active) return;
    if (p === 'T6') { this.handle({ event: 'RESET_SCENARIO', pad: 'T6', seq }, src); return; }
    this.handle({ event: E.PAD_EVENT[p], pad: p, seq }, src);
  }

  private startScenario(id: string) {
    this.session.start(id, 'switched');
    this.feedback.replaceChildren(); this.logEl.replaceChildren();
    this.tableIn = 0;
    this.syncScene(); this.renderPanel();
    this.view = { kind: 'intro' }; this.renderView();
    this.ctx.director.fly(SHOTS.corridor);
  }

  private syncScene() {
    const zones: Partial<Record<ItemId, ZoneId>> = {};
    for (const [id, s] of Object.entries(this.attempt.items) as [ItemId, any][]) zones[id] = s.zone;
    this.scene?.place(zones);
    this.scene?.select(null);
  }

  /** A blocked move into Zone IV: the detector at the door alarms, then the replay for steel. */
  private async consequence(id: ItemId, out: Outcome) {
    this.scene?.alarmDetector();
    this.ctx.audio.ensure(); this.ctx.audio.setAlarm(true); setTimeout(() => this.ctx.audio.setAlarm(false), 1800);
    if (E.ITEMS[id].truth !== 'MR_UNSAFE' || !this.scene) return;
    // high corner by the door: the whole path from the threshold to the bore mouth is in frame
    await this.ctx.director.fly({ eye: [2.3, 2.15, 4.15], target: [-0.65, 0.6, 2.35] });
    const speed = await this.scene.replayProjectile(id);
    const note = el('div', { class: 'consequence' },
      el('b', {}, 'What this move would have done'),
      el('p', {}, `Released at the door, the ${E.ITEMS[id].name.toLowerCase()} is pulled toward the bore by the field gradient and arrives at about ${speed.toFixed(1)} m/s (${(speed * 3.6).toFixed(0)} km/h). The force is computed from this scanner's coil model. The move was blocked; nothing actually entered Zone IV.`));
    this.feedback.prepend(note);
    void out;
  }

  private isConsole(x: number, y: number) {
    const hit = this.ctx.stage.pick(x, y);
    return !!hit && /^(Mon_console|Desk_top|Keyboard)/.test(hit.object.name);
  }

  // --- views -----------------------------------------------------------------------------
  private openRecord() {
    this.handle({ event: 'INSPECT', target: 'record' });
    this.view = { kind: 'record' }; this.renderView();
    this.ctx.director.fly(SHOTS.record);
  }

  private openItem(id: ItemId) {
    this.handle({ event: 'INSPECT', target: id });
    this.view = { kind: 'item', id }; this.renderView();
    this.scene?.select(id);
  }

  private openPatient() {
    this.handle({ event: 'INSPECT', target: 'patient' });
    this.view = { kind: 'patient' }; this.renderView();
    this.ctx.director.fly(SHOTS.patient);
  }

  private renderView() {
    const a = this.attempt, v = this.view;
    const parts: Node[] = [];
    if (v.kind === 'intro') {
      parts.push(el('div', { class: 'eyebrow' }, `Level ${a.scenario.level} · ${a.scenario.kind === 'drill' ? 'drill' : 'full pre-scan'}`),
        el('h2', {}, a.scenario.title), el('p', { class: 'lead' }, a.scenario.summary),
        el('dl', { class: 'facts' },
          el('dt', {}, 'Screen the patient'), el('dd', {}, 'Open the patient record at the console in the control room.'),
          el('dt', {}, 'Check every item'), el('dd', {}, 'Click equipment in the staging bay or the magnet room, read its label, classify it, and move it where it belongs.'),
          el('dt', {}, 'Check at the door'), el('dd', {}, 'Click the patient on the table for the final check and personal items.'),
          el('dt', {}, 'Attest each checkpoint'), el('dd', {}, 'Touch pads T1 to T5 in order (keys 1–5). T6 resets the attempt.')));
    }
    if (v.kind === 'record') {
      const p = a.patient;
      parts.push(el('div', { class: 'eyebrow' }, 'Patient record · fictional training case'), el('h2', {}, p.name),
        el('dl', { class: 'facts' },
          el('dt', {}, 'Request'), el('dd', {}, `${p.name} · MRN ${p.mrn} · DOB ${p.dob}`),
          el('dt', {}, 'Wristband'), el('dd', {}, `${p.name} · MRN ${p.mrn}`),
          el('dt', {}, 'Examination'), el('dd', {}, p.exam),
          el('dt', {}, 'MR screening form'), el('dd', {}, p.implant ? `Implant reported: ${p.implant.type}. ${p.implant.card}` : 'No implants, devices or metal fragments reported. Not pregnant.')),
        el('div', { class: 'row' }, el('button', { class: 'btn primary small', disabled: p.idConfirmed, onclick: () => this.handle({ event: 'CONFIRM_ID' }) }, p.idConfirmed ? 'Identifiers confirmed ✓' : 'Confirm two identifiers match')));
      if (p.implant) {
        parts.push(el('section', { class: 'plate' }, el('h5', {}, el('span', {}, 'Implant decision'), el('span', {}, p.implantResolved ? 'referred' : 'open')),
          el('div', { class: 'row' },
            el('button', { class: 'btn small primary', disabled: p.implantResolved, onclick: () => this.handle({ event: 'IMPLANT_DECISION', value: 'ESCALATE' }) }, 'Refer to MR safety officer'),
            el('button', { class: 'btn small', disabled: p.implantResolved, onclick: () => this.handle({ event: 'IMPLANT_DECISION', value: 'PROCEED_ON_CARD' }) }, 'Proceed on the device card'),
            el('button', { class: 'btn small', disabled: p.implantResolved, onclick: () => this.handle({ event: 'IMPLANT_DECISION', value: 'IGNORE' }) }, 'Ignore'))));
      }
    }
    if (v.kind === 'item') {
      const def = E.ITEMS[v.id], st = a.items[v.id];
      const shown = def.labelShown as string | null;
      parts.push(el('div', { class: 'eyebrow' }, `Equipment · ${E.ZONES[st.zone].text}`), el('h2', {}, def.name),
        el('div', { class: 'label-card', html: `${mark(shown)}<div><b>${shown ? LABEL_TEXT[shown] : 'No MR labelling found'}</b><span>${def.material}</span></div>` }),
        el('p', {}, shown ? 'The label on the item is shown above. Classify it from the label, not from how it looks.' : 'There is no MR marking on the item or its frame.'),
        el('div', { class: 'eyebrow' }, 'Classify'),
        el('div', { class: 'row' }, ...(['MR_SAFE', 'MR_CONDITIONAL', 'MR_UNSAFE'] as const).map((l) =>
          el('button', { class: `btn small${st.classifiedAs === l ? ' primary' : ''}`, onclick: () => this.handle({ event: 'CLASSIFY', target: v.id, value: l }) }, LABEL_TEXT[l]))));
      if (st.classifiedAs === 'MR_CONDITIONAL') parts.push(el('div', { class: 'row' }, el('button', { class: 'btn small', disabled: st.conditionsConfirmed, onclick: () => this.handle({ event: 'CONFIRM_CONDITIONS', target: v.id }) }, st.conditionsConfirmed ? 'Conditions confirmed ✓' : 'Check its conditions of use')));
      parts.push(el('div', { class: 'eyebrow' }, 'Move'), el('div', { class: 'row' },
        el('button', { class: 'btn small', disabled: st.zone === 'ZONE_II', onclick: () => { this.handle({ event: 'MOVE', target: v.id, value: 'ZONE_II' }); this.ctx.director.fly(SHOTS.staging); } }, 'To Zone II staging'),
        el('button', { class: 'btn small', disabled: st.zone === 'ZONE_IV', onclick: () => this.handle({ event: 'MOVE', target: v.id, value: 'ZONE_IV' }) }, 'Into Zone IV')));
    }
    if (v.kind === 'patient') {
      const p = a.patient;
      parts.push(el('div', { class: 'eyebrow' }, 'Zone IV door check'), el('h2', {}, 'Patient on the table'),
        el('p', {}, 'Final check before the patient goes into the bore: ask about and look for anything metal they still have with them.'));
      if (!p.personal.length) parts.push(el('p', { class: 'note' }, 'Nothing found: no personal items with the patient.'));
      for (const it of p.personal) parts.push(el('div', { class: 'row' }, el('span', { style: 'flex:1' }, E.PERSONAL_ITEMS[it.id].name),
        el('button', { class: 'btn small', disabled: it.removed, onclick: () => this.handle({ event: 'REMOVE_PERSONAL_ITEM', target: it.id }) }, it.removed ? 'In the locker ✓' : 'Remove, store in locker')));
    }
    this.body.replaceChildren(...parts);
  }

  private renderPanel() {
    const a = this.attempt, hint = a.scenario.hints ? a.nextHint() : null;
    const done = Object.values(a.checkpoints).filter((c: any) => c.status === 'done').length;
    this.scoreEl.textContent = `${a.scenario.title} · score ${a.score()} · ${done}/${Object.keys(a.checkpoints).length} checkpoints`;
    const scen = el('select', { class: 'scenario', onchange: (e: Event) => this.startScenario((e.target as HTMLSelectElement).value) },
      ...Object.entries(E.SCENARIOS).map(([id, s]: [string, any]) => el('option', { value: id, selected: id === a.scenarioId }, `L${s.level} · ${s.title}`)));
    const pads = PAD_ORDER.filter((p) => a.checkpoints[E.CHECKPOINTS[Object.keys(E.CHECKPOINTS).find((k) => E.CHECKPOINTS[k].pad === p)!].id]).map((p) => {
      const cpId = Object.keys(E.CHECKPOINTS).find((k) => E.CHECKPOINTS[k].pad === p)!;
      const def = E.CHECKPOINTS[cpId], cp = a.checkpoints[cpId];
      const req = a.requirementStatus(cpId);
      return el('button', { class: `padrow${cp.status === 'done' ? ' done' : ''}${hint?.focus === 'pad:' + p ? ' hint' : ''}`, onclick: () => this.pad(p) },
        el('span', { class: 'pad' }, p),
        el('span', { class: 'pt' }, el('b', {}, def.title), el('small', {}, req.length ? req.map((r: any) => `${r.ok ? '✓' : '○'} ${r.label}`).join('   ') : def.detail)),
        el('span', { class: 'st' }, cp.status === 'done' ? 'done' : cp.incorrect ? `${cp.incorrect}×` : ''));
    });
    const places = el('div', { class: 'places' }, ...([['staging', 'Zone II staging'], ['corridor', 'Zone III corridor'], ['door', 'Zone IV door'], ['zone4', 'Magnet room'], ['record', 'Console']] as const)
      .map(([k, label]) => el('button', { class: 'btn small', onclick: () => { this.scene?.setDoor(k === 'zone4'); this.ctx.director.fly(SHOTS[k]); if (k === 'record') this.openRecord(); } }, label)));
    const drill = el('button', { class: 'btn small', onclick: () => this.startDrill() }, 'Quench drill');
    this.panel.replaceChildren(
      el('h4', {}, 'Scenario'), scen,
      el('div', { class: 'score' }, el('span', {}, 'Score'), el('b', {}, String(a.score())), el('span', {}, 'Critical'), el('b', { class: a.criticalCount() ? 'warn' : '' }, String(a.criticalCount()))),
      ...(hint ? [el('div', { class: 'hint' }, el('b', {}, 'Next step'), hint.text)] : []),
      el('h4', {}, 'Checkpoints'), ...pads,
      el('button', { class: 'padrow reset', onclick: () => this.pad('T6') }, el('span', { class: 'pad' }, 'T6'), el('span', { class: 'pt' }, el('b', {}, 'Reset attempt')), el('span', {})),
      el('h4', {}, 'Go to'), places,
      el('h4', {}, 'Emergency'), el('div', { class: 'places' }, drill));
  }

  private drill: { dispose(): void } | null = null;
  /** Quench with a blocked vent: three decisions while the room fills (separate from the assessor). */
  private startDrill() {
    this.drill?.dispose();
    this.scene?.setDoor(false);
    this.ctx.layers.setHidden([], CEILING);
    this.ctx.director.fly({ eye: [1.75, 2.3, 2.3], target: [-0.12, 2.55, -0.45], via: [[-1.35, 1.66, 5.6], [-1.35, 1.6, 4.1]] });
    this.feedback.replaceChildren();
    this.drill = runQuenchDrill(this.ctx, this.body, () => {
      this.body.append(el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => this.endDrill() }, 'Back to the scenario')));
    });
  }
  private endDrill() {
    this.drill?.dispose(); this.drill = null;
    this.ctx.layers.setHidden([]);
    this.view = { kind: 'intro' }; this.renderView();
    this.ctx.director.fly(SHOTS.corridor);
  }

  private showOutcome(out: Outcome) {
    if (out.error === 'ATTEMPT_CLOSED') return;
    const blocks: Node[] = [];
    for (const v of out.violations ?? []) {
      blocks.push(el('div', { class: `violation ${v.severity}` },
        el('div', { class: 'vh' }, el('span', { class: 'rule' }, v.rule), el('b', {}, v.title), el('span', { class: 'pts' }, v.points ? `−${v.points}` : 'repeat')),
        el('p', {}, v.evidence), el('p', { class: 'fix' }, el('b', {}, 'Do instead: '), v.corrective), el('p', { class: 'basis' }, `Basis: ${v.basis}`)));
    }
    if (out.checkpointCompleted) blocks.push(el('div', { class: 'ok' }, el('b', {}, `${E.CHECKPOINTS[out.checkpointCompleted].pad} · ${E.CHECKPOINTS[out.checkpointCompleted].title}`), ' attested.'));
    const notes = (out.notes ?? []).filter((n: string) => !/^Viewed /.test(n));
    if (!blocks.length && notes.length) blocks.push(el('div', { class: 'okn' }, notes.join(' ')));
    if (blocks.length) this.feedback.replaceChildren(...blocks);
  }

  private appendLog(out: Outcome) {
    const line = `${(out.at / 1000).toFixed(1)} s  ${out.pad ? out.pad + ' ' : ''}${out.event}${out.target ? ' · ' + out.target : ''}${out.value ? ' · ' + out.value : ''}${out.violations?.length ? '  ✗ ' + out.violations.map((v: any) => v.rule).join(' ') : out.accepted ? '  ✓' : ''}`;
    this.logEl.prepend(el('li', {}, line));
  }

  // the cradle carries the patient into the bore when the scan starts
  private tableParts: THREE.Object3D[] | null = null;
  private tableZ = 0;
  private setTable(z: number) {
    this.tableParts ??= ['Cradle', 'Mattress', 'HeadCoil_posterior', 'HeadCoil_anterior', 'HeadCoil_base', 'HeadCoil_plug', 'Patient_blanket']
      .map((n) => this.ctx.stage.scene.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o).map((o) => { o.userData.baseZ ??= o.position.z; return o; });
    for (const o of this.tableParts) o.position.z = o.userData.baseZ - z;
  }
  private slideTable(dt: number) {
    const target = this.tableIn ? 1.45 : 0;
    if (Math.abs(this.tableZ - target) < 1e-4) return;
    this.tableZ += Math.sign(target - this.tableZ) * Math.min(Math.abs(target - this.tableZ), dt * 0.35);
    this.setTable(this.tableZ);
  }
}
