// #dev/creator:tubakhxn
import './style.css';
import { GraphScene, TAN } from './scene.js';
import { HandInput } from './handInput.js';
import { Controller } from './navigation.js';
import { Labels, Rail, Hud, SidePanel, Toast } from './ui.js';
import { SmoothDamp1, clamp, lerp, easeInOut } from './math.js';
import { Graph, P, PER, TOPOLOGIES } from './graph.js';

const $ = (id) => document.getElementById(id);
const video = $('cam'), canvas = $('gl'), debugEl = $('debug'), hint = $('hint');
const graph = new Graph();
const scene = new GraphScene(canvas, graph);
const hand = new HandInput(video);
const ctl = new Controller(P);
const labels = new Labels($('labels'), graph);
const rail = new Rail($('rail'));
const hud = new Hud($('dot-idx'), $('dot-thumb'), $('hud-line'));
const side = new SidePanel();
const toast = new Toast($('toast'));

let W = innerWidth, H = innerHeight, U = 1, pattern = 0;
function resize() {
  W = innerWidth; H = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  U = clamp(Math.min(W, H) / 720, 0.75, 1.5);
  scene.resize(W, H, dpr); labels.resize(W, H, dpr);
  document.documentElement.style.setProperty('--u', U.toFixed(3));
}
addEventListener('resize', resize); resize();
side.setPattern(0);

const kick = { value: 0 };
function setPattern(p, announce = true) {
  pattern = ((p % TOPOLOGIES.length) + TOPOLOGIES.length) % TOPOLOGIES.length;
  graph.setPattern(pattern); kick.value = 1; side.setPattern(pattern);
  if (announce) toast.show(`mode: ${TOPOLOGIES[pattern].name}`, 1600);
}

const mouse = { x: -1, y: -1, t: -10 };
addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.ctrlKey) ctl.addZoom(-clamp(e.deltaY, -60, 60) * 0.004);
  else ctl.nudge(clamp(e.deltaY, -120, 120) * 0.012);
}, { passive: false });
const drag = { on: false, x: 0, moved: 0 };
addEventListener('pointermove', (e) => {
  if (drag.on) { const dx = e.clientX - drag.x; drag.x = e.clientX; drag.moved += Math.abs(dx); ctl.rotate((dx / W) * 4.2); }
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = performance.now() / 1000; ctl.mouseMove(e.clientX / W, e.clientY / H, mouse.t);
});
addEventListener('pointerdown', (e) => { drag.on = true; drag.x = e.clientX; drag.moved = 0; });
addEventListener('pointerup', () => { if (drag.on && drag.moved < 5) ctl.requestPattern(1); drag.on = false; });
addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'ArrowDown' || k === 'PageDown') ctl.nudge(2.2);
  else if (k === 'ArrowUp' || k === 'PageUp') ctl.nudge(-2.2);
  else if (k === 'ArrowRight' || k === ' ') { ctl.requestPattern(1); e.preventDefault(); }
  else if (k === 'ArrowLeft') ctl.requestPattern(-1);
  else if (k.toLowerCase() === 'a' || k.toLowerCase() === 'q') ctl.spin(1.4);
  else if (k.toLowerCase() === 'e') ctl.spin(-1.4);
  else if (k === '+' || k === '=') ctl.addZoom(0.08);
  else if (k === '-' || k === '_') ctl.addZoom(-0.08);
  else if (k >= '1' && k <= String(TOPOLOGIES.length)) setPattern(Number(k) - 1);
  else if (k.toLowerCase() === 'd') debugEl.style.display = debugEl.style.display === 'block' ? 'none' : 'block';
});

(async function boot() {
  try { await hand.startCamera(); }
  catch (e) { toast.show('Camera unavailable - wheel = scroll · drag = rotate · click = next topology · +/- = zoom · mouse = hover', 9000); return; }
  toast.show('loading hand model…', 4000);
  try { await hand.loadModel(); toast.show('show your hand · index + thumb apart = zoom in · pinch = next topology', 5000); }
  catch (e) { console.error(e); toast.show('Hand model failed to load - wheel = scroll · drag = rotate · click = next topology · +/- = zoom', 9000); }
})();

const NEAR = 3.4, FAR = 30;
const distOf = (zoom) => FAR * Math.pow(NEAR / FAR, Math.pow(clamp(zoom, 0, 1), 1.4));
const focus = { x: 0, y: 0, z: 0 }, cam = { x: 0, y: 0, z: 0 }, tgt = { x: 0, y: 0, z: 0 };
const LEFT = 0.11;
const frameTimes = []; let last = performance.now() / 1000, everScrolled = false;

function tick(nowMs) {
  const t = nowMs / 1000;
  const dt = clamp(t - last, 0.001, 0.05); last = t;

  const inp = hand.poll(t, W, H);
  if (inp.fresh) ctl.ingest({ hands: inp.hands, aspect: W / H }, t);
  const o = ctl.update(dt, t);
  for (const ev of ctl.drainEvents()) if (ev.type === 'pattern') setPattern(pattern + ev.dir);
  kick.value *= Math.exp(-dt / 0.45);

  graph.step(dt, t);
  graph.focusAt(o.S, focus);
  const dist = distOf(o.zoom) * (1 - 0.05 * kick.value);
  const R = dist, cp = Math.cos(o.pitch), sy = Math.sin(o.yaw), cyw = Math.cos(o.yaw);
  const pan = dist * 0.1;
  const off = LEFT * 2 * dist * TAN * (W / H);
  const rx = cyw, rz = -sy;
  tgt.x = focus.x + rx * (o.shiftX * pan + off); tgt.y = focus.y + o.shiftY * pan; tgt.z = focus.z + rz * (o.shiftX * pan + off);
  cam.x = tgt.x + R * sy * cp; cam.y = tgt.y + R * Math.sin(o.pitch); cam.z = tgt.z + R * cyw * cp;
  scene.setCamera(cam, tgt);

  const useHand = o.present, useMouse = !useHand && t - mouse.t < 4 && mouse.x >= 0;
  const cx = useHand ? o.idx.x * W : mouse.x, cy = useHand ? o.idx.y * H : mouse.y;
  const act = clamp(Math.round(o.S), 0, P - 1);
  scene.update(dist, labels.hover, act);
  const hv = labels.pick(cx, cy, (useHand && o.pinch !== 'HELD') || useMouse, U);
  labels.draw(dt, true, cx, cy, o.S, U);
  side.setCluster(act, graph.stats(act));

  rail.update(o.S, o.zoom, o.close, o.pinch, o.yaw / Math.PI);
  hud.update(dt, W, H, o.present, o.idx, o.thumb, o.close, o.pinch === 'HELD' || o.pinch === 'RELEASING');

  if (Math.abs(o.v) > 0.6) everScrolled = true;
  if (everScrolled && pattern !== 0) hint.classList.add('off');

  if (debugEl.style.display === 'block') {
    frameTimes.push(dt); if (frameTimes.length > 60) frameTimes.shift();
    const fps = 1 / (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length);
    debugEl.textContent = `${hand.mode}  fps ${fps.toFixed(0)}  dist ${dist.toFixed(1)}\nS ${o.S.toFixed(2)}  v ${o.v.toFixed(2)}  zoom ${o.zoom.toFixed(2)}\npd ${o.pd.toFixed(2)}  pinch ${o.pinch}  gate ${o.gate.toFixed(2)}  two ${o.two}\nmode ${TOPOLOGIES[pattern].name}  hover ${hv}`;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
