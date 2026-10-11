// #dev/creator:tubakhxn
import { mulberry32, clamp } from './math.js';

export const P = 8;
export const PER = 24;
export const N = P * PER;

export const TOPOLOGIES = [
  { kind: 'centralized', name: 'centralized', desc: 'one central thought connected to all other thoughts' },
  { kind: 'decentralized', name: 'decentralized', desc: 'notes in different clusters by topic' },
  { kind: 'distributed', name: 'distributed', desc: 'notes connected by relationships via edges' },
  { kind: 'neural', name: 'neural network', desc: 'layers of thoughts passing signals forward' }
];

const VOC = [
  ['notation', 'the score', 'generative music', 'glyphs', 'diagrams', 'live coding', 'algorithmic art', 'symbols', 'cellular automata', 'sketches', 'plotter drawings', 'scripts'],
  ['morphogenesis', 'self-organization', 'reaction-diffusion', 'biomimetics', 'swarms', 'pattern formation', 'cells', 'growth rules', 'turing patterns', 'ant colonies', 'evolution', 'fractals'],
  ['the desktop manifold', 'interfaces', 'latent surfaces', 'windows', 'typography', 'spatial layouts', 'gestures', 'cursors', 'menus', 'pixels', 'dashboards', 'canvas'],
  ['hypertext', 'the memex', 'the web', 'index cards', 'zettelkasten', 'footnotes', 'hyperlinks', 'bush and nelson', 'card catalogs', 'backlinks', 'marginalia', 'the archive'],
  ['language invention', 'grounded meaning', 'embeddings', 'agents', 'mistral-7b', 'representation', 'concepts', 'syntax', 'attention', 'reasoning', 'tokens', 'minds'],
  ['symbolic abstraction', 'visual grammar', 'graphs', 'data art', 'maps', 'charts', 'metaphor', 'manipulation', 'encodings', 'small multiples', 'topology', 'projection'],
  ['entropy', 'insight', 'compression', 'surprise', 'proofs', 'mathematicians', 'information gain', 'bits', 'signal', 'noise', 'intuition', 'aha moments'],
  ['possibility space', 'future work', 'open questions', 'adjacent possible', 'speculation', 'prototypes', 'roadmaps', 'unknowns', 'next steps', 'experiments', 'dreams', 'drafts']
];
const TEMPLATES = [
  (a) => a, (a, b) => `${a} and ${b}`, (a, b) => `${a} as a tool for ${b}`, (a, b) => `on ${a}, ${b}`, (a, b) => `${a} / ${b}`,
  (a) => `notes on ${a}`, (a, b) => `why ${a} shapes ${b}`, (a) => `${a} (draft)`, (a, b) => `${a} ~ ${b}`, (a, b) => `how ${a} meets ${b}`,
  (a, b) => `${a}: a field guide to ${b}`, (a) => `towards a theory of ${a}`
];

export const CLUSTERS = [
  { title: '[Generative Media & Notation]', desc: 'the evolution of notation in arts and sciences', kind: 'essay' },
  { title: '[Artificial Life & Morphogenesis]', desc: 'self-organization, morphogenesis, biomimetics, pattern formation', kind: 'archive' },
  { title: '[Interface Design & Aesthetics]', desc: 'beyond the surface interfaces that are latent in desktop manifold', kind: 'notes' },
  { title: '[History of Information Tools]', desc: 'hypertext and the web, the memex, notation as a tool for thought', kind: 'index' },
  { title: '[Cognition, Language & AI]', desc: 'a grounded and naturalistic approach to language invention', kind: 'survey' },
  { title: '[Visualization & Symbolic Abstraction]', desc: 'visualizing and manipulating symbolic abstraction', kind: 'sketchbook' },
  { title: '[Information Theory & Insight]', desc: "an information theoretic foreshadowing of mathematicians' sudden insights", kind: 'paper' },
  { title: '[Possibility Space]', desc: 'possibility space and the range of future work', kind: 'map' }
];

function wrap(s, w = 18) {
  const out = []; let line = '';
  for (const word of s.split(' ')) {
    if (line && (line + ' ' + word).length > w) { out.push(line); line = word; } else line = line ? line + ' ' + word : word;
  }
  if (line) out.push(line);
  return out;
}

export function buildNotes() {
  const lines = [], isHead = new Uint8Array(N), cluster = new Uint8Array(N), maxChars = new Uint8Array(N);
  for (let c = 0; c < P; c++) {
    const r = mulberry32(31 + c * 17), voc = VOC[c], seen = new Set();
    for (let i = 0; i < PER; i++) {
      const n = c * PER + i; cluster[n] = c;
      let ls;
      if (i === 0) { isHead[n] = 1; ls = wrap(CLUSTERS[c].title, 20); }
      else {
        let s, g = 0;
        do { const a = voc[Math.floor(r() * voc.length)], b = voc[Math.floor(r() * voc.length)]; s = TEMPLATES[Math.floor(r() * TEMPLATES.length)](a, b); g++; } while (seen.has(s) && g < 40);
        seen.add(s); ls = wrap(s, 18);
      }
      lines.push(ls); maxChars[n] = Math.max(...ls.map((l) => l.length));
    }
  }
  return { lines, isHead, cluster, maxChars };
}

const gauss = (r) => (r() + r() + r() + r() - 2) * 1.7;
const fibDir = (i, n) => { const y = 1 - 2 * (i + 0.5) / n, rad = Math.sqrt(Math.max(0, 1 - y * y)), ph = i * 2.399963; return [Math.cos(ph) * rad, y, Math.sin(ph) * rad]; };

export function layout(kind) {
  const r = mulberry32(1234 + kind.length * 7), pos = new Float32Array(N * 3), edges = [];
  const put = (n, x, y, z) => { pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z; };
  const around = (c, cx, cy, cz, s) => { for (let i = 0; i < PER; i++) { const n = c * PER + i; put(n, cx + gauss(r) * s, cy + gauss(r) * s * 0.8, cz + gauss(r) * s); } };
  if (kind === 'centralized') {
    for (let c = 0; c < P; c++) { const d = fibDir(c, P); around(c, d[0] * 6, d[1] * 4.2, d[2] * 5, 1.35); }
    put(0, 0, 0, 0);
    for (let n = 1; n < N; n++) edges.push([0, n]);
  } else if (kind === 'decentralized') {
    for (let c = 0; c < P; c++) { const a = (c / P) * Math.PI * 2 + 0.4; around(c, Math.cos(a) * 7, Math.sin(a * 2.1) * 2.2, Math.sin(a) * 5, 1.3); }
    for (let c = 0; c < P; c++) {
      const h = c * PER;
      for (let i = 1; i < PER; i++) edges.push([h, h + i]);
      edges.push([h, ((c + 1) % P) * PER]);
      if (c % 2 === 0) edges.push([h, ((c + 3) % P) * PER]);
    }
  } else if (kind === 'distributed') {
    const cs = [];
    for (let c = 0; c < P; c++) {
      let p, t = 0;
      do { p = [(r() * 2 - 1) * 6.5, (r() * 2 - 1) * 3.6, (r() * 2 - 1) * 5]; t++; } while (t < 60 && cs.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 4.2));
      cs.push(p); around(c, p[0], p[1], p[2], 1.9);
    }
    const seen = new Set();
    for (let a = 0; a < N; a++) {
      const d = [];
      for (let b = 0; b < N; b++) if (b !== a) d.push([Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]), b]);
      d.sort((x, y) => x[0] - y[0]);
      for (let k = 0; k < 2; k++) { const b = d[k][1], key = a < b ? a * N + b : b * N + a; if (!seen.has(key)) { seen.add(key); edges.push([a, b]); } }
    }
  } else {
    const L = 5, layers = Array.from({ length: L }, () => []);
    for (let c = 0; c < P; c++) for (let i = 0; i < PER; i++) {
      const n = c * PER + i, l = i % L; layers[l].push(n);
      put(n, -7.2 + l * 3.6 + gauss(r) * 0.35, (c - (P - 1) / 2) * 1.15 + gauss(r) * 0.3, gauss(r) * 1.6);
    }
    for (let l = 0; l < L - 1; l++) for (const n of layers[l]) for (let k = 0; k < 2; k++) edges.push([n, layers[l + 1][Math.floor(r() * layers[l + 1].length)]]);
  }
  return { pos, edges };
}

const SIG = 90;

export class Graph {
  constructor() {
    this.notes = buildNotes();
    this.layouts = TOPOLOGIES.map((t) => layout(t.kind));
    const key = new Map(); this.ea = []; this.eb = []; const mask = [];
    this.layouts.forEach((L, ti) => L.edges.forEach(([a, b]) => {
      const k = a < b ? a * N + b : b * N + a;
      let id = key.get(k);
      if (id === undefined) { id = this.ea.length; key.set(k, id); this.ea.push(a); this.eb.push(b); mask.push(0); }
      mask[id] |= 1 << ti;
    }));
    this.E = this.ea.length; this.mask = Uint8Array.from(mask);
    this.edgeW = new Float32Array(this.E);
    this.cur = 0;
    for (let e = 0; e < this.E; e++) this.edgeW[e] = this.mask[e] & 1 ? 1 : 0;

    this.pos = new Float32Array(this.layouts[0].pos); this.vel = new Float32Array(N * 3); this.tgt = new Float32Array(this.layouts[0].pos);
    this.dpos = new Float32Array(this.pos);
    const r = mulberry32(5); this.stagger = new Float32Array(N); this.st = new Float32Array(N); this.wait = new Float32Array(N); this.applied = new Uint8Array(N).fill(1);
    for (let n = 0; n < N; n++) { this.stagger[n] = r() * 0.4; this.st[n] = 0.45 + r() * 0.3; }
    this.cent = new Float32Array(P * 3); this._cent();
    this.sx = new Float32Array(N); this.sy = new Float32Array(N); this.depth = new Float32Array(N); this.fade = new Float32Array(N);
    this.sigE = new Int32Array(SIG); this.sigU = new Float32Array(SIG); this.sigSp = new Float32Array(SIG); this.sigPos = new Float32Array(SIG * 3); this.sigA = new Float32Array(SIG);
    for (let i = 0; i < SIG; i++) { this.sigE[i] = this._pickEdge(r); this.sigU[i] = r(); this.sigSp[i] = 0.18 + r() * 0.35; }
    this._r = r; this.morphing = false;
  }

  _pickEdge(r) { for (let k = 0; k < 20; k++) { const e = Math.floor(r() * this.E); if (this.mask[e] & (1 << this.cur)) return e; } return 0; }

  setPattern(i) {
    i = ((i % TOPOLOGIES.length) + TOPOLOGIES.length) % TOPOLOGIES.length;
    if (i === this.cur) return;
    this.cur = i;
    for (let n = 0; n < N; n++) { this.wait[n] = this.stagger[n]; this.applied[n] = 0; }
    this.morphing = true;
  }

  _cent() {
    for (let c = 0; c < P; c++) {
      let x = 0, y = 0, z = 0;
      for (let i = 0; i < PER; i++) { const o = (c * PER + i) * 3; x += this.pos[o]; y += this.pos[o + 1]; z += this.pos[o + 2]; }
      this.cent[c * 3] = x / PER; this.cent[c * 3 + 1] = y / PER; this.cent[c * 3 + 2] = z / PER;
    }
  }

  focusAt(S, out) {
    const s = clamp(S, 0, P - 1), i0 = Math.min(Math.floor(s), P - 2), f0 = s - i0, f = f0 * f0 * (3 - 2 * f0), a = i0 * 3, b = (i0 + 1) * 3;
    out.x = this.cent[a] + (this.cent[b] - this.cent[a]) * f; out.y = this.cent[a + 1] + (this.cent[b + 1] - this.cent[a + 1]) * f; out.z = this.cent[a + 2] + (this.cent[b + 2] - this.cent[a + 2]) * f;
    return out;
  }

  step(dt, t) {
    const L = this.layouts[this.cur].pos;
    let moving = 0;
    for (let n = 0; n < N; n++) {
      if (!this.applied[n]) {
        this.wait[n] -= dt;
        if (this.wait[n] <= 0) { this.applied[n] = 1; for (let k = 0; k < 3; k++) this.tgt[n * 3 + k] = L[n * 3 + k]; }
        moving = 1;
      }
      const omega = 2 / this.st[n], x = omega * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
      for (let k = 0; k < 3; k++) {
        const i = n * 3 + k, c = this.pos[i] - this.tgt[i], tmp = (this.vel[i] + omega * c) * dt;
        this.vel[i] = (this.vel[i] - omega * tmp) * e; this.pos[i] = this.tgt[i] + (c + tmp) * e;
      }
    }
    this.morphing = !!moving;
    const bit = 1 << this.cur, a = 1 - Math.exp(-dt / 0.4);
    for (let e = 0; e < this.E; e++) { const tw = this.mask[e] & bit ? 1 : 0; this.edgeW[e] += (tw - this.edgeW[e]) * a; }
    this._cent();
    for (let n = 0; n < N; n++) {
      const o = n * 3, p = n * 1.7;
      this.dpos[o] = this.pos[o] + 0.05 * Math.sin(t * 0.55 + p); this.dpos[o + 1] = this.pos[o + 1] + 0.05 * Math.sin(t * 0.47 + p * 1.3); this.dpos[o + 2] = this.pos[o + 2] + 0.05 * Math.sin(t * 0.61 + p * 0.7);
    }
    for (let i = 0; i < this.sigE.length; i++) {
      let u = this.sigU[i] + this.sigSp[i] * dt;
      if (u >= 1 || this.edgeW[this.sigE[i]] < 0.15) { u = 0; this.sigE[i] = this._pickEdge(this._r); }
      this.sigU[i] = u;
      const e = this.sigE[i], a2 = this.ea[e] * 3, b2 = this.eb[e] * 3, o = i * 3;
      for (let k = 0; k < 3; k++) this.sigPos[o + k] = this.dpos[a2 + k] + (this.dpos[b2 + k] - this.dpos[a2 + k]) * u;
      this.sigA[i] = this.edgeW[e] * Math.sin(Math.PI * u);
    }
  }

  stats(c) {
    let touch = 0; const lo = c * PER, hi = lo + PER, bit = 1 << this.cur;
    for (let e = 0; e < this.E; e++) if (this.mask[e] & bit) { const a = this.ea[e], b = this.eb[e]; if ((a >= lo && a < hi) || (b >= lo && b < hi)) touch++; }
    let total = 0; for (let e = 0; e < this.E; e++) if (this.mask[e] & bit) total++;
    return { nodes: PER, links: touch, density: Math.min(1, touch / (PER * (PER - 1) / 2)), total };
  }
}
