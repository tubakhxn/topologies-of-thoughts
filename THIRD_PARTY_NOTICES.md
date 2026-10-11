<!-- #dev/creator:tubakhxn -->
# Third-party notices

- **three** (MIT) - 3D rendering.
- **@mediapipe/tasks-vision** (Apache-2.0) - Google MediaPipe Hand Landmarker runtime. The WASM files are copied from the npm package into `public/wasm` by `scripts/prepare.mjs`.
- **hand_landmarker.task** (Apache-2.0, Google) - the hand model. It is downloaded into `public/models/` when online, otherwise loaded from Google's model storage at runtime.
- **vite** (MIT) - dev server and build tooling.

No images, fonts or other assets are bundled. Fonts are system fonts.
