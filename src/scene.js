// #dev/creator:tubakhxn
import * as THREE from 'three';
import { N, P, PER } from './graph.js';
import { clamp, smoothstep } from './math.js';

export const FOV = 45;
export const TAN = Math.tan((FOV * Math.PI) / 360);

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,1)'); grd.addColorStop(0.6, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class GraphScene {
  constructor(canvas, graph) {
    this.graph = graph;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 120);
    this.W = 1; this.H = 1; this.aspect = 1; this.dpr = 1; this._v = new THREE.Vector3(); this._p = { x: 0, y: 0, d: 0 };
    const dyn = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);

    const E = graph.E;
    this.lp = new Float32Array(E * 6); this.lc = new Float32Array(E * 6);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', dyn(this.lp, 3)); lg.setAttribute('color', dyn(this.lc, 3));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.lines.frustumCulled = false;

    const tex = dotTexture();
    this.np = new Float32Array(N * 3); this.nc = new Float32Array(N * 3);
    const ng = new THREE.BufferGeometry(); ng.setAttribute('position', dyn(this.np, 3)); ng.setAttribute('color', dyn(this.nc, 3));
    this.dots = new THREE.Points(ng, new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, map: tex, vertexColors: true, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dots.frustumCulled = false;

    const S = graph.sigE.length;
    this.sc = new Float32Array(S * 3);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', dyn(graph.sigPos, 3)); sg.setAttribute('color', dyn(this.sc, 3));
    this.sig = new THREE.Points(sg, new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, map: tex, vertexColors: true, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sig.frustumCulled = false;
    this.scene.add(this.lines, this.dots, this.sig);
  }

  resize(W, H, dpr) {
    this.W = W; this.H = H; this.aspect = W / H; this.dpr = dpr;
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(W, H, false);
    this.camera.aspect = this.aspect; this.camera.updateProjectionMatrix();
    this.dots.material.size = 6 * dpr; this.sig.material.size = 5 * dpr;
  }

  setCamera(pos, target) {
    this.camera.position.set(pos.x, pos.y, pos.z);
    this.camera.lookAt(target.x, target.y, target.z);
    this.camera.updateMatrixWorld(true);
  }

  project(X, Y, Z, out) {
    const v = this._v.set(X, Y, Z).applyMatrix4(this.camera.matrixWorldInverse);
    out.d = -v.z;
    v.applyMatrix4(this.camera.projectionMatrix);
    out.x = (v.x * 0.5 + 0.5) * this.W; out.y = (0.5 - v.y * 0.5) * this.H;
    return out;
  }

  update(dist, hover, activeCluster) {
    const g = this.graph, tmp = this._p, d = g.dpos;
    for (let n = 0; n < N; n++) {
      this.project(d[n * 3], d[n * 3 + 1], d[n * 3 + 2], tmp);
      g.sx[n] = tmp.x; g.sy[n] = tmp.y; g.depth[n] = tmp.d;
      const near = smoothstep(0.5, 1.6, tmp.d), far = 1 - 0.8 * smoothstep(dist * 1.1, dist * 2.8 + 6, tmp.d);
      g.fade[n] = near * far;
      const head = n % PER === 0, f = g.fade[n], cl = Math.floor(n / PER), act = cl === activeCluster ? 1 : 0.8;
      const o = n * 3;
      this.np[o] = d[o]; this.np[o + 1] = d[o + 1]; this.np[o + 2] = d[o + 2];
      const b = f * act;
      if (n === hover) { this.nc[o] = 1; this.nc[o + 1] = 0.2; this.nc[o + 2] = 0.2; }
      else if (head) { this.nc[o] = 0.3 * b; this.nc[o + 1] = 0.94 * b; this.nc[o + 2] = 0.72 * b; }
      else { this.nc[o] = b; this.nc[o + 1] = b; this.nc[o + 2] = b; }
    }
    for (let e = 0; e < g.E; e++) {
      const a = g.ea[e], b = g.eb[e], w = g.edgeW[e], o = e * 6;
      const hot = (a === hover || b === hover) ? 1.8 : 1;
      const br = w < 0.01 ? 0 : w * 0.34 * hot * Math.min(g.fade[a], g.fade[b]) * (0.7 + 0.3 * (Math.floor(a / PER) === activeCluster || Math.floor(b / PER) === activeCluster ? 1.4 : 0.7));
      const c = clamp(br, 0, 1);
      this.lp[o] = d[a * 3]; this.lp[o + 1] = d[a * 3 + 1]; this.lp[o + 2] = d[a * 3 + 2];
      this.lp[o + 3] = d[b * 3]; this.lp[o + 4] = d[b * 3 + 1]; this.lp[o + 5] = d[b * 3 + 2];
      this.lc[o] = this.lc[o + 1] = this.lc[o + 2] = this.lc[o + 3] = this.lc[o + 4] = this.lc[o + 5] = c;
    }
    for (let i = 0; i < g.sigE.length; i++) {
      const e = g.sigE[i], f = Math.min(g.fade[g.ea[e]], g.fade[g.eb[e]]) * g.sigA[i], o = i * 3;
      this.sc[o] = 0.6 * f + 0.4 * f * (i % 3 === 0 ? 1 : 0); this.sc[o + 1] = 0.95 * f; this.sc[o + 2] = 0.8 * f;
    }
    for (const attr of [this.lines.geometry.attributes.position, this.lines.geometry.attributes.color, this.dots.geometry.attributes.position, this.dots.geometry.attributes.color, this.sig.geometry.attributes.position, this.sig.geometry.attributes.color]) attr.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }
}
