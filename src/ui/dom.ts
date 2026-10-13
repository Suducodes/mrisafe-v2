type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

/** Minimal element builder: el('button', { class: 'x', onclick: fn }, 'Label'). */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'html') e.innerHTML = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) e.append(c);
  return e;
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;

/** Sir's chapter text uses **bold** and "- **Term**: definition" lines. */
export function richText(src: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const inline = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  let list: HTMLDListElement | null = null;
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line) { list = null; continue; }
    const fact = /^- \*\*(.+?)\*\*:\s*(.*)$/.exec(line);
    if (fact) {
      if (!list) { list = el('dl', { class: 'facts' }); frag.append(list); }
      list.append(el('dt', { html: inline(fact[1]) }), el('dd', { html: inline(fact[2]) }));
    } else {
      list = null;
      frag.append(el('p', { html: inline(line) }));
    }
  }
  return frag;
}
