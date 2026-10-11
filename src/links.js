import * as THREE from 'three';
import { buildLanes, bezier } from './patterns.js';

/* Signal lanes: faint curved lines linking consecutive information panels, with bright pulses and
 * particles travelling along them. Static geometry; all motion is computed in the vertex shader. */
const SEG = 40, SIG = 12;

const LN_VS = /* glsl */ `
uniform float uTime, uFocusZ, uSpan;
attribute float aU; attribute float aPh;
varying float vA; varying float vP;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = -mv.z;
  float dz = (position.z - uFocusZ) / uSpan;
  float focus = exp(-dz * dz * 0.5);
  float f = fract(aU - uTime * 0.09 - aPh);
  float pulse = exp(-pow((f - 0.5) / 0.05, 2.0));
  vP = pulse;
  vA = (0.07 + 0.6 * pulse) * (0.25 + 0.75 * focus) * smoothstep(0.8, 3.0, depth) * (1.0 - 0.85 * smoothstep(11.0, 30.0, depth));
  gl_Position = projectionMatrix * mv;
}`;
const LN_FS = /* glsl */ `
varying float vA; varying float vP;
void main(){ gl_FragColor = vec4(mix(vec3(0.30, 0.94, 0.72), vec3(1.0), vP), vA); }`;

const SG_VS = /* glsl */ `
uniform float uTime, uFocusZ, uSpan, uScale;
attribute vec3 aP1; attribute vec3 aP2; attribute vec3 aP3; attribute float aU0; attribute float aSp; attribute float aTint;
varying float vA; varying vec3 vCol;
void main(){
  float t = fract(aU0 + uTime * aSp);
  float u = 1.0 - t;
  vec3 world = u*u*u*position + 3.0*u*u*t*aP1 + 3.0*u*t*t*aP2 + t*t*t*aP3;
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  float depth = -mv.z;
  float dz = (world.z - uFocusZ) / uSpan;
  float focus = exp(-dz * dz * 0.5);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(5.0 * uScale * (1.0 + 0.6 * focus) * (10.0 / max(depth, 0.1)), 1.0, 22.0);
  float ends = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.92, 1.0, t));
  vA = (0.25 + 0.75 * focus) * ends * smoothstep(0.8, 3.0, depth) * (1.0 - 0.85 * smoothstep(11.0, 30.0, depth));
  vCol = aTint < 0.7 ? vec3(0.93, 0.97, 1.0) : (aTint < 0.9 ? vec3(0.30, 0.94, 0.72) : vec3(1.0, 0.62, 0.10));
}`;
const SG_FS = /* glsl */ `
varying float vA; varying vec3 vCol;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  float a = (exp(-r2 * 9.0) + 0.28 * exp(-r2 * 2.6)) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol, a);
}`;

export class Links {
  constructor(uniforms) {
    this.lanes = buildLanes();
    const L = this.lanes.length, tmp = [0, 0, 0];
    const mat = (vs, fs) => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });

    // polylines
    const pos = new Float32Array(L * (SEG + 1) * 3), au = new Float32Array(L * (SEG + 1)), ph = new Float32Array(L * (SEG + 1));
    const idx = new Uint16Array(L * SEG * 2);
    this.lanes.forEach((ln, l) => {
      for (let s = 0; s <= SEG; s++) {
        const v = l * (SEG + 1) + s; bezier(ln.p, s / SEG, tmp);
        pos[v * 3] = tmp[0]; pos[v * 3 + 1] = tmp[1]; pos[v * 3 + 2] = tmp[2]; au[v] = s / SEG; ph[v] = ln.ph;
        if (s < SEG) { const e = (l * SEG + s) * 2; idx[e] = v; idx[e + 1] = v + 1; }
      }
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); lg.setAttribute('aU', new THREE.BufferAttribute(au, 1)); lg.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    lg.setIndex(new THREE.BufferAttribute(idx, 1));
    this.lines = new THREE.LineSegments(lg, mat(LN_VS, LN_FS)); this.lines.frustumCulled = false;

    // signal particles
    const n = L * SIG, p0 = new Float32Array(n * 3), p1 = new Float32Array(n * 3), p2 = new Float32Array(n * 3), p3 = new Float32Array(n * 3);
    const u0 = new Float32Array(n), sp = new Float32Array(n), tint = new Float32Array(n);
    this.lanes.forEach((ln, l) => {
      for (let k = 0; k < SIG; k++) {
        const i = l * SIG + k;
        [p0, p1, p2, p3].forEach((arr, q) => { arr[i * 3] = ln.p[q][0]; arr[i * 3 + 1] = ln.p[q][1]; arr[i * 3 + 2] = ln.p[q][2]; });
        u0[i] = k / SIG + ln.ph * 0.1; sp[i] = 0.05 + 0.04 * ((k * 7 + l * 3) % 5) / 4; tint[i] = ((k * 13 + l * 7) % 10) / 10;
      }
    });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(p0, 3)); sg.setAttribute('aP1', new THREE.BufferAttribute(p1, 3));
    sg.setAttribute('aP2', new THREE.BufferAttribute(p2, 3)); sg.setAttribute('aP3', new THREE.BufferAttribute(p3, 3));
    sg.setAttribute('aU0', new THREE.BufferAttribute(u0, 1)); sg.setAttribute('aSp', new THREE.BufferAttribute(sp, 1)); sg.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
    this.signals = new THREE.Points(sg, mat(SG_VS, SG_FS)); this.signals.frustumCulled = false;
  }
  addTo(scene) { scene.add(this.lines, this.signals); }
}
