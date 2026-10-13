// Pulls Allwyn Sir's chapter content out of reference/sir-original/simulator/internals.html
// into src/content/chapters.json. Text and camera framing are kept verbatim; interactive
// widgets (sliders, buttons) are dropped and noted, because v2 rebuilds them as beats.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(process.argv[2] ?? 'reference/sir-original/simulator/internals.html', 'utf8');
const start = src.indexOf('const CH = [];');
const lastCh = src.lastIndexOf('ch({');
const end = src.indexOf('\n});', lastCh) + 4;
const block = src.slice(start, end);

const chapters = [];
// Stub whatever the templates touch; we only want the strings.
const stub = new Proxy({}, { get: () => stub, apply: () => '' });
const ctx = vm.createContext({
  S: { B0: 1.5 }, A: { shielded: true }, sliceS: {}, ks: {},
  ch: (o) => chapters.push(o), CH: [],
  Math, JSON, Number, String, Array, Object,
});
const fnStub = new Proxy(function () {}, { get: () => fnStub, apply: () => '' });
// Any undeclared identifier resolves to a harmless stub.
const body = block.replace('const CH = [];', '').replace('const ch = (o) => CH.push(o);', '');
const sandbox = new Proxy(ctx, { has: () => true, get: (t, k) => (k in t ? t[k] : k === Symbol.unscopables ? undefined : fnStub) });
vm.runInContext('with (sandbox) { ' + body + ' }', vm.createContext({ sandbox }));

// Sir's flow diagrams (<div class="flow"><span>A</span><em>does x</em>...) read as a chain of steps
const flow = (html) => html.replace(/<div class="flow">([\s\S]*?)<\/div>/g, (_, inner) => {
  const parts = [...inner.matchAll(/<span>(.*?)<\/span>\s*<em>(.*?)<\/em>/g)].map(([, a, b]) => `**${a}** ${b}`);
  return `<p>${parts.join(' → ')}.</p>`;
});

// remove whole <div class="ctrl"> blocks (sir's sliders and buttons), honouring nested divs
const dropCtrl = (html) => {
  let out = html, at;
  while ((at = out.indexOf('<div class="ctrl">')) !== -1) {
    let depth = 0, i = at;
    const re = /<div\b|<\/div>/g; re.lastIndex = at;
    for (let m; (m = re.exec(out)); ) { depth += m[0] === '</div>' ? -1 : 1; if (depth === 0) { i = re.lastIndex; break; } }
    out = out.slice(0, at) + out.slice(i);
  }
  return out;
};

const strip = (html) => dropCtrl(flow(html))
  .replace(/<p class="note">[\s\S]*?<\/p>/g, '')          // hints about the original's on-screen controls
  .replace(/<(li)>\s*<b>(.*?)<\/b>\s*<span>([\s\S]*?)<\/span>\s*<\/li>/g, '\n- **$2**: $3')
  .replace(/<b>(.*?)<\/b>/g, '**$1**')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[ \t]+/g, ' ').replace(/\n /g, '\n').replace(/\n{3,}/g, '\n\n').trim();

const out = chapters.map((c, i) => {
  const html = typeof c.html === 'function' ? String(c.html()) : '';
  const lead = /<p class="lead">([\s\S]*?)<\/p>/.exec(html)?.[1];
  const safety = /<div class="safety">([\s\S]*?)<\/div>/.exec(html)?.[1];
  return {
    id: `ch${String(i + 1).padStart(2, '0')}`,
    group: c.group, title: c.title,
    lead: lead && strip(lead),
    body: strip(html.replace(/<p class="lead">[\s\S]*?<\/p>/, '').replace(/<div class="safety">[\s\S]*?<\/div>/, '')),
    safety: safety && strip(safety),
    hadInteractive: /class="ctrl"/.test(html),
    legacyShot: { cam: c.cam, peel: c.peel, explode: c.explode, focus: c.focus, patient: c.patient },
    flags: Object.fromEntries(Object.entries(c).filter(([k, v]) => typeof v === 'boolean' && !['patient'].includes(k))),
  };
});
writeFileSync('src/content/chapters.json', JSON.stringify({ source: 'Allwyn3t6/MRI---safe-train internals.html', chapters: out }, null, 2));
console.log(out.map((c) => `${c.id} ${c.group} / ${c.title}  (${c.body.length} chars)`).join('\n'));
