// #dev/creator:tubakhxn
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const ease = (t) => t * t * (3 - 2 * t);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SmoothDamp1 {
  constructor(v = 0) { this.value = v; this.vel = 0; }
  set(v) { this.value = v; this.vel = 0; }
  update(target, smoothTime, dt) {
    const omega = 2 / Math.max(1e-4, smoothTime);
    const x = omega * dt;
    const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const c = this.value - target;
    const tmp = (this.vel + omega * c) * dt;
    this.vel = (this.vel - omega * tmp) * e;
    this.value = target + (c + tmp) * e;
    return this.value;
  }
}

export class SmoothDamp2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; this.vx = 0; this.vy = 0; }
  set(x, y) { this.x = x; this.y = y; this.vx = 0; this.vy = 0; }
  update(tx, ty, smoothTime, dt) {
    const omega = 2 / Math.max(1e-4, smoothTime);
    const x = omega * dt;
    const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const cx = this.x - tx, cy = this.y - ty;
    const px = (this.vx + omega * cx) * dt, py = (this.vy + omega * cy) * dt;
    this.vx = (this.vx - omega * px) * e;
    this.vy = (this.vy - omega * py) * e;
    this.x = tx + (cx + px) * e;
    this.y = ty + (cy + py) * e;
  }
}

export class OneEuro {
  constructor(minCutoff = 1.2, beta = 4, dCutoff = 1) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.x = null; this.dx = 0; this.t = null;
  }
  reset() { this.x = null; this.dx = 0; this.t = null; }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(v, t) {
    if (this.x === null) { this.x = v; this.t = t; return v; }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const rawD = (v - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (rawD - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (v - this.x);
    return this.x;
  }
}

export const easeInOut = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const easeOutBack = (t) => { const c1 = 1.1, c3 = c1 + 1, u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; };

export class Median3 {
  constructor() { this.a = null; this.b = null; this.c = null; }
  reset() { this.a = this.b = this.c = null; }
  push(v) {
    if (this.a === null) { this.a = this.b = this.c = v; return v; }
    this.a = this.b; this.b = this.c; this.c = v;
    const x = this.a, y = this.b, z = this.c;
    return Math.max(Math.min(x, y), Math.min(Math.max(x, y), z));
  }
}

export class Backlash {
  constructor(band = 0.015, v = 0) { this.band = band; this.v = v; }
  reset(v) { this.v = v; }
  update(x) {
    if (x > this.v + this.band) this.v = x - this.band;
    else if (x < this.v - this.band) this.v = x + this.band;
    return this.v;
  }
}

export const slew = (cur, target, rate, dt) => cur + clamp(target - cur, -rate * dt, rate * dt);
