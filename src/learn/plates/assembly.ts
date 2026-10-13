import type { Plate } from './types';
import { plateBox } from './ui';
import { el } from '../../ui/dom';
import { SCANNER_LAYERS } from '../../engine/layers';

// Allwyn Sir's assembly steps, in the order a factory builds a magnet (inside out)
const STEPS: [string[], string][] = [
  [['windings'], 'Wind the NbTi coils on a precision former.'],
  [['he_vessel'], 'Seal the coils in the helium vessel.'],
  [['thermal_shield'], 'Wrap the vessel in the thermal radiation shield.'],
  [['cryostat', 'coldhead'], 'Close the outer vacuum vessel, fit the cold head and quench vent, pump down the vacuum, cool down and ramp the field.'],
  [['shims'], 'Map the field and load passive shim trays.'],
  [['gradient'], 'Slide in the water-cooled gradient coil.'],
  [['rf_shield', 'rf_body_coil'], 'Fit the RF body coil.'],
  [['liner'], 'Add the bore liner.'],
  [['covers', 'table', 'rf_head_coil'], 'Mount the covers. Add the table and receive coils.'],
];
const ALL = [...SCANNER_LAYERS, 'table', 'rf_head_coil'];

export const assembly: Plate = ({ layers, root }) => {
  let built = 0;
  let timer: number | null = null;
  const list = el('ol', { class: 'steps' }, ...STEPS.map(([, t]) => el('li', {}, t)));
  const next = el('button', { class: 'btn primary small', onclick: () => { stop(); step(); } }, 'Build next layer');
  const auto = el('button', { class: 'btn small', onclick: () => { stop(); reset(); timer = window.setInterval(() => (built >= STEPS.length ? stop() : step()), 1400); } }, 'Auto-build');
  const again = el('button', { class: 'btn small', onclick: () => { stop(); reset(); } }, 'Start again');
  const box = plateBox('Factory order', 'inside out');
  box.append(el('div', { class: 'row' }, next, auto, again), list);
  root.append(box);

  const apply = () => {
    const shown = new Set(STEPS.slice(0, built).flatMap(([l]) => l));
    layers.setHidden(ALL.filter((l) => !shown.has(l)));
    list.querySelectorAll('li').forEach((li, i) => { li.classList.toggle('done', i < built - 1); li.classList.toggle('now', i === built - 1); });
    next.disabled = built >= STEPS.length;
  };
  const step = () => { if (built < STEPS.length) { built++; apply(); } };
  const reset = () => { built = 1; apply(); };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  reset();
  return { dispose: () => { stop(); layers.setHidden([]); } };
};
