// #dev/creator:tubakhxn
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { measureHand } from './gestures.js';

const CDN_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const BASE = import.meta.env.BASE_URL;

export class HandInput {
  constructor(video) {
    this.video = video; this.mode = 'none'; this.landmarker = null;
    this.lastVT = -1; this.lastSeen = -10; this.hands = []; this.fresh = false;
  }

  async startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user', frameRate: { ideal: 60, min: 24 } }, audio: false
    });
    this.video.srcObject = stream;
    await this.video.play();
  }

  async loadModel() {
    const fileset = await FilesetResolver.forVisionTasks(BASE + 'wasm');
    let modelPath = BASE + 'models/hand_landmarker.task';
    try {
      const r = await fetch(modelPath, { method: 'HEAD' });
      const ct = r.headers.get('content-type') || '';
      if (!r.ok || ct.includes('text/html')) modelPath = CDN_MODEL;
    } catch { modelPath = CDN_MODEL; }
    const make = (delegate) => HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelPath, delegate },
      runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6
    });
    try { this.landmarker = await make('GPU'); } catch { this.landmarker = await make('CPU'); }
    this.mode = 'camera';
  }

  _cover(nx, ny, W, H) {
    const vw = this.video.videoWidth || 1280, vh = this.video.videoHeight || 720;
    const s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s;
    return { x: ((W - dw) / 2 + (1 - nx) * dw) / W, y: ((H - dh) / 2 + ny * dh) / H };
  }

  poll(t, W, H) {
    let fresh = false;
    if (this.mode === 'camera') {
      const v = this.video;
      if (v.readyState >= 2 && v.currentTime !== this.lastVT) {
        this.lastVT = v.currentTime;
        try {
          const res = this.landmarker.detectForVideo(v, performance.now());
          if (res.landmarks && res.landmarks.length) {
            const vw = v.videoWidth || 1280, vh = v.videoHeight || 720;
            const map = (nx, ny) => this._cover(nx, ny, W, H);
            this.hands = res.landmarks.map((lm, i) => measureHand(lm, res.worldLandmarks[i], map, vw, vh));
            this.lastSeen = t; fresh = true;
          }
        } catch (e) { }
      }
    }
    return { present: t - this.lastSeen < 0.3, hands: this.hands, fresh };
  }
}
