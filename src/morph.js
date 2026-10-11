import { DL } from './patterns.js';
import { easeOutBack } from './math.js';

/* JS mirror of the vertex-shader morph. Used to "bake" the currently displayed particle positions into the
 * A buffer when a new pattern is requested mid-transition, so chained pinches never cause a visual jump. */

export function rotYX(out, o, x, y, z, ang, tilt) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const x1 = c * x + s * z, z1 = -s * x + c * z;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  out[o] = x1; out[o + 1] = ct * y - st * z1; out[o + 2] = st * y + ct * z1;
}

/** Per-particle eased progress: identical formula to the shader. */
export const progress = (m, delay) => {
  const tm = Math.min(1, Math.max(0, m * (1 + DL) - delay));
  return { tm, e: easeOutBack(tm) };
};

/**
 * Write the displayed local position (without ambient noise) and size of every particle into outA / outS.
 * `S` is the state object of the scene: { m, angA, tiltA, angB, tiltB, waveA, waveB, t }.
 */
export function bake(N, A, B, sA, sB, rnd, delay, S, outA, outS) {
  const ra = [0, 0, 0], rb = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const k = i * 3;
    const { tm, e } = progress(S.m, delay[i]);
    rotYX(ra, 0, A[k], A[k + 1], A[k + 2], S.angA, S.tiltA);
    rotYX(rb, 0, B[k], B[k + 1], B[k + 2], S.angB, S.tiltB);
    const arc = Math.sin(Math.PI * tm) * 0.9;
    let x = ra[0] + (rb[0] - ra[0]) * e + rnd[k] * arc;
    let y = ra[1] + (rb[1] - ra[1]) * e + rnd[k + 1] * arc;
    const z = ra[2] + (rb[2] - ra[2]) * e + rnd[k + 2] * arc;
    const wv = S.waveA + (S.waveB - S.waveA) * e;
    if (wv > 0) y += Math.sin(x * 1.25 + S.t * 1.2) * Math.cos(z * 0.9 + S.t * 0.8) * 0.22 * wv;
    outA[k] = x; outA[k + 1] = y; outA[k + 2] = z;
    outS[i] = sA[i] + (sB[i] - sA[i]) * e;
  }
}
