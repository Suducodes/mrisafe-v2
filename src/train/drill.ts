import type { PlateCtx } from '../learn/plates/types';
import { quench } from '../learn/plates/quench';
import { el } from '../ui/dom';

/**
 * Quench emergency drill: the Learn quench simulation runs with a blocked vent while the trainee
 * makes three decisions. Illustrative, written from general MR safety teaching (evacuate, do not
 * re-enter, oxygen deficiency, cold burns); it is not any site's emergency procedure and is scored
 * on its own, outside Allwyn Sir's assessor.
 */
const STEPS: { q: string; options: [string, boolean, string][] }[] = [
  {
    q: 'The O₂ alarm sounds and white vapour is pouring from the top of the magnet. The patient is on the table at the bore. What first?',
    options: [
      ['Get the patient out of the room and everyone out of the suite', true, 'Yes. People first: helium displaces oxygen and the vapour is cold enough to burn. Move the patient out of Zone IV without waiting.'],
      ['Wait for the field to drop before going in', false, 'No. In a quench the field collapses within seconds, but the hazard now is the gas, not the magnet. Waiting costs the patient time in a low-oxygen room.'],
      ['Close the door to keep the helium in the room', false, 'No. Shutting people in with the gas is the danger. Keep the door open from outside once everyone is out.'],
    ],
  },
  {
    q: 'You reach the RF door. It feels heavy, as if something is pushing back on it.',
    options: [
      ['Expect overpressure: open it outward fully and keep it open from the corridor', true, 'Right. Gas building up in a sealed room raises the pressure; that is why this suite\'s RF door opens outward. Prop it open from outside and let the room vent.'],
      ['Force it shut and seal the gap', false, 'No. A sealed room keeps filling with helium. The door is part of the escape and venting route.'],
      ['Break the RF window to let air in', false, 'No. It costs time and puts glass and cold gas in the way. Use the door and the emergency exhaust.'],
    ],
  },
  {
    q: 'Everyone is out. A colleague wants to go back in for the patient\'s belongings and the clipboard.',
    options: [
      ['Nobody re-enters until the oxygen reading is normal and the MR safety lead clears the room', true, 'Correct. Low oxygen gives no warning before collapse. Re-entry waits for a normal O₂ reading and clearance from whoever leads MR safety on site.'],
      ['A quick dash is fine if they hold their breath', false, 'No. Rescuers entering low-oxygen spaces are a well-known way that one casualty becomes two.'],
      ['It is safe now because the field is off', false, 'The field is off, but the room may still be oxygen-deficient and very cold. That is what decides re-entry.'],
    ],
  },
];

export function runQuenchDrill(ctx: Omit<PlateCtx, 'root'>, root: HTMLElement, done: (score: number) => void) {
  root.replaceChildren(el('div', { class: 'eyebrow' }, 'Emergency drill · illustrative'), el('h2', {}, 'Quench with a blocked vent line'),
    el('p', { class: 'lead' }, 'A simulated loss of superconductivity. Decide quickly; the clock is the oxygen level.'));
  const stage = el('div', {});
  const simHost = el('div', {});
  root.append(stage, simHost);
  const sim = quench({ ...ctx, root: simHost });
  // start the event: vent blocked, quench now
  const buttons = [...simHost.querySelectorAll('button')];
  buttons.find((b) => b.textContent === 'Vent line blocked')?.click();
  buttons.find((b) => b.textContent === 'Quench (simulated)')?.click();
  let step = 0, right = 0;
  const show = () => {
    if (step >= STEPS.length) {
      stage.replaceChildren(el('div', { class: right === STEPS.length ? 'ok' : 'violation' }, el('b', {}, `Drill complete: ${right} of ${STEPS.length} right.`),
        el('p', {}, 'This drill teaches the order of priorities, not your site\'s procedure. Your local MR safety lead and emergency plan decide the real steps.')));
      done(right);
      return;
    }
    const s = STEPS[step];
    const block = el('section', { class: 'plate drill' }, el('h5', {}, el('span', {}, `Decision ${step + 1} of ${STEPS.length}`), el('span', {}, '')), el('p', {}, s.q));
    s.options.forEach(([text, ok, why]) => block.append(el('button', { class: 'opt', onclick: () => {
      block.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
      if (ok) right++;
      block.append(el('div', { class: ok ? 'ok' : 'violation' }, el('p', {}, why)),
        el('div', { class: 'row' }, el('button', { class: 'btn small primary', onclick: () => { step++; show(); } }, step + 1 < STEPS.length ? 'Next decision' : 'Finish')));
    } }, text)));
    stage.replaceChildren(block);
  };
  show();
  return { dispose: () => sim.dispose() };
}
