// #dev/creator:tubakhxn
import { smoothstep, clamp } from './math.js';

const D3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function measureHand(img, world, map, vw = 1280, vh = 720) {
  const ids = [0, 5, 9, 13, 17];
  let px = 0, py = 0;
  for (const i of ids) { px += img[i].x; py += img[i].y; }
  const palm = map(px / ids.length, py / ids.length);
  const idx = map(img[8].x, img[8].y);
  const thumb = map(img[4].x, img[4].y);
  const scale = Math.hypot((img[0].x - img[9].x) * vw, (img[0].y - img[9].y) * vh) / vh;
  const size = Math.max(1e-6, D3(world[0], world[9]));
  const pinch = D3(world[4], world[8]) / size;
  const tipZ = (img[8].z + img[12].z + img[16].z + img[20].z) / 4 - img[0].z;
  const zTilt = clamp(-tipZ, -0.3, 0.3);
  return { palm, idx, thumb, scale, pinch, zTilt };
}

export class PinchMachine {
  constructor(o = {}) {
    this.enter = o.enter ?? 0.30;
    this.exit = o.exit ?? 0.50;
    this.enterHold = o.enterHold ?? 0.06;
    this.exitHold = o.exitHold ?? 0.08;
    this.refractory = o.refractory ?? 0.45;
    this.lostGrace = o.lostGrace ?? 0.25;
    this.reset();
  }
  reset() { this.state = 'ARMED'; this.t = 0; this.cd = 0; this.lost = 0; this.heldFor = 0; }
  get active() { return this.state === 'HELD' || this.state === 'RELEASING'; }

  update(p, present, dt) {
    if (this.cd > 0) this.cd -= dt;
    if (!present) {
      this.lost += dt;
      if (this.lost > this.lostGrace && this.state !== 'ARMED') { this.state = 'COOLDOWN'; this.cd = this.refractory; this.t = 0; }
      return null;
    }
    this.lost = 0;
    switch (this.state) {
      case 'ARMED':
        if (p < this.enter) { this.state = 'CLOSING'; this.t = 0; }
        break;
      case 'CLOSING':
        if (p >= this.enter + 0.03) { this.state = 'ARMED'; break; }
        this.t += dt;
        if (this.t >= this.enterHold) { this.state = 'HELD'; this.heldFor = 0; return 'start'; }
        break;
      case 'HELD':
        this.heldFor += dt;
        if (p > this.exit) { this.state = 'RELEASING'; this.t = 0; }
        break;
      case 'RELEASING':
        if (p <= this.exit) { this.state = 'HELD'; break; }
        this.t += dt;
        if (this.t >= this.exitHold) { this.state = 'COOLDOWN'; this.cd = this.refractory; return 'release'; }
        break;
      case 'COOLDOWN':
        if (this.cd <= 0 && p > this.exit) this.state = 'ARMED';
        break;
    }
    return null;
  }
}

export const closeness = (pd) => 1 - smoothstep(0.55, 0.9, pd);
