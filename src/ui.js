// #dev/creator:tubakhxn
import { TOPOLOGIES, P, PER, N, CLUSTERS } from './graph.js';
import { TAN } from './scene.js';
import { mulberry32, smoothstep, clamp, SmoothDamp1, SmoothDamp2 } from './math.js';

const PATTERNS = TOPOLOGIES;
const MONO = '"JetBrains Mono","SF Mono","Cascadia Mono",Consolas,Menlo,monospace';

export class Labels {
  constructor(canvas, graph) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.g = graph; this.dpr = 1; this.W = 1; this.H = 1;
    this.hover = -1; this.hoverRect = null; this.actRect = null; this.hoverT = 0;
  }
  resize(W, H, dpr) { this.W = W; this.H = H; this.dpr = dpr; this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr); }

  _rect(n, px) {
    const g = this.g, ls = g.notes.lines[n], w = g.notes.maxChars[n] * px * 0.6, h = ls.length * px * 1.18;
    return { x: g.sx[n] + px * 0.5 - 7, y: g.sy[n] - px * 0.75 - 4, w: w + 14, h: h + 8 };
  }
  _brackets(r, color, a, len) {
    const c = this.ctx, l = Math.min(len, r.w / 3, r.h / 3);
    c.strokeStyle = color; c.globalAlpha = a; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(r.x, r.y + l); c.lineTo(r.x, r.y); c.lineTo(r.x + l, r.y);
    c.moveTo(r.x + r.w - l, r.y); c.lineTo(r.x + r.w, r.y); c.lineTo(r.x + r.w, r.y + l);
    c.moveTo(r.x + r.w, r.y + r.h - l); c.lineTo(r.x + r.w, r.y + r.h); c.lineTo(r.x + r.w - l, r.y + r.h);
    c.moveTo(r.x + l, r.y + r.h); c.lineTo(r.x, r.y + r.h); c.lineTo(r.x, r.y + r.h - l);
    c.stroke(); c.globalAlpha = 1;
  }
  _lerpRect(cur, to, k) { if (!cur) return { ...to }; for (const key of ['x', 'y', 'w', 'h']) cur[key] += (to[key] - cur[key]) * k; return cur; }

  pick(cx, cy, active, u) {
    const g = this.g; if (!active) { this.hover = -1; return -1; }
    let best = -1, bd = 1e9;
    for (let n = 0; n < N; n++) {
      if (g.depth[n] < 0.8 || g.fade[n] < 0.12) continue;
      const px = this._px(n); const r = px >= 6 ? this._rect(n, px) : { x: g.sx[n] - 6, y: g.sy[n] - 6, w: 12, h: 12 };
      const ex = Math.max(r.x - cx, 0, cx - (r.x + r.w)), ey = Math.max(r.y - cy, 0, cy - (r.y + r.h)), d = Math.hypot(ex, ey) + g.depth[n] * 0.4;
      if (d < bd) { bd = d; best = n; }
    }
    const lim = 46 * u;
    if (best >= 0 && bd < lim) {
      if (this.hover >= 0 && this.hover !== best) {
        const pr = this._px(this.hover), r = pr >= 6 ? this._rect(this.hover, pr) : { x: g.sx[this.hover] - 6, y: g.sy[this.hover] - 6, w: 12, h: 12 };
        const ex = Math.max(r.x - cx, 0, cx - (r.x + r.w)), ey = Math.max(r.y - cy, 0, cy - (r.y + r.h)), dc = Math.hypot(ex, ey) + g.depth[this.hover] * 0.4;
        if (dc < bd + 14 * u && dc < lim) return this.hover;
      }
      this.hover = best;
    } else this.hover = -1;
    return this.hover;
  }

  _px(n) { const g = this.g, ppu = this.H / (2 * Math.max(0.1, g.depth[n]) * TAN); return (n % PER === 0 ? 0.16 : 0.1) * ppu; }

  draw(dt, cursorActive, cx, cy, S, u) {
    const c = this.ctx, g = this.g, W = this.W, H = this.H;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, W, H);
    c.textBaseline = 'alphabetic';
    const k = 1 - Math.exp(-dt / 0.09);
    if (!this._ord) this._ord = Array.from({ length: N }, (_, i) => i);
    const ord = this._ord; ord.sort((a, b) => g.depth[b] - g.depth[a]);
    const act = clamp(Math.round(S), 0, P - 1);
    for (let oi = 0; oi < N; oi++) {
      const n = ord[oi], f = g.fade[n];
      if (f < 0.03) continue;
      const x = g.sx[n], y = g.sy[n];
      if (x < -300 || x > W + 300 || y < -200 || y > H + 200) continue;
      const px = this._px(n), head = n % PER === 0, hot = n === this.hover;
      if (head) { c.globalAlpha = f * 0.9; c.strokeStyle = '#4df0b8'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, Math.min(9, 3 + px * 0.12), 0, 6.2832); c.stroke(); }
      if (hot) { c.globalAlpha = 1; c.fillStyle = '#ff2d2d'; const s = Math.max(5, Math.min(10, px * 0.4)); c.fillRect(x - s / 2, y - s / 2, s, s); }
      if (px < 4.2) continue;
      const a = f * smoothstep(4.2, 7, px) * (Math.floor(n / PER) === act ? 1 : 0.8);
      const ls = g.notes.lines[n], size = Math.min(px, 64);
      c.font = `${head ? '600 ' : ''}${size.toFixed(1)}px ${MONO}`;
      c.globalAlpha = a;
      if (size > 9) { c.shadowColor = 'rgba(0,0,0,.85)'; c.shadowBlur = 4; } else c.shadowBlur = 0;
      c.fillStyle = hot ? '#ff3030' : head ? '#4df0b8' : '#ffffff';
      for (let i = 0; i < ls.length; i++) c.fillText(ls[i], x + size * 0.5, y + size * 0.3 + i * size * 1.18);
    }
    c.shadowBlur = 0; c.globalAlpha = 1;

    const hn = act * PER;
    if (g.fade[hn] > 0.05 && g.depth[hn] > 0.8) {
      const px = Math.min(this._px(hn), 64), r = px >= 5 ? this._rect(hn, px) : { x: g.sx[hn] - 14, y: g.sy[hn] - 14, w: 28, h: 28 };
      this.actRect = this._lerpRect(this.actRect, { x: r.x - 5, y: r.y - 5, w: r.w + 10, h: r.h + 10 }, k);
      this._brackets(this.actRect, '#ffffff', 0.85, 13);
    }
    if (this.hover >= 0) {
      const n = this.hover, px = Math.min(this._px(n), 64), r = px >= 6 ? this._rect(n, px) : { x: g.sx[n] - 10, y: g.sy[n] - 10, w: 20, h: 20 };
      this.hoverRect = this._lerpRect(this.hoverRect, { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 }, 1 - Math.exp(-dt / 0.06));
      this.hoverT = Math.min(1, this.hoverT + dt / 0.12);
      this._brackets(this.hoverRect, '#ffffff', this.hoverT, 11);
    } else { this.hoverT = 0; this.hoverRect = null; }
  }
}

export class Rail {
  constructor(root) {
    this.root = root;
    root.innerHTML = '<div class="rl-track"></div>' + Array.from({ length: P }, (_, i) => `<i class="rl-tick" style="top:${(i / (P - 1)) * 100}%"></i>`).join('') +
      '<i class="rl-mark"></i><div class="rl-num"></div>' +
      '<div class="gauge g1"><span>zoom</span><b><i id="g-zoom"></i></b></div>' +
      '<div class="gauge g2"><span>pinch</span><b><i id="g-pinch"></i></b></div>' +
      '<div class="gauge g3"><span>orbit</span><b class="mid"><i id="g-orbit"></i></b></div>' +
      '<div class="rl-state" id="g-state"></div>';
    this.mark = root.querySelector('.rl-mark'); this.num = root.querySelector('.rl-num');
    this.gz = root.querySelector('#g-zoom'); this.gp = root.querySelector('#g-pinch'); this.go = root.querySelector('#g-orbit'); this.gs = root.querySelector('#g-state');
  }
  update(S, zoom, close, state, orbit = 0) {
    this.mark.style.top = (clamp(S / (P - 1), 0, 1) * 100).toFixed(2) + '%';
    this.num.textContent = String(clamp(Math.round(S), 0, P - 1) + 1).padStart(2, '0') + ' / ' + String(P).padStart(2, '0');
    this.gz.style.transform = `scaleX(${clamp(zoom, 0, 1).toFixed(3)})`;
    this.gp.style.transform = `scaleX(${clamp(close, 0, 1).toFixed(3)})`;
    this.gp.parentElement.classList.toggle('hot', state === 'HELD' || state === 'RELEASING');
    const o = clamp(orbit, -1, 1);
    this.go.style.transform = `translateX(${(o * 50).toFixed(1)}%) scaleX(0.08)`;
    const lab = state === 'HELD' || state === 'RELEASING' ? 'pinch: locked' : state === 'CLOSING' ? 'pinch: closing' : state === 'COOLDOWN' ? 'pinch: cooldown' : 'pinch: armed';
    if (lab !== this._lab) { this._lab = lab; this.gs.textContent = lab; }
  }
}

export class Hud {
  constructor(idx, thumb, line) {
    this.idx = idx; this.thumb = thumb; this.line = line;
    this.pi = new SmoothDamp2(0, 0); this.pt = new SmoothDamp2(0, 0); this.op = new SmoothDamp1(0); this.init = false;
  }
  update(dt, W, H, present, idxP, thumbP, close, held) {
    if (!this.init && present) { this.pi.set(idxP.x * W, idxP.y * H); this.pt.set(thumbP.x * W, thumbP.y * H); this.init = true; }
    if (present) { this.pi.update(idxP.x * W, idxP.y * H, 0.05, dt); this.pt.update(thumbP.x * W, thumbP.y * H, 0.05, dt); }
    this.op.update(present ? 1 : 0, 0.25, dt);
    const o = clamp(this.op.value, 0, 1);
    const dx = this.pi.x - this.pt.x, dy = this.pi.y - this.pt.y, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    this.idx.style.transform = `translate3d(${this.pi.x.toFixed(1)}px,${this.pi.y.toFixed(1)}px,0) scale(${(1 - 0.3 * close).toFixed(3)})`;
    this.thumb.style.transform = `translate3d(${this.pt.x.toFixed(1)}px,${this.pt.y.toFixed(1)}px,0) scale(${(1 - 0.3 * close).toFixed(3)})`;
    this.line.style.transform = `translate3d(${this.pt.x.toFixed(1)}px,${this.pt.y.toFixed(1)}px,0) rotate(${ang.toFixed(4)}rad)`;
    this.line.style.width = len.toFixed(1) + 'px';
    for (const e of [this.idx, this.thumb]) { e.style.opacity = o.toFixed(3); e.classList.toggle('hot', held); }
    this.line.style.opacity = (o * 0.8).toFixed(3); this.line.classList.toggle('hot', held);
  }
}

function icon(pi) {
  const kind = PATTERNS[pi].kind, p = { wave: 0, sphere: 1, spiral: 2, neural: 3, galaxy: 4, clusters: 5 }[kind] ?? -1;
  const r = mulberry32(40 + pi), pts = [], lines = [];
  if (kind === 'centralized') { pts.push([32, 32]); for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283; pts.push([32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22]); lines.push([0, i + 1]); } }
  else if (kind === 'decentralized') { const hubs = [[18, 20], [46, 20], [32, 48]]; hubs.forEach((c, h) => { const b = pts.length; pts.push(c); for (let j = 0; j < 4; j++) { const a = (j / 4) * 6.283 + h; pts.push([c[0] + Math.cos(a) * 9, c[1] + Math.sin(a) * 9]); lines.push([b, b + j + 1]); } }); lines.push([0, 5], [5, 10], [10, 0]); }
  else if (kind === 'distributed') { for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283 + (i % 2) * 0.3, rr = 12 + (i % 3) * 8; pts.push([32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr]); } for (let i = 0; i < 12; i++) { lines.push([i, (i + 1) % 12]); if (i % 2 === 0) lines.push([i, (i + 5) % 12]); } }
  else if (p === 0) { for (let i = 0; i < 26; i++) pts.push([6 + i * 2.1, 32 + Math.sin(i * 0.5) * 12 + (r() - 0.5) * 3]); for (let i = 0; i < 25; i += 1) if (i % 2 === 0) lines.push([i, i + 1]); }
  else if (p === 1) { for (let i = 0; i < 28; i++) { const a = r() * 6.283, b = Math.acos(2 * r() - 1); pts.push([32 + Math.sin(b) * Math.cos(a) * 22, 32 + Math.cos(b) * 22]); } }
  else if (p === 2) { for (let i = 0; i < 22; i++) { const y = 6 + i * 2.5, a = i * 0.7; pts.push([32 + Math.cos(a) * 16, y], [32 + Math.cos(a + Math.PI) * 16, y]); if (i % 3 === 0) lines.push([pts.length - 2, pts.length - 1]); } }
  else if (p === 3) { for (let l = 0; l < 4; l++) for (let n = 0; n < 4; n++) pts.push([10 + l * 15, 12 + n * 13 + (r() - 0.5) * 4]); for (let l = 0; l < 3; l++) for (let n = 0; n < 4; n++) for (let m = 0; m < 4; m++) if (r() > 0.55) lines.push([l * 4 + n, (l + 1) * 4 + m]); }
  else if (p === 4) { for (let i = 0; i < 40; i++) { const rad = 3 + i * 0.7, a = i * 0.45 + (i % 2) * Math.PI; pts.push([32 + Math.cos(a) * rad, 32 + Math.sin(a) * rad * 0.8]); } }
  else { [[18, 20], [46, 22], [32, 46]].forEach((c) => { const h = pts.length; pts.push(c); for (let j = 0; j < 5; j++) { pts.push([c[0] + (r() - 0.5) * 16, c[1] + (r() - 0.5) * 16]); lines.push([h, h + j + 1]); } }); }
  const ls = lines.map(([a, b]) => `<line x1="${pts[a][0].toFixed(1)}" y1="${pts[a][1].toFixed(1)}" x2="${pts[b][0].toFixed(1)}" y2="${pts[b][1].toFixed(1)}"/>`).join('');
  const ds = pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.7"/>`).join('');
  return `<svg viewBox="0 0 64 64" width="56" height="56"><g stroke="#fff" stroke-width="0.8" fill="#fff">${ls}${ds}</g></svg>`;
}

export class SidePanel {
  constructor() {
    this.iconEl = document.getElementById('icon'); this.name = document.getElementById('mode-name'); this.desc = document.getElementById('mode-desc'); this.count = document.getElementById('mode-count'); this.info = document.getElementById('mode-info'); this._k = '';
    this.box = document.getElementById('panel'); this.icons = PATTERNS.map((_, i) => icon(i)); this.cur = -1;
  }
  setPattern(p) {
    if (p === this.cur) return;
    const first = this.cur < 0; this.cur = p;
    const apply = () => {
      this.iconEl.innerHTML = this.icons[p]; this.name.textContent = `mode: ${PATTERNS[p].name}`; this.count.textContent = `pattern ${String(p + 1).padStart(2, '0')} / ${String(PATTERNS.length).padStart(2, '0')}`; this.desc.textContent = PATTERNS[p].desc;
      this.box.classList.remove('swap');
    };
    if (first) apply(); else { this.box.classList.add('swap'); setTimeout(apply, 240); }
  }
}

SidePanel.prototype.setCluster = function (c, st) {
  const k = c + ':' + st.links + ':' + st.total;
  if (k === this._k) return; this._k = k;
  const cl = CLUSTERS[c];
  this.info.innerHTML = `<b>${cl.title}</b><span>${cl.kind} · nodes ${st.nodes} · links ${st.links.toLocaleString('en-US')} · density ${st.density.toFixed(2)}</span><em>${cl.desc}</em>`;
};

export class Toast {
  constructor(el) { this.el = el; }
  show(msg, ms = 5000) { this.el.textContent = msg; this.el.classList.add('on'); clearTimeout(this._t); this._t = setTimeout(() => this.el.classList.remove('on'), ms); }
}
