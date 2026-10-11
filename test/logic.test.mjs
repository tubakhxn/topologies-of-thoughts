// #dev/creator:tubakhxn
import assert from 'node:assert/strict';
import { measureHand, PinchMachine } from '../src/gestures.js';
import { Controller } from '../src/navigation.js';
import { OneEuro, SmoothDamp1, Median3, Backlash } from '../src/math.js';
import { Graph, N, P, PER, TOPOLOGIES, layout, buildNotes } from '../src/graph.js';

let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };
const dt60 = 1 / 60, dt30 = 1 / 30;

function mkHand({ pd = 1.2, x = 0.5, y = 0.55, scale = 0.2, tilt = 0 }) {
  return { palm: { x, y }, idx: { x: x + 0.02, y: y - 0.1 }, thumb: { x: x - 0.04, y: y - 0.04 }, scale, pinch: pd, zTilt: tilt };
}
function sim(ctl, seconds, src, t0 = 0, rec) {
  let t = t0, nextDet = t0, out;
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    t += dt60;
    const hs = src(t);
    if (t >= nextDet) { nextDet += dt30; if (hs.length) ctl.ingest({ hands: hs, aspect: 1.78 }, t); }
    out = ctl.update(dt60, t);
    if (rec) rec(out, t);
  }
  return { t, out };
}
const noise = (seed) => { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; }; };

console.log('landmarks');
ok('measureHand: pinch ratio, palm scale, screen mapping', () => {
  const lm = Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + (i % 5) * 0.01, y: 0.5 - i * 0.01, z: 0 }));
  const wl = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  wl[9] = { x: 0, y: -0.09, z: 0 }; wl[4] = { x: 0.01, y: -0.05, z: 0 }; wl[8] = { x: 0.01, y: -0.05, z: 0 };
  const map = (nx, ny) => ({ x: 1 - nx, y: ny });
  let h = measureHand(lm, wl, map, 1280, 720);
  assert.ok(h.pinch < 0.01, 'touching tips -> ~0');
  wl[8] = { x: 0.12, y: -0.1, z: 0 }; h = measureHand(lm, wl, map);
  assert.ok(h.pinch > 1.2, 'open -> > 1.2 palm sizes ' + h.pinch);
  assert.ok(h.scale > 0 && h.palm.x < 0.55);
});

console.log('pinch state machine');
ok('fires exactly once while held for 3 s', () => {
  const m = new PinchMachine(); let starts = 0, rel = 0;
  for (let i = 0; i < 30; i++) m.update(1.2, true, dt30);
  for (let i = 0; i < 90; i++) { const e = m.update(0.15, true, dt30); if (e === 'start') starts++; if (e === 'release') rel++; }
  assert.equal(starts, 1); assert.equal(rel, 0); assert.equal(m.state, 'HELD');
});
ok('jitter around the threshold cannot retrigger (hysteresis)', () => {
  const m = new PinchMachine(); let starts = 0;
  for (let i = 0; i < 20; i++) m.update(1.2, true, dt30);
  for (let i = 0; i < 120; i++) { const e = m.update(i % 2 ? 0.26 : 0.36, true, dt30); if (e === 'start') starts++; }
  assert.ok(starts <= 1, 'starts ' + starts);
  for (let i = 0; i < 10; i++) if (m.update(0.15, true, dt30) === 'start') starts++;
  assert.equal(starts, 1);
  for (let i = 0; i < 200; i++) { const e = m.update(i % 2 ? 0.2 : 0.47, true, dt30); if (e) starts += 10; }
  assert.equal(starts, 1); assert.equal(m.state, 'HELD');
});
ok('one-frame glitch is debounced', () => {
  const m = new PinchMachine(); let starts = 0;
  for (let i = 0; i < 20; i++) m.update(1.2, true, dt30);
  if (m.update(0.1, true, dt30) === 'start') starts++;
  for (let i = 0; i < 20; i++) if (m.update(1.2, true, dt30) === 'start') starts++;
  assert.equal(starts, 0);
});
ok('release re-arms; second pinch fires; refractory blocks rapid re-fire', () => {
  const m = new PinchMachine(); const ev = [];
  const run = (p, s) => { for (let i = 0; i < s * 60; i++) { const e = m.update(p, true, dt60); if (e) ev.push(e); } };
  run(1.2, 0.3); run(0.15, 0.5); run(1.2, 0.2); run(0.15, 0.1);
  assert.deepEqual(ev, ['start', 'release']);
  run(1.2, 0.8); run(0.15, 0.4);
  assert.deepEqual(ev, ['start', 'release', 'start']);
});
ok('hand lost while pinching never fires again on return (until released)', () => {
  const m = new PinchMachine(); let starts = 0;
  for (let i = 0; i < 20; i++) m.update(1.2, true, dt30);
  for (let i = 0; i < 10; i++) if (m.update(0.1, true, dt30) === 'start') starts++;
  for (let i = 0; i < 30; i++) m.update(0.1, false, dt30);
  for (let i = 0; i < 30; i++) if (m.update(0.1, true, dt30) === 'start') starts++;
  assert.equal(starts, 1);
});
ok('controller emits exactly one pattern event per pinch', () => {
  const c = new Controller(8); let ev = 0;
  const src = (t) => [mkHand({ pd: t < 1 ? 1.3 : t < 3 ? 0.14 : 1.3 })];
  sim(c, 5, src, 0, () => { ev += c.drainEvents().filter((e) => e.type === 'pattern').length; });
  assert.equal(ev, 1);
});

console.log('zoom (index-thumb distance)');
ok('wider fingers -> zoom in, closer -> zoom out, monotone', () => {
  const c = new Controller(8); let prev = -1, mono = true;
  const r1 = sim(c, 3, () => [mkHand({ pd: 0.7 })]);
  const lo = r1.out.zoom;
  const r2 = sim(c, 1.5, () => [mkHand({ pd: 1.4 })], r1.t, (o) => { if (o.zoom < prev - 1e-9) mono = false; prev = o.zoom; });
  assert.ok(r2.out.zoom > lo + 0.4, `zoom ${lo.toFixed(2)} -> ${r2.out.zoom.toFixed(2)}`); assert.ok(mono, 'no overshoot / no wobble');
  const r3 = sim(c, 1.5, () => [mkHand({ pd: 0.7 })], r2.t);
  assert.ok(r3.out.zoom < r2.out.zoom - 0.4);
});
ok('stationary hand + tracking noise: zoom jitter is negligible', () => {
  const c = new Controller(8), nz = noise(5); let maxStep = 0, last = null;
  const r0 = sim(c, 2, () => [mkHand({ pd: 1.0 })]);
  sim(c, 6, () => [mkHand({ pd: 1.0 + nz() * 0.08, x: 0.5 + nz() * 0.01, y: 0.55 + nz() * 0.01, scale: 0.2 + nz() * 0.004 })], r0.t, (o) => { if (last !== null) maxStep = Math.max(maxStep, Math.abs(o.zoom - last)); last = o.zoom; });
  assert.ok(maxStep < 0.0015, 'max per-frame zoom step ' + maxStep.toFixed(5));
});
ok('step input: zoom is slew-limited (no sudden jump) and never overshoots', () => {
  const c = new Controller(8); let maxStep = 0, last = null, peak = 0;
  const r0 = sim(c, 1.5, () => [mkHand({ pd: 0.6 })]);
  sim(c, 2, () => [mkHand({ pd: 1.45 })], r0.t, (o) => { if (last !== null) maxStep = Math.max(maxStep, Math.abs(o.zoom - last)); last = o.zoom; peak = Math.max(peak, o.zoom); });
  assert.ok(maxStep < 0.03, 'max step ' + maxStep.toFixed(4)); assert.ok(peak <= 1.0001);
});
ok('single-frame landmark spike is rejected', () => {
  const c = new Controller(8); let maxStep = 0, last = null;
  const r0 = sim(c, 2, () => [mkHand({ pd: 1.0 })]); let k = 0;
  sim(c, 2, () => [mkHand({ pd: ++k === 40 ? 2.0 : 1.0 })], r0.t, (o) => { if (last !== null) maxStep = Math.max(maxStep, Math.abs(o.zoom - last)); last = o.zoom; });
  assert.ok(maxStep < 0.002, 'spike leaked ' + maxStep);
});
ok('approaching a pinch does not leave the view zoomed out (zoom lock)', () => {
  const c = new Controller(8);
  const r0 = sim(c, 2.5, () => [mkHand({ pd: 1.3 })]); const before = r0.out.zoom;
  const r1 = sim(c, 2.5, (t) => [mkHand({ pd: Math.max(0.12, 1.3 - (t - r0.t) * 2.8) })], r0.t);
  assert.equal(r1.out.pinch, 'HELD');
  assert.ok(before - r1.out.zoom < 0.12, `zoom ${before.toFixed(2)} -> ${r1.out.zoom.toFixed(2)}`);
});
ok('hand moving toward the camera (palm scale up) increases zoom', () => {
  const c = new Controller(8);
  const r0 = sim(c, 2, () => [mkHand({ pd: 1.0, scale: 0.2 })]);
  const r1 = sim(c, 1.2, (t) => [mkHand({ pd: 1.0, scale: 0.2 + Math.min(0.1, (t - r0.t) * 0.12) })], r0.t);
  assert.ok(r1.out.zoom > r0.out.zoom + 0.05, `${r0.out.zoom.toFixed(2)} -> ${r1.out.zoom.toFixed(2)}`);
});

console.log('scroll');
ok('hand up scrolls forward with inertia, then magnet-snaps to a panel', () => {
  const c = new Controller(8); let mono = true, prev = 0, peakV = 0;
  const r0 = sim(c, 1, () => [mkHand({ y: 0.6 })]);
  const r1 = sim(c, 0.35, (t) => [mkHand({ y: 0.6 - (t - r0.t) * 0.55 })], r0.t, (o) => { peakV = Math.max(peakV, o.v); });
  const moved = r1.out.S; assert.ok(moved > 0.15, 'S ' + moved);
  const r2 = sim(c, 0.4, () => [], r1.t, (o) => { if (o.S < prev - 1e-6) mono = false; prev = o.S; });
  assert.ok(r2.out.S > moved + 0.05, 'keeps coasting after the hand leaves: ' + moved.toFixed(2) + ' -> ' + r2.out.S.toFixed(2));
  const r3 = sim(c, 3, () => [], r2.t);
  assert.ok(Math.abs(r3.out.S - Math.round(r3.out.S)) < 0.01, 'snapped ' + r3.out.S); assert.ok(Math.round(r3.out.S) >= 1, 'a swipe reaches the next panel'); assert.ok(mono);
});
ok('hand down scrolls backward', () => {
  const c = new Controller(8); c.jumpTo(4);
  const r0 = sim(c, 1, () => [mkHand({ y: 0.45 })]);
  const r1 = sim(c, 0.4, (t) => [mkHand({ y: 0.45 + (t - r0.t) * 0.5 })], r0.t);
  const r2 = sim(c, 3, () => [], r1.t);
  assert.ok(r2.out.S < 3.7, 'S ' + r2.out.S);
});
ok('still hand with jitter does not drift', () => {
  const c = new Controller(8), nz = noise(9);
  const r = sim(c, 8, () => [mkHand({ y: 0.55 + nz() * 0.012, x: 0.5 + nz() * 0.012, pd: 1.0 + nz() * 0.06 })]);
  assert.ok(Math.abs(r.out.S) < 0.02, 'S ' + r.out.S);
});
ok('scrolling is smooth: no per-frame jump in S during a swipe', () => {
  const c = new Controller(8); let maxStep = 0, last = 0;
  const r0 = sim(c, 1, () => [mkHand({ y: 0.6 })]);
  sim(c, 3, (t) => [mkHand({ y: 0.6 - Math.min(0.3, (t - r0.t) * 0.9) })], r0.t, (o) => { maxStep = Math.max(maxStep, Math.abs(o.S - last)); last = o.S; });
  assert.ok(maxStep < 0.1, 'max step ' + maxStep.toFixed(3));
});
ok('moving while pinching (hold) does not scroll', () => {
  const c = new Controller(8);
  const r0 = sim(c, 1.5, () => [mkHand({ pd: 1.3, y: 0.55 })]);
  const r1 = sim(c, 2, (t) => [mkHand({ pd: 0.12, y: 0.55 - (t - r0.t) * 0.12 })], r0.t);
  assert.equal(r1.out.pinch, 'HELD'); assert.ok(r1.out.S < 0.05, 'S ' + r1.out.S);
});
ok('fast finger spreading (zoom gesture) does not scroll', () => {
  const c = new Controller(8);
  const r0 = sim(c, 1.5, () => [mkHand({ pd: 0.7, y: 0.55 })]);
  const r1 = sim(c, 1.2, (t) => { const k = Math.min(1, (t - r0.t) * 2); return [{ ...mkHand({ pd: 0.7 + 0.7 * k, y: 0.55 }), idx: { x: 0.52, y: 0.45 - 0.08 * k } }]; }, r0.t);
  assert.ok(Math.abs(r1.out.S) < 0.12, 'S ' + r1.out.S);
});
ok('ends are rubber-banded (never beyond the first / last panel)', () => {
  const c = new Controller(8); let mn = 0, mx = 0;
  c.nudge(-8); sim(c, 1.5, () => [], 0, (o) => { mn = Math.min(mn, o.S); });
  c.jumpTo(7); c.nudge(8); sim(c, 1.5, () => [], 2, (o) => { mx = Math.max(mx, o.S); });
  assert.ok(mn > -0.9 && mx < 7.9, `${mn} ${mx}`);
});

console.log('two hands, index, idle');
ok('two hands apart zooms in, together zooms out', () => {
  const c = new Controller(8);
  const two = (gap) => [mkHand({ x: 0.5 - gap / 2, pd: 1.0 }), mkHand({ x: 0.5 + gap / 2, pd: 1.0 })];
  const r0 = sim(c, 2, () => two(0.3));
  const r1 = sim(c, 2, (t) => two(0.3 + Math.min(0.35, (t - r0.t) * 0.3)), r0.t);
  assert.ok(r1.out.two && r1.out.zoom > r0.out.zoom + 0.1, `${r0.out.zoom.toFixed(2)} -> ${r1.out.zoom.toFixed(2)}`);
  const r2 = sim(c, 2, (t) => two(0.65 - Math.min(0.4, (t - r1.t) * 0.3)), r1.t);
  assert.ok(r2.out.zoom < r1.out.zoom - 0.1);
});
ok('index fingertip x subtly shifts the view', () => {
  const c = new Controller(8);
  const a = sim(c, 1.5, () => [{ ...mkHand({}), idx: { x: 0.2, y: 0.45 } }]).out.shiftX;
  const b = sim(c, 1.5, () => [{ ...mkHand({}), idx: { x: 0.8, y: 0.45 } }], 2).out.shiftX;
  assert.ok(b - a > 0.4 && Math.abs(b) < 0.7, `${a.toFixed(2)} -> ${b.toFixed(2)}`);
});
ok('no hand: idle drift is tiny, no automatic scrolling; hand returns without a jump', () => {
  const c = new Controller(8); let maxDrift = 0, maxStep = 0, last = null;
  const r0 = sim(c, 1.5, () => [mkHand({ pd: 1.1, y: 0.55 })]); const z0 = r0.out.zoom;
  const r1 = sim(c, 12, () => [], r0.t, (o) => { maxDrift = Math.max(maxDrift, Math.abs(o.shiftX), Math.abs(o.shiftY)); });
  assert.ok(maxDrift < 0.6, 'drift ' + maxDrift); assert.ok(Math.abs(r1.out.S) < 0.01 && !r1.out.present && r1.out.ctl < 0.01);
  assert.ok(Math.abs(r1.out.zoom - z0) < 0.01, 'zoom held while idle');
  sim(c, 3, () => [mkHand({ pd: 1.5, y: 0.55 })], r1.t, (o) => { if (last) maxStep = Math.max(maxStep, Math.abs(o.zoom - last.zoom), Math.abs(o.S - last.S), Math.abs(o.shiftX - last.shiftX)); last = o; });
  assert.ok(maxStep < 0.03, 'restore step ' + maxStep.toFixed(4));
});
ok('keyboard / wheel fallback works without a hand', () => {
  const c = new Controller(8); c.nudge(2.2); const r = sim(c, 3, () => []); assert.ok(r.out.S >= 0.9);
  c.addZoom(0.2); assert.ok(sim(c, 2, () => [], 3).out.zoom > 0.6);
});

console.log('filters');
ok('OneEuro damps jitter; SmoothDamp never overshoots; Median3 / Backlash behave', () => {
  const f = new OneEuro(1.2, 4, 1); let jit = 0, prev = 0.5;
  for (let i = 0; i < 300; i++) { const y = f.filter(0.5 + Math.sin(i * 12.9898) * 0.003, i / 30); jit += Math.abs(y - prev); prev = y; }
  assert.ok(jit / 300 < 0.0015);
  const s = new SmoothDamp1(0); let over = 0; for (let i = 0; i < 300; i++) { s.update(1, 0.4, dt60); over = Math.max(over, s.value); }
  assert.ok(over <= 1.0001);
  const m = new Median3(); [1, 1, 9, 1, 1].forEach((v) => m.push(v)); assert.equal(m.push(1), 1);
  const b = new Backlash(0.1, 0); assert.equal(b.update(0.05), 0); assert.ok(Math.abs(b.update(0.5) - 0.4) < 1e-9);
});

console.log('thought graph');
ok('notes: every node has wrapped text; headings are the cluster titles', () => {
  const nt = buildNotes(); assert.equal(nt.lines.length, N);
  for (let n = 0; n < N; n++) { assert.ok(nt.lines[n].length >= 1 && nt.maxChars[n] > 0); assert.equal(nt.isHead[n], n % PER === 0 ? 1 : 0); }
  assert.ok(nt.lines[0].join(' ').startsWith('[Generative'));
});
ok('layouts: finite + bounded; edges valid; topology shapes are what they claim', () => {
  assert.deepEqual(TOPOLOGIES.map((t) => t.name), ['centralized', 'decentralized', 'distributed', 'neural network']);
  for (const t of TOPOLOGIES) {
    const L = layout(t.kind); assert.equal(L.pos.length, N * 3); for (const v of L.pos) assert.ok(Number.isFinite(v) && Math.abs(v) < 14);
    for (const [a, b] of L.edges) assert.ok(a >= 0 && b >= 0 && a < N && b < N && a !== b);
  }
  const c = layout('centralized'); assert.ok(c.edges.every(([a]) => a === 0) && c.edges.length === N - 1, 'star: every edge touches the single hub');
  const d = layout('decentralized'), deg = new Map(); d.edges.forEach(([a, b]) => { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); });
  assert.equal([...deg.values()].filter((v) => v > 8).length, P, 'one hub per cluster');
  const m = layout('distributed'); assert.ok(m.edges.length > N && m.edges.length < N * 3);
});
ok('morph: nodes spring to the new layout with no overshoot blow-up, staggered, then settle; edges cross-fade', () => {
  const g = new Graph(); let t = 0; const dt = 1 / 60;
  for (let i = 0; i < 60; i++) g.step(dt, (t += dt));
  g.setPattern(1);
  let maxStep = 0, prev = new Float32Array(g.pos); let sawMid = false;
  for (let i = 0; i < 60 * 6; i++) {
    g.step(dt, (t += dt));
    for (let k = 0; k < g.pos.length; k++) maxStep = Math.max(maxStep, Math.abs(g.pos[k] - prev[k]));
    prev.set(g.pos);
    if (i === 20) { sawMid = g.edgeW.some((w) => w > 0.05 && w < 0.95); }
  }
  assert.ok(maxStep < 0.4, 'per-frame node step ' + maxStep); assert.ok(sawMid, 'edges cross-fade');
  let d = 0; const L = g.layouts[1].pos; for (let k = 0; k < L.length; k++) d = Math.max(d, Math.abs(g.pos[k] - L[k]));
  assert.ok(d < 0.02, 'settled ' + d); assert.ok(!g.morphing);
  for (let e = 0; e < g.E; e++) assert.ok(Math.abs(g.edgeW[e] - (g.mask[e] & 2 ? 1 : 0)) < 0.02);
});
ok('re-targeting mid-morph never jumps (positions are continuous)', () => {
  const g = new Graph(); let t = 0; const dt = 1 / 60; g.setPattern(2);
  for (let i = 0; i < 25; i++) g.step(dt, (t += dt));
  const before = new Float32Array(g.pos); g.setPattern(3); g.step(dt, (t += dt));
  let d = 0; for (let k = 0; k < before.length; k++) d = Math.max(d, Math.abs(before[k] - g.pos[k]));
  assert.ok(d < 0.4, 'jump ' + d);
  for (let i = 0; i < 400; i++) g.step(dt, (t += dt));
  assert.ok(g.edgeW.every((w, e) => Math.abs(w - (g.mask[e] & 8 ? 1 : 0)) < 0.02));
});
ok('cluster focus path is smooth and stays inside the graph; stats are sane', () => {
  const g = new Graph(); g.step(1 / 60, 0); const f = { x: 0, y: 0, z: 0 }; let prev = null, maxStep = 0;
  for (let S = 0; S <= P - 1; S += 0.02) { g.focusAt(S, f); assert.ok(Math.abs(f.x) < 10 && Math.abs(f.y) < 10 && Math.abs(f.z) < 10); if (prev) maxStep = Math.max(maxStep, Math.hypot(f.x - prev.x, f.y - prev.y, f.z - prev.z)); prev = { ...f }; }
  assert.ok(maxStep < 0.35, 'focus step ' + maxStep);
  const s = g.stats(2); assert.equal(s.nodes, PER); assert.ok(s.links > 0 && s.density > 0 && s.density <= 1);
});

console.log('rotation');
const at = (x, y = 0.55) => () => [mkHand({ x, y })];
ok('the graph follows the hand: left/right position -> yaw (mirrored), centred = none, symmetric', () => {
  const yawAt = (x) => sim(new Controller(8), 3, at(x)).out.yaw;
  const l = yawAt(0.2), c0 = yawAt(0.5 - 0.02 + 0.01), r = yawAt(0.8);
  assert.ok(l > 0.4 && r < -0.4, `left ${l.toFixed(2)} right ${r.toFixed(2)}`);
  assert.ok(Math.abs(c0) < 0.12, 'centre ' + c0.toFixed(3));
  assert.ok(Math.abs(l + r) < 0.2, 'symmetric');
  assert.ok(Math.abs(yawAt(0.1)) > Math.abs(yawAt(0.3)), 'monotonic');
});
ok('moving the hand rotates smoothly: bounded per-frame step, no overshoot, settles', () => {
  const c = new Controller(8); sim(c, 1, at(0.3)); let last = null, maxStep = 0, minY = 9, maxY = -9;
  const r = sim(c, 3, (t) => [mkHand({ x: 0.3 + Math.min(0.4, Math.max(0, t - 1) * 0.8) })], 1, (o) => { if (last !== null) maxStep = Math.max(maxStep, Math.abs(o.yaw - last)); last = o.yaw; minY = Math.min(minY, o.yaw); });
  assert.ok(maxStep < 0.06, 'max yaw step per frame ' + maxStep.toFixed(3));
  const target = -(0.7 + 0.01 - 0.5) * 2 * 1.2;
  assert.ok(minY >= target - 0.05, 'no overshoot ' + minY.toFixed(3) + ' vs ' + target.toFixed(3));
  assert.ok(Math.abs(r.out.yaw - target) < 0.08, 'settles on the hand position ' + r.out.yaw.toFixed(3));
});
ok('a still hand does not rotate; spreading / closing the fingers does not rotate', () => {
  const c = new Controller(8); const nz = noise(7); let mn = 9, mx = -9;
  sim(c, 4, () => [mkHand({ x: 0.5 + nz() * 0.004, y: 0.55 + nz() * 0.004 })], 0, (o, t) => { if (t > 1) { mn = Math.min(mn, o.yaw); mx = Math.max(mx, o.yaw); } });
  assert.ok(mx - mn < 0.03, 'jitter spread ' + (mx - mn).toFixed(3));
  const c2 = new Controller(8); sim(c2, 1, () => [mkHand({ pd: 1.3 })]); let a = 9, b = -9;
  sim(c2, 2, (t) => [mkHand({ pd: 1.3 - 1.2 * Math.min(1, (t - 1) / 0.4) })], 1, (o) => { a = Math.min(a, o.yaw); b = Math.max(b, o.yaw); });
  assert.ok(b - a < 0.1, 'finger spread yaw range ' + (b - a).toFixed(3));
});
ok('hand height tilts (pitch); centred hand = no tilt', () => {
  const c = new Controller(8);
  const mid = sim(c, 2, () => [{ ...mkHand({}), idx: { x: 0.5, y: 0.5 } }]).out;
  assert.ok(Math.abs(mid.pitch) < 0.03);
  const hi = sim(c, 2, () => [{ ...mkHand({}), idx: { x: 0.5, y: 0.2 } }], 2).out.pitch;
  assert.ok(hi < -0.1 && hi > -0.7, 'pitch ' + hi);
});
ok('no hand: slow turntable drift only; hand returns without a jump', () => {
  const c = new Controller(8);
  const r1 = sim(c, 6, () => []);
  assert.ok(Math.abs(r1.out.yawV) < 0.12, 'idle spin ' + r1.out.yawV);
  let maxStep = 0, last = null;
  sim(c, 2, () => [mkHand({ x: 0.9 })], r1.t, (o) => { if (last !== null) maxStep = Math.max(maxStep, Math.abs(o.yaw - last)); last = o.yaw; });
  assert.ok(maxStep < 0.05, 'return step ' + maxStep);
});
ok('manual rotate / spin (mouse drag, keyboard) work without a hand', () => {
  const c = new Controller(8); c.rotate(0.5); assert.ok(Math.abs(sim(c, 0.1, () => []).out.yaw - 0.5) < 0.05);
  c.spin(1.4); const r = sim(c, 1, () => [], 0.1); assert.ok(r.out.yaw > 0.6);
});

console.log(`\n${n} checks passed`);
