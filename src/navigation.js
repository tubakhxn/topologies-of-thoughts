// #dev/creator:tubakhxn
import { clamp, lerp, smoothstep, easeInOut, OneEuro, SmoothDamp1, SmoothDamp2, Median3, Backlash, slew } from './math.js';
import { PinchMachine, closeness } from './gestures.js';

export const DEFAULTS = {
  zoomDefault: 0.45,
  openLo: 0.55,
  openHiFloor: 1.15,
  scrollGain: 3.2,
  scrollDeadzone: 0.04,
  stickDead: 0.2,
  stickMax: 1.0,
  maxSpeed: 8,
  zoomRate: 1.4,
  depthGain: 0.55,
  tiltGain: 0.5,
  twoGain: 0.9,
  yawRange: 1.2,
  maxYawSpeed: 6.5,
  idleSpin: 0.045,
  pitchMax: 0.55
};

export class Controller {
  constructor(panels = 8, cfg = {}) {
    this.c = { ...DEFAULTS, ...cfg };
    this.P = panels;

    this.S = 0; this.v = 0; this.vIn = 0; this.vInT = -10; this.vInS = 0; this.stick = 0; this.stickS = 0;

    this.zoom = new SmoothDamp1(this.c.zoomDefault);
    this.zoomHeld = this.c.zoomDefault; this.zoomEntry = this.c.zoomDefault; this.entryW = 1; this.zoomSlew = this.c.zoomDefault;
    this.hist = []; this.lockZoom = this.c.zoomDefault; this.lockW = 0;
    this.bias = 0; this.biasEntry = 0;

    this.mPd = new Median3(); this.mY = new Median3();
    this.fPd = new OneEuro(1.6, 3.0, 1); this.fY = new OneEuro(1.4, 2.5, 1); this.fIx = new OneEuro(0.9, 1.2, 1); this.fIy = new OneEuro(0.9, 1.2, 1);
    this.fSc = new OneEuro(0.8, 1.0, 1); this.fTilt = new OneEuro(0.6, 0.5, 1); this.fTwo = new OneEuro(1.0, 1.5, 1);
    this.hyst = new Backlash(0.015, 0);
    this.pdMax = 1.45;

    this.pinch = new PinchMachine();
    this.has = false; this.lastFresh = -10; this.lastPalm = null; this.prevY = null; this.prevPd = null;
    this.pd = 1; this.o = 0.5; this.oFrozen = 0.5; this.depthTerm = 0; this.scaleRef = null; this.handY = 0.5; this.idxX = 0.5; this.idxY = 0.5; this.gate = 0;
    this.thumb = { x: 0.5, y: 0.5 }; this.idxPos = { x: 0.5, y: 0.5 };
    this.twoStable = 0; this.twoActive = false; this.d0 = 1; this.mouse = { x: 0.5, y: 0.5, t: -10 };

    this.ctl = new SmoothDamp1(0); this.shift = new SmoothDamp2(0, 0); this.orbit = new SmoothDamp2(0, 0);
    this.yaw = 0; this.yawV = 0; this.handYaw = new SmoothDamp1(0); this.midX = 0.5; this.midY = 0.5; this.fMx = new OneEuro(0.9, 1.4, 1); this.fMy = new OneEuro(0.9, 1.4, 1);
    this.present = false; this.events = [];
    this.out = {};
  }

  nudge(v) { this.v = clamp(this.v + v, -this.c.maxSpeed, this.c.maxSpeed); }
  addZoom(dz) { if (this.present) this.bias = clamp(this.bias + dz, -0.5, 0.5); else this.zoomHeld = clamp(this.zoomHeld + dz, 0, 1); }
  requestPattern(dir = 1) { this.events.push({ type: 'pattern', dir }); }
  jumpTo(i) { this.S = clamp(i, 0, this.P - 1); this.v = 0; }
  rotate(dYaw) { this.yaw += dYaw; }
  spin(v) { this.yawV = clamp(this.yawV + v, -this.c.maxYawSpeed, this.c.maxYawSpeed); }
  mouseMove(x, y, t) { this.mouse.x = x; this.mouse.y = y; this.mouse.t = t; }
  drainEvents() { const e = this.events; this.events = []; return e; }

  ingest(frame, t) {
    const hs = frame.hands;
    if (!hs || !hs.length) return;
    const c = this.c, dtF = clamp(t - this.lastFresh, 0.008, 0.12);

    let pi = 0;
    if (hs.length > 1) {
      if (this.lastPalm) { let best = 1e9; hs.forEach((h, i) => { const d = Math.hypot(h.palm.x - this.lastPalm.x, h.palm.y - this.lastPalm.y); if (d < best) { best = d; pi = i; } }); }
      else { let big = -1; hs.forEach((h, i) => { if (h.scale > big) { big = h.scale; pi = i; } }); }
    }
    const h = hs[pi];
    this.lastPalm = { x: h.palm.x, y: h.palm.y };

    if (!this.has || t - this.lastFresh > 0.3) this._enter(t);
    this.lastFresh = t; this.has = true;

    const pdRaw = this.mPd.push(h.pinch);
    const pdF = this.fPd.filter(pdRaw, t);
    this.pd = pdF;
    const dPd = this.prevPd === null ? 0 : Math.abs(pdF - this.prevPd) / dtF; this.prevPd = pdF;

    this.pdMax = Math.max(c.openHiFloor, this.pdMax - (this.pdMax - c.openHiFloor) * (1 - Math.exp(-dtF / 25)), Math.min(pdF, 2.2));
    const oRaw = clamp((pdF - c.openLo) / Math.max(0.3, this.pdMax * 0.93 - c.openLo), 0, 1);
    this.o = this.hyst.update(oRaw);

    const twoNow = hs.length > 1;
    const ev = this.pinch.update(pdRaw, true, dtF);
    if (ev === 'start' && !this.twoActive && !twoNow) this.events.push({ type: 'pattern', dir: 1 });
    if (ev === 'start') this.lockZoom = this._zoomAt(t - 0.45);

    const s = this.fSc.filter(h.scale, t);
    if (this.scaleRef === null) this.scaleRef = s;
    this.scaleRef += (s - this.scaleRef) * (1 - Math.exp(-dtF / 8));
    const depthSig = clamp(Math.log(Math.max(1e-4, s) / Math.max(1e-4, this.scaleRef)), -0.4, 0.4);
    const tilt = clamp(this.fTilt.filter(h.zTilt, t), -0.12, 0.12);
    this.depthTerm = c.depthGain * depthSig + c.tiltGain * tilt;

    const rawY = 0.62 * h.palm.y + 0.20 * h.idx.y + 0.18 * h.thumb.y;
    const y = this.fY.filter(this.mY.push(rawY), t);
    this.handY = y;
    this.idxX = this.fIx.filter(h.idx.x, t); this.idxY = this.fIy.filter(h.idx.y, t);
    this.midX = this.fMx.filter((h.idx.x + h.thumb.x) / 2, t); this.midY = this.fMy.filter((h.idx.y + h.thumb.y) / 2, t);
    this.idxPos = { x: h.idx.x, y: h.idx.y }; this.thumb = { x: h.thumb.x, y: h.thumb.y };

    const close = closeness(pdF);
    let gate = (1 - close) * (this.pinch.active ? 0 : 1);
    gate *= 1 - smoothstep(0.5, 1.6, dPd);
    gate *= this.twoActive ? 0 : 1;
    this.gate = gate;
    if (this.prevY !== null) {
      const vy = (y - this.prevY) / dtF;
      const eff = Math.sign(vy) * Math.max(0, Math.abs(vy) - c.scrollDeadzone);
      this.vIn = clamp(-eff * c.scrollGain, -c.maxSpeed, c.maxSpeed) * gate;
      this.vInT = t;
    }
    this.prevY = y;
    const off = y - 0.5;
    this.stick = -Math.sign(off) * smoothstep(c.stickDead, 0.42, Math.abs(off)) * c.stickMax * gate;

    if (twoNow) {
      const a = hs[0].palm, b = hs[1].palm, d2 = Math.hypot((a.x - b.x) * (frame.aspect || 1.6), a.y - b.y);
      const fd = this.fTwo.filter(d2, t);
      this.twoStable += dtF;
      if (this.twoStable > 0.25) {
        if (!this.twoActive) { this.twoActive = true; this.d0 = Math.max(0.05, fd); this.biasEntry = this.bias; this.oFrozen = this.o; }
        this.bias = clamp(this.biasEntry + c.twoGain * Math.log(Math.max(0.05, fd) / this.d0), -0.5, 0.5);
      }
    } else { this.twoStable = 0; this.twoActive = false; this.fTwo.reset(); }
  }

  _enter(t) {
    for (const f of [this.fPd, this.fY, this.fIx, this.fIy, this.fSc, this.fTilt, this.fTwo]) f.reset();
    this.mPd.reset(); this.mY.reset(); this.pinch.reset();
    this.prevY = null; this.fMx.reset(); this.fMy.reset(); this.prevPd = null; this.scaleRef = null; this.vIn = 0; this.vInS = 0; this.stick = 0;
    this.hyst.reset(this.o); this.twoStable = 0; this.twoActive = false;
    this.zoomEntry = this.zoomHeld; this.entryW = 0;
  }

  _zoomAt(tq) {
    const h = this.hist;
    if (!h.length) return this.zoom.value;
    for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= tq) return h[i].z;
    return h[0].z;
  }

  update(dt, t) {
    const c = this.c;
    const present = t - this.lastFresh < 0.28;
    if (this.present && !present) { this.has = false; this.vIn = 0; this.stick = 0; this.prevY = null; this.pinch.update(1, false, 0); }
    this.present = present;
    if (!present) this.pinch.update(1, false, dt);
    this.ctl.update(present ? 1 : 0, present ? 0.35 : 0.9, dt);
    const ctl = clamp(this.ctl.value, 0, 1);

    const vInEff = present && t - this.vInT < 0.1 ? this.vIn : 0;
    this.vInS += (vInEff - this.vInS) * (1 - Math.exp(-dt / 0.05));
    this.stickS += ((present ? this.stick : 0) - this.stickS) * (1 - Math.exp(-dt / 0.25));
    const vt = this.vInS + this.stickS;
    const accel = Math.abs(vt) >= Math.abs(this.v) || (Math.abs(vt) > 0.05 && Math.sign(vt) !== Math.sign(this.v));
    this.v += (vt - this.v) * (1 - Math.exp(-dt / (accel ? 0.09 : 0.55)));
    this.v = clamp(this.v, -c.maxSpeed, c.maxSpeed);
    this.S += this.v * dt;
    if (this.S < 0) { this.S = lerp(this.S, 0, 1 - Math.exp(-dt / 0.12)); if (this.v < 0) this.v *= Math.exp(-dt / 0.08); }
    else if (this.S > this.P - 1) { this.S = lerp(this.S, this.P - 1, 1 - Math.exp(-dt / 0.12)); if (this.v > 0) this.v *= Math.exp(-dt / 0.08); }
    if (Math.abs(vt) < 0.25 && Math.abs(this.v) < 0.5) {
      const k = 1 - Math.exp(-dt / 0.3);
      this.S += (Math.round(this.S) - this.S) * k;
      this.v *= Math.exp(-dt / 0.25);
    }

    const oUse = this.twoActive ? this.oFrozen : this.o;
    const zHand = clamp(oUse + this.depthTerm + this.bias, 0, 1);
    if (present) { this.hist.push({ t, z: zHand }); while (this.hist.length > 2 && t - this.hist[0].t > 1.0) this.hist.shift(); }
    else { this.hist.length = 0; this.bias *= Math.exp(-dt / 10); }
    if (!this.twoActive && present) this.bias *= Math.exp(-dt / 10);
    const lockT = this.pinch.active ? 1 : 0;
    this.lockW += (lockT - this.lockW) * (1 - Math.exp(-dt / (lockT ? 0.04 : 0.35)));
    const zT = lerp(zHand, this.lockZoom, this.lockW);
    let cmd;
    if (present) { this.entryW = Math.min(1, this.entryW + dt / 0.7); cmd = lerp(this.zoomEntry, zT, easeInOut(this.entryW)); this.zoomHeld = cmd; }
    else cmd = this.zoomHeld;
    this.zoomSlew = slew(this.zoomSlew, cmd, c.zoomRate, dt);
    this.zoom.update(this.zoomSlew, 0.26, dt);
    const zoom = clamp(this.zoom.value, 0, 1);

    const mouseW = t - this.mouse.t < 3 ? 1 - ctl : 0;
    const ix = lerp(this.idxX, this.mouse.x, mouseW), iy = lerp(this.idxY, this.mouse.y, mouseW);
    const sw = Math.max(ctl, mouseW);
    this.shift.update((ix - 0.5) * 2 * 0.4 * sw, -(iy - 0.5) * 2 * 0.22 * sw, 0.3, dt);
    const idle = 1 - ctl;
    const mx = this.midX, my = this.midY;
    this.handYaw.update(-(mx - 0.5) * 2 * c.yawRange * ctl, 0.26, dt);
    const idleV = c.idleSpin * idle * (1 + 0.5 * Math.sin(t * 0.11));
    this.yawV += (idleV - this.yawV) * (1 - Math.exp(-dt / 0.85));
    this.yawV = clamp(this.yawV, -c.maxYawSpeed, c.maxYawSpeed);
    this.yaw += this.yawV * dt;
    if (this.yaw > Math.PI) this.yaw -= 2 * Math.PI; else if (this.yaw < -Math.PI) this.yaw += 2 * Math.PI;
    let yawOut = this.yaw + this.handYaw.value;
    if (yawOut > Math.PI) yawOut -= 2 * Math.PI; else if (yawOut < -Math.PI) yawOut += 2 * Math.PI;
    const pitchT = (my - 0.5) * 2 * c.pitchMax * ctl + 0.04 * Math.sin(t * 0.07 + 2) * idle;
    this.orbit.update(0, clamp(pitchT, -c.pitchMax - 0.05, c.pitchMax + 0.05), 0.3, dt);
    const dx = (0.35 * Math.sin(t * 0.13) + 0.15 * Math.sin(t * 0.31)) * idle;
    const dy = (0.18 * Math.cos(t * 0.11) + 0.06 * Math.sin(t * 0.37)) * idle;
    const dz = 0.16 * Math.sin(t * 0.17) * idle;

    this.out = {
      S: this.S, v: this.v, active: clamp(Math.round(this.S), 0, this.P - 1),
      zoom, dist: lerp(11.5, 5.0, easeInOut(zoom)) + dz,
      shiftX: this.shift.x + dx, shiftY: this.shift.y + dy, yaw: yawOut, yawV: this.yawV, pitch: this.orbit.y,
      ctl, idle, present, pinch: this.pinch.state, pd: this.pd, close: closeness(this.pd) * ctl,
      two: this.twoActive, gate: this.gate, thumb: this.thumb, idx: this.idxPos
    };
    return this.out;
  }
}
