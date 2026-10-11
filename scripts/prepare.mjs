// #dev/creator:tubakhxn
import { cpSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dstWasm = join(root, 'public', 'wasm');

if (existsSync(src)) {
  mkdirSync(dstWasm, { recursive: true });
  const have = new Set(readdirSync(dstWasm));
  for (const f of readdirSync(src)) {
    if (!have.has(f)) cpSync(join(src, f), join(dstWasm, f));
  }
  console.log('[prepare] MediaPipe wasm ready in public/wasm');
} else {
  console.warn('[prepare] @mediapipe/tasks-vision not installed yet - skipping wasm copy');
}

const modelDir = join(root, 'public', 'models');
const modelPath = join(modelDir, 'hand_landmarker.task');
if (!existsSync(modelPath)) {
  mkdirSync(modelDir, { recursive: true });
  const url = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 20000);
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(to);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
    console.log('[prepare] downloaded hand_landmarker.task');
  } catch (e) {
    console.warn('[prepare] model download skipped (' + (e && e.message) + '). The app will load it from the CDN at runtime.');
  }
}
