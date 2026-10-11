import { mulberry32 } from './math.js';

/* Layout of the particle field.
 * Particle i belongs to panel (i % P) and has rank floor(i / P) inside its cell.
 * Interleaving means a draw-range reduction thins every cell equally (adaptive quality). */
export const P = 8;          // panels / cells
export const M = 1800;       // particles per cell
export const N = P * M;
export const HUB = 36;       // first HUB ranks of every cell also act as line-mesh hubs
export const SP = 6.4;       // world spacing between panels along -Z
export const CELL_Z = -1.0;  // cell centre sits just behind its panel plane
export const DL = 0.55;      // morph stagger window

export const PATTERNS = [
  { kind: 'centralized', name: 'centralized', desc: 'one hub, every node routed through the centre' },
  { kind: 'decentralized', name: 'decentralized', desc: 'several regional hubs, each serving its own cluster' },
  { kind: 'distributed', name: 'distributed', desc: 'a peer mesh with no centre; every node links to its neighbours' },
  { kind: 'neural', name: 'neural network', desc: 'layers of nodes linked by streams of signal' },
  { kind: 'galaxy', name: 'galaxy', desc: 'spiral arms turning around a bright core' },
  { kind: 'clusters', name: 'thought clusters', desc: 'dense ideas bridged by thin threads' },
  { kind: 'wave', name: 'flowing wave', desc: 'ribbons of particles drifting in a travelling wave' },
  { kind: 'sphere', name: 'sphere', desc: 'a luminous shell with a faint inner core' },
  { kind: 'spiral', name: 'spiral', desc: 'two strands winding around a shared axis' }
];
// per-pattern spin (rad/s about local Y), tilt (rad about X) - mirrored in the GLSL (same index as PATTERNS)
export const OMEGA = [0.10, 0.08, 0.06, 0.05, 0.22, 0.07, 0.0, 0.16, 0.5];
export const TILT = [0.22, 0.25, 0.3, 0.12, 1.0, 0.25, 0.5, 0.2, 0.28];
export const isWave = (p) => (PATTERNS[p].kind === 'wave' ? 1 : 0);

export const panelPath = (i) => ({ x: Math.sin(i * 1.37 + 0.4) * 1.5, y: Math.cos(i * 0.93) * 0.55, z: -i * SP });
export function pathAt(S) {
  const s = Math.min(Math.max(S, 0), P - 1);
  const i0 = Math.min(Math.floor(s), P - 2), f0 = s - i0, f = f0 * f0 * (3 - 2 * f0);
  const a = panelPath(i0), b = panelPath(i0 + 1);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

const TAU = Math.PI * 2;
const gauss = (r) => (r() + r() + r() + r() - 2) * 1.7;


/* ---- network topologies (Baran): centralized / decentralized / distributed ----
 * Every graph has exactly HUB nodes; those nodes are the first HUB ranks of the cell, so they are drawn as the
 * large "node" particles. All other particles are streamed along the edges. */
function topology(kind, r) {
  const nodes = [], edges = [];
  const fib = (i, n, R) => { const y = 1 - 2 * (i + 0.5) / n, rad = Math.sqrt(Math.max(0, 1 - y * y)), ph = i * 2.399963; return [Math.cos(ph) * rad * R, y * R * 0.85, Math.sin(ph) * rad * R]; };
  if (kind === 'centralized') {
    nodes.push([0, 0, 0]);
    for (let i = 1; i < HUB; i++) { nodes.push(fib(i - 1, HUB - 1, 2.3 + (r() - 0.5) * 0.3)); edges.push([0, i]); }
  } else if (kind === 'decentralized') {
    const H = 4, per = (HUB - H) / H;
    for (let h = 0; h < H; h++) { const a = (h / H) * TAU + 0.5; nodes.push([Math.cos(a) * 1.55, (r() - 0.5) * 0.8, Math.sin(a) * 1.55]); }
    for (let h = 0; h < H; h++) edges.push([h, (h + 1) % H]);
    edges.push([0, 2]);
    for (let h = 0; h < H; h++) for (let j = 0; j < per; j++) {
      const s = fib(j, per, 1.05), c = nodes[h], idx = nodes.length;
      nodes.push([c[0] + s[0] * 0.95 + c[0] * 0.35, c[1] + s[1], c[2] + s[2] * 0.95 + c[2] * 0.35]); edges.push([h, idx]);
    }
  } else {
    let tries = 0;
    while (nodes.length < HUB && tries < 4000) {
      tries++;
      const p = [(r() * 2 - 1) * 2.5, (r() * 2 - 1) * 1.9, (r() * 2 - 1) * 2.1];
      if (p[0] * p[0] / 6.25 + p[1] * p[1] / 3.6 + p[2] * p[2] / 4.4 > 1) continue;
      if (nodes.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 0.75)) continue;
      nodes.push(p);
    }
    while (nodes.length < HUB) nodes.push([(r() * 2 - 1) * 2, (r() * 2 - 1) * 1.5, (r() * 2 - 1) * 2]);
    const seen = new Set();
    nodes.forEach((p, i) => {
      nodes.map((q, j) => [Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), j]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]).slice(0, 3)
        .forEach(([, j]) => { const key = i < j ? i * 100 + j : j * 100 + i; if (!seen.has(key)) { seen.add(key); edges.push([i, j]); } });
    });
  }
  return { nodes, edges };
}

function graph(nodes, edges, r, put) {
  const nn = nodes.length;
  for (let k = 0; k < M; k++) {
    if (k < HUB || r() < 0.1) {
      const nd = nodes[k < HUB ? k : Math.floor(r() * nn)];
      put(k, nd[0] + gauss(r) * 0.03, nd[1] + gauss(r) * 0.03, nd[2] + gauss(r) * 0.03, 4.6 + r() * 1.2);
    } else {
      const e = edges[Math.floor(r() * edges.length)], a = nodes[e[0]], b = nodes[e[1]], t = r();
      put(k, a[0] + (b[0] - a[0]) * t + gauss(r) * 0.01, a[1] + (b[1] - a[1]) * t + gauss(r) * 0.01, a[2] + (b[2] - a[2]) * t + gauss(r) * 0.01, 2.3 + r() * 0.9);
    }
  }
}

/* ---- signal lanes: curved links between consecutive information panels (world space, cubic Bezier) ---- */
export function buildLanes() {
  const lanes = [];
  const add = (i, j, ax, ay, bx, by, bow, ph) => {
    const pa = panelPath(i), pb = panelPath(j), dz = pb.z - pa.z;
    const p0 = [pa.x + ax, pa.y + ay, pa.z], p3 = [pb.x + bx, pb.y + by, pb.z];
    lanes.push({ from: i, to: j, ph, p: [p0, [p0[0] + bow, p0[1] - 0.5 * Math.sign(ay || 1), pa.z + dz * 0.36], [p3[0] - bow, p3[1] + 0.5 * Math.sign(by || 1), pa.z + dz * 0.64], p3] });
  };
  for (let i = 0; i < P - 1; i++) {
    add(i, i + 1, 1.7, -1.2, -1.7, 1.2, 1.3, (i * 0.37) % 1);
    add(i, i + 1, -1.7, -1.2, 1.7, 1.2, -1.3, (i * 0.37 + 0.5) % 1);
    if (i + 2 < P) add(i, i + 2, 0, -1.35, 0, 1.35, i % 2 ? 0.9 : -0.9, (i * 0.23 + 0.2) % 1);
  }
  return lanes;
}
export function bezier(p, t, out = [0, 0, 0]) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  for (let k = 0; k < 3; k++) out[k] = a * p[0][k] + b * p[1][k] + c * p[2][k] + d * p[3][k];
  return out;
}

/** Generate one pattern for every cell. Returns local-space positions (cell centre = origin) and point sizes. */
export function generate(pat) {
  const kind = PATTERNS[pat].kind;
  const pos = new Float32Array(N * 3), size = new Float32Array(N);
  for (let c = 0; c < P; c++) {
    const r = mulberry32(7919 * (pat + 1) + c * 131 + 17);
    const phase = c * 1.9;                // rotate each cell differently around Y so panels never look identical
    const cp = Math.cos(phase), sp = Math.sin(phase);
    const put = (rank, x, y, z, s) => {
      const i = (rank * P + c) * 3;
      pos[i] = cp * x + sp * z; pos[i + 1] = y; pos[i + 2] = -sp * x + cp * z;
      size[rank * P + c] = rank < HUB ? s * 1.7 : s;
    };
    if (kind === 'wave') {                // flowing wave: 14 ribbons
      for (let k = 0; k < M; k++) {
        const x = (r() * 2 - 1) * 3.6, line = Math.floor(r() * 14), z = -1.9 + (line / 13) * 3.8 + gauss(r) * 0.03;
        const y = 0.55 * Math.sin(1.25 * x + 0.7 * z + c) + 0.25 * Math.sin(2.3 * z - 0.8 * x) + gauss(r) * 0.025;
        put(k, x, y, z, 3.0 + r() * 1.6);
      }
    } else if (kind === 'sphere') {       // sphere: fibonacci shell + inner core
      for (let k = 0; k < M; k++) {
        const inner = r() < 0.12, y0 = 1 - 2 * (k + 0.5) / M, rad = Math.sqrt(Math.max(0, 1 - y0 * y0)), ph = k * 2.399963;
        const R = inner ? 2.35 * (0.15 + 0.7 * r()) : 2.35 * (1 + gauss(r) * 0.015);
        put(k, Math.cos(ph) * rad * R, y0 * R, Math.sin(ph) * rad * R, inner ? 2.4 : 3.2 + r() * 1.4);
      }
    } else if (kind === 'spiral') {       // double helix with rungs (axis = Y)
      for (let k = 0; k < M; k++) {
        const s = (r() * 2 - 1) * 3.3;
        if (r() < 0.16) {
          const sr = Math.round(s * 3.5) / 3.5, a = sr * 2.6, t = r();
          const x1 = Math.cos(a) * 1.25, z1 = Math.sin(a) * 1.25;
          put(k, x1 * (1 - 2 * t), sr, z1 * (1 - 2 * t), 2.4);
        } else {
          const strand = k % 2, a = s * 2.6 + strand * Math.PI, rad = 1.25 + gauss(r) * 0.045;
          put(k, Math.cos(a) * rad, s, Math.sin(a) * rad, 3.4 + r() * 1.6);
        }
      }
    } else if (kind === 'neural') {       // neural network: 5 layers of nodes, signal streams on the edges
      const L = 5, per = 11, nodes = [];
      for (let l = 0; l < L; l++) {
        const arr = [];
        for (let n = 0; n < per; n++) { const a = r() * TAU, rr = Math.sqrt(r()); arr.push([-3.2 + l * 1.6, Math.cos(a) * rr * 1.9, Math.sin(a) * rr * 1.5]); }
        nodes.push(arr);
      }
      for (let k = 0; k < M; k++) {
        if (r() < 0.14) {
          const nd = nodes[Math.floor(r() * L)][Math.floor(r() * per)];
          put(k, nd[0] + gauss(r) * 0.05, nd[1] + gauss(r) * 0.05, nd[2] + gauss(r) * 0.05, 6.0 + r() * 1.5);
        } else {
          const l = Math.floor(r() * (L - 1)), a = nodes[l][Math.floor(r() * per)], b = nodes[l + 1][Math.floor(r() * per)], t = r();
          put(k, a[0] + (b[0] - a[0]) * t + gauss(r) * 0.012, a[1] + (b[1] - a[1]) * t + gauss(r) * 0.012, a[2] + (b[2] - a[2]) * t + gauss(r) * 0.012, 2.4 + r() * 0.8);
        }
      }
    } else if (kind === 'galaxy') {       // galaxy: two logarithmic arms + core bulge (disc normal = Y)
      for (let k = 0; k < M; k++) {
        if (r() < 0.2) {
          put(k, gauss(r) * 0.42, gauss(r) * 0.22, gauss(r) * 0.42, 3.4 + r() * 1.6);
        } else {
          const rad = Math.pow(r(), 0.62) * 3.5 + 0.2, arm = k % 2, a = arm * Math.PI + rad * 1.15 + gauss(r) * (0.14 + rad * 0.03);
          put(k, Math.cos(a) * rad, gauss(r) * 0.1 * (1 - rad / 4.4), Math.sin(a) * rad, 2.6 + r() * 1.6);
        }
      }
    } else if (kind === 'centralized' || kind === 'decentralized' || kind === 'distributed') {
      const g = topology(kind, r);
      graph(g.nodes, g.edges, r, put);
    } else {                              // clustered thought structure: 7 blobs + bridges
      const centers = [];
      for (let n = 0; n < 7; n++) {
        let tries = 0, p;
        do { const a = r() * TAU, b = r() * 2 - 1, s = Math.sqrt(1 - b * b), d = 1.1 + r() * 1.5; p = [Math.cos(a) * s * d * 1.35, b * d, Math.sin(a) * s * d]; tries++; }
        while (tries < 30 && centers.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1.5));
        centers.push(p);
      }
      for (let k = 0; k < M; k++) {
        if (r() < 0.2) {
          const a = centers[Math.floor(r() * 7)], b = centers[Math.floor(r() * 7)], t = r();
          put(k, a[0] + (b[0] - a[0]) * t + gauss(r) * 0.04, a[1] + (b[1] - a[1]) * t + gauss(r) * 0.04, a[2] + (b[2] - a[2]) * t + gauss(r) * 0.04, 2.2 + r());
        } else {
          const cc = centers[Math.floor(Math.pow(r(), 1.3) * 7)], s = 0.3 + 0.12 * r();
          put(k, cc[0] + gauss(r) * s, cc[1] + gauss(r) * s, cc[2] + gauss(r) * s, 3.0 + r() * 1.8);
        }
      }
    }
  }
  return { pos, size };
}

/** Thin-line mesh between hub particles. Topology is fixed; the lines deform with the hubs as patterns morph. */
export function hubEdges() {
  const idx = [];
  for (let c = 0; c < P; c++) {
    const h = (k) => ((k % HUB) * P + c);
    for (let k = 0; k < HUB; k++) {
      idx.push(h(k), h(k + 1));
      if (k % 2 === 0) idx.push(h(k), h(k + 5));
      if (k % 3 === 0) idx.push(h(k), h(k + 11));
    }
  }
  return new Uint16Array(idx);
}
