import type { Plate } from './types';
import { plateBox } from './ui';
import { el } from '../../ui/dom';

// Allwyn Sir's six questions: [question, options, correct index, explanation]
const QUIZ: [string, string[], number, string][] = [
  ['Why is the main magnetic field present even when the scanner is switched off?', ['The coils are superconducting and run in persistent mode', 'A battery keeps the magnet powered', 'The gradient coils hold the field', 'It is not; the field switches off with the console'], 0, 'Current circulates in the superconducting loop with no resistance and no power supply. Only a ramp-down or a quench removes the field.'],
  ['What is the Larmor frequency of hydrogen at 3 T?', ['About 64 MHz', 'About 128 MHz', 'About 300 MHz', 'About 42 kHz'], 1, 'f = 42.58 MHz/T × 3 T ≈ 127.7 MHz.'],
  ['Which component makes the loud knocking during a scan?', ['RF body coil', 'Cold head', 'Gradient coils', 'Passive shims'], 2, 'Rapidly switched gradient currents in the strong static field create Lorentz forces that vibrate the coil.'],
  ['To make a thinner slice, you can…', ['Lower the gradient strength', 'Widen the RF bandwidth', 'Increase the gradient strength', 'Raise TR'], 2, 'Δz = BW / (γ̄·G). A stronger gradient (or a narrower bandwidth) gives a thinner slice.'],
  ['In a T2-weighted image, which tissue is brightest?', ['Fat', 'White matter', 'Cerebrospinal fluid', 'Cortical bone'], 2, 'Fluid has a very long T2, so it keeps its transverse signal at long TE.'],
  ['What does the centre of k-space mainly carry?', ['Fine edges and detail', 'Overall contrast and brightness', 'Only noise', 'Patient position'], 1, 'Low spatial frequencies at the centre hold contrast; the edges hold detail.'],
];

export const quiz: Plate = ({ root }) => {
  let answered = 0, right = 0;
  const score = el('span', {}, `0 / ${QUIZ.length}`);
  const box = plateBox('Six quick questions', '');
  box.querySelector('h5 span:last-child')!.replaceWith(score);
  const list = el('div', { class: 'quiz' });
  QUIZ.forEach(([q, opts, ans, why]) => {
    const block = el('div', { class: 'q' }, el('p', {}, q));
    const buttons = opts.map((o, i) => el('button', { class: 'opt', onclick: () => {
      if (block.dataset.done) return;
      block.dataset.done = '1'; answered++; if (i === ans) right++;
      buttons.forEach((b, k) => { if (k === ans) b.classList.add('right'); else if (k === i) b.classList.add('wrong'); b.disabled = true; });
      block.append(el('p', { class: 'why' }, why));
      score.textContent = `${right} right · ${answered} / ${QUIZ.length}`;
    } }, o));
    block.append(...buttons);
    list.append(block);
  });
  box.append(list);
  root.append(box);
  return { dispose: () => {} };
};
