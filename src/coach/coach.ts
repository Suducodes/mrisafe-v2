/**
 * The coach: Allwyn Sir's offline knowledge base and retrieval coach (loaded unmodified), shown as
 * "Knowledge base · offline". If a local Ollama server answers on this machine, the coach can phrase
 * the answer with a local model, grounded only in the knowledge-base entries it retrieved, and says so.
 */
import kbSrc from './sir-kb.cjs?raw';
import coachSrc from './sir-coach.cjs?raw';
import { el } from '../ui/dom';

/* eslint-disable @typescript-eslint/no-explicit-any */
new Function(kbSrc)();          // defines window.MRIKB
new Function(coachSrc)();       // defines window.MRICoach (reads MRIKB)
const COACH = (window as any).MRICoach as {
  respond(task: string, ctx: any, q?: string): string;
  search(q: string, n?: number): { e: { q: string[]; a: string; topic: string }; s: number }[];
  count: number; confident: number;
};
const SUGGEST = ['What does MR Conditional mean?', 'Why is the magnetic field always on?', 'What is k-space?', 'What is a quench?', 'How does slice selection work?'];
const OLLAMA = 'http://localhost:11434';

export type CoachContext = () => { chapter?: string; notes?: string; violations?: any[]; debrief?: any };

export class Coach {
  private readonly panel: HTMLElement;
  private readonly thread: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly source: HTMLElement;
  private model: string | null = null;
  private useModel = false;

  constructor(host: HTMLElement, private readonly context: CoachContext) {
    this.thread = el('div', { class: 'thread' });
    this.input = el('input', { type: 'text', placeholder: 'Ask about MRI or MR safety…', 'aria-label': 'Question for the coach' }) as HTMLInputElement;
    this.source = el('span', { class: 'src' }, `Knowledge base · offline · ${COACH.count} entries`);
    const form = el('form', { class: 'ask', onsubmit: (e: Event) => { e.preventDefault(); this.ask(this.input.value); } }, this.input, el('button', { class: 'btn small primary', type: 'submit' }, 'Ask'));
    this.panel = el('aside', { class: 'coach', hidden: true, 'aria-label': 'Coach' },
      el('div', { class: 'coach-head' }, el('b', {}, 'Coach'), this.source, el('button', { class: 'btn small', onclick: () => this.toggle(false) }, 'Close')),
      this.thread,
      el('div', { class: 'chips' }, ...SUGGEST.map((q) => el('button', { class: 'chip', onclick: () => this.ask(q) }, q)),
        el('button', { class: 'chip', onclick: () => this.say('Explain my mistakes', COACH.respond('explain', this.context())) }, 'Explain my mistakes'),
        el('button', { class: 'chip', onclick: () => this.say('Quiz me', COACH.respond('quiz', null)) }, 'Quiz me')),
      form);
    host.append(this.panel);
    this.detectModel();
  }

  toggle(open = this.panel.hidden) {
    this.panel.hidden = !open;
    if (open) { this.input.focus(); if (!this.thread.childElementCount) this.say(null, 'Ask anything about how the scanner works or about the safety checks. Answers come from the built-in knowledge base, which runs entirely in this browser.'); }
  }

  private async detectModel() {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 900);
      const r = await fetch(`${OLLAMA}/api/tags`, { signal: ctl.signal }); clearTimeout(t);
      const tags = await r.json();
      this.model = tags.models?.[0]?.name ?? null;
    } catch { this.model = null; }
    if (this.model) {
      const box = el('input', { type: 'checkbox', onchange: (e: Event) => { this.useModel = (e.target as HTMLInputElement).checked; this.updateSource(); } });
      this.panel.querySelector('.coach-head')!.append(el('label', { class: 'model' }, box, ` Local model (${this.model})`));
    }
  }

  private updateSource() {
    this.source.textContent = this.useModel && this.model ? `Local model · ${this.model} · grounded in the knowledge base` : `Knowledge base · offline · ${COACH.count} entries`;
  }

  private say(q: string | null, a: string, label?: string) {
    if (q) this.thread.append(el('p', { class: 'q' }, q));
    const ans = el('div', { class: 'a' }, ...a.split('\n\n').map((p) => el('p', {}, p)));
    if (label) ans.append(el('small', {}, label));
    this.thread.append(ans);
    this.thread.scrollTop = this.thread.scrollHeight;
    return ans;
  }

  private async ask(q: string) {
    q = q.trim(); if (!q) return;
    this.input.value = '';
    const ctx = this.context();
    const offline = COACH.respond('tutor', ctx, q);
    if (!this.useModel || !this.model) { this.say(q, offline, 'Knowledge base · offline'); return; }
    const hits = COACH.search(q, 4).filter((h) => h.s >= COACH.confident - 1);
    if (!hits.length) { this.say(q, offline, 'Knowledge base · offline (no grounded passage for the model)'); return; }
    const pending = this.say(q, '…', `Local model · ${this.model}`);
    const prompt = `You are a teaching assistant for an MRI physics and MR safety training simulator. Answer the trainee's question in 2-4 plain sentences using ONLY the reference notes. If the notes do not answer it, say so. Never give clinical or procedural instructions beyond the notes.\n\nReference notes:\n${hits.map((h, i) => `[${i + 1}] ${h.e.a}`).join('\n')}\n\nQuestion: ${q}`;
    try {
      const r = await fetch(`${OLLAMA}/api/generate`, { method: 'POST', body: JSON.stringify({ model: this.model, prompt, stream: false, options: { temperature: 0.2 } }) });
      const j = await r.json();
      const text = String(j.response ?? '').trim();
      if (!r.ok || j.error || !text) throw new Error(j.error ?? `HTTP ${r.status}`);
      pending.replaceChildren(...text.split('\n\n').map((p: string) => el('p', {}, p)),
        el('small', {}, `Local model · ${this.model} · from ${hits.length} knowledge-base entr${hits.length > 1 ? 'ies' : 'y'}`));
    } catch (e) {
      console.warn('[coach] local model failed:', e);
      pending.replaceChildren(...offline.split('\n\n').map((p) => el('p', {}, p)), el('small', {}, 'The local model did not answer · knowledge base · offline'));
    }
  }
}
