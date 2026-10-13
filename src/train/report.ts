import { el } from '../ui/dom';
import { ENGINE } from '../physics/sir';

/* eslint-disable @typescript-eslint/no-explicit-any */
const E = ENGINE;

function download(name: string, type: string, text: string) {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}

/** End-of-attempt report: Allwyn Sir's summary, scoring and adaptive recommendation. */
export function showReport(session: any, attempt: any, rec: any, start: (scenarioId: string) => void) {
  const s = attempt.summary();
  const cats = Object.entries(s.byCategory ?? {}) as [string, number][];
  const close = () => wrap.remove();
  const wrap = el('div', { class: 'modal', role: 'dialog', 'aria-label': 'Attempt report' },
    el('div', { class: 'sheet' },
      el('div', { class: 'eyebrow' }, `${s.scenarioTitle} · attempt ${s.attemptNo}`),
      el('h2', {}, s.passed ? 'Passed' : 'Not passed'),
      el('div', { class: 'readouts' },
        el('div', {}, 'Score', el('b', { class: s.score < 80 ? 'warn' : '' }, String(s.score))),
        el('div', {}, 'Critical violations', el('b', { class: s.criticalCount ? 'warn' : '' }, String(s.criticalCount))),
        el('div', {}, 'Correct actions', el('b', {}, String(s.correctActions))),
        el('div', {}, 'Time', el('b', {}, `${Math.round(s.durationMs / 1000)} s`))),
      cats.length ? el('p', { class: 'note' }, 'Violations by category: ' + cats.map(([k, v]) => `${k} ${v}`).join(', ')) : el('p', { class: 'note' }, 'No violations.'),
      el('p', { class: 'note' }, `Pass rule: all checkpoints complete, score ≥ ${E.SCORING.passMinScore}, no critical violations.`),
      rec ? el('section', { class: 'plate' }, el('h5', {}, el('span', {}, 'Next'), el('span', {}, rec.rule)), el('p', {}, rec.reason)) : null,
      el('div', { class: 'row' },
        rec ? el('button', { class: 'btn primary', onclick: () => { close(); start(rec.scenarioId); } }, `Start: ${E.SCENARIOS[rec.scenarioId].title}`) : null,
        el('button', { class: 'btn', onclick: () => { close(); start(s.scenarioId); } }, 'Repeat'),
        el('button', { class: 'btn', onclick: () => download(`${session.id}.json`, 'application/json', JSON.stringify(session.report(), null, 2)) }, 'Report (JSON)'),
        el('button', { class: 'btn', onclick: () => download(`${session.id}.csv`, 'text/csv', E.toCSV(session)) }, 'Event log (CSV)'),
        el('button', { class: 'btn', onclick: close }, 'Close')),
      el('p', { class: 'note' }, 'Educational prototype. Rules are illustrative and not a substitute for local MR safety procedures or certification. The adaptive step is transparent but its effect on learning has not been evaluated.')));
  document.body.append(wrap);
}
