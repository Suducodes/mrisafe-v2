import { el } from '../../ui/dom';

export function plateBox(title: string, aside = '') {
  const box = el('section', { class: 'plate' }, el('h5', {}, el('span', {}, title), el('span', {}, aside)));
  return box;
}

/** Segmented control. Returns the element and a setter for the pressed value. */
export function seg<T extends string | number>(options: [T, string][], value: T, onChange: (v: T) => void) {
  const wrap = el('div', { class: 'seg', role: 'group' });
  const buttons = options.map(([v, label]) => {
    const b = el('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => { set(v); onChange(v); } }, label);
    wrap.append(b);
    return [v, b] as const;
  });
  const set = (v: T) => { for (const [k, b] of buttons) b.setAttribute('aria-pressed', String(k === v)); };
  return { el: wrap, set };
}

/** Grid of labelled numeric readouts; returns setters keyed by id. */
export function readouts(items: [string, string][]) {
  const wrap = el('div', { class: 'readouts' });
  const vals: Record<string, HTMLElement> = {};
  for (const [id, label] of items) {
    const b = el('b', {}, '–');
    vals[id] = b;
    wrap.append(el('div', {}, label, b));
  }
  const set = (id: string, text: string, warn = false) => { vals[id].textContent = text; vals[id].classList.toggle('warn', warn); };
  return { el: wrap, set };
}

/** Canvas sized for the device pixel ratio; draw in CSS pixels. */
export function canvas(heightCss: number) {
  const c = el('canvas', { height: heightCss }) as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  const fit = () => {
    const w = c.clientWidth || 340, dpr = Math.min(devicePixelRatio, 2);
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(heightCss * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h: heightCss };
  };
  c.style.height = heightCss + 'px';
  return { el: c, g, fit };
}

export const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function fmt(v: number, digits = 2) {
  if (!isFinite(v)) return '–';
  return v.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
