<!-- #dev/creator:tubakhxn -->
# Gesture Thought Topology
## Dev/Creator: tubakhxn
Control a 3D map of connected ideas with your bare hand. No mouse, no controller, just your webcam.

The scene is a graph of about 190 small text notes grouped into 8 topic clusters. Mint headings name each cluster, white notes sit next to glowing dots, and thin lines with travelling signal dots connect them. You zoom, rotate and scroll through the graph with finger gestures, and a pinch rewires the whole graph into a different network shape.

## What is it about

"Topologies of Thoughts" is about how the shape of a network changes the way you think about the same ideas. The same notes can be arranged four ways:

| Mode | Shape |
|---|---|
| centralized | one central thought connected to all the others |
| decentralized | a hub per topic, hubs linked to each other |
| distributed | a mesh where every note links to its neighbours |
| neural network | layers of notes passing signals forward |

Everything runs in your browser. Nothing is uploaded and there is no server or account.

## Gestures

| Gesture | Result |
|---|---|
| Index finger and thumb apart or closer | zoom in or out, smoothly and continuously |
| Move your hand left or right | the graph follows your hand and rotates |
| Move your hand up or down | tilts the graph, and scrolls between clusters |
| Index fingertip over a note | the note turns red with white corner brackets |
| Pinch (fingertips touch) | switch to the next topology, once per pinch |
| Two hands apart or together | zoom in or out |
| No hand in view | slow idle drift, the graph keeps breathing |

Without a camera: wheel scrolls, drag rotates, click or the right arrow switches topology, `+` and `-` zoom, `A` `Q` `E` spin, `1` to `4` pick a topology, `D` shows a debug overlay.

## Run it

You need Node.js 18 or newer, a webcam, and Chrome or Edge.

```bash
npm install
npm run dev
```

Open `http://localhost:5173` and allow camera access. Use `localhost`, because browsers only allow camera access on localhost or HTTPS.

Other commands:

```bash
npm test
npm run build
npm run preview
```

## How it works

1. The webcam feed is analysed in the browser by the MediaPipe Hand Landmarker, which finds 21 points on each hand.
2. `gestures.js` and `navigation.js` turn those points into zoom, rotation, scroll and pinch, with filtering, springs and a debounced pinch state machine so nothing jitters or fires twice.
3. `graph.js` holds the notes, the four layouts and the morphing between them.
4. `scene.js` draws lines and dots with Three.js, and `ui.js` draws the text, the side panel and the hand dots.

```
src/
  main.js         app loop and input wiring
  graph.js        notes, topologies, morphing, signals
  scene.js        Three.js lines and dots
  ui.js           text layer, side panel, HUD
  navigation.js   zoom, rotation and scroll physics
  gestures.js     hand measurements and pinch state machine
  handInput.js    camera and MediaPipe loop
  math.js         filters and springs
test/logic.test.mjs
scripts/prepare.mjs
```

## Fork it

1. Click **Fork** at the top right of the repository page on GitHub. This creates your own copy.
2. Clone your fork:

   ```bash
   git clone https://github.com/<your-username>/gesture-thought-topology.git
   cd gesture-thought-topology
   ```

3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

4. Create a branch for your changes:

   ```bash
   git checkout -b my-change
   ```

5. Make your changes, then commit and push:

   ```bash
   git add .
   git commit -m "describe your change"
   git push origin my-change
   ```

6. To share it back, open a pull request from your branch on GitHub.

To pull in updates from the original repository later:

```bash
git remote add upstream https://github.com/tubakhxn/gesture-thought-topology.git
git fetch upstream
git merge upstream/main
```

### Easy things to change

- Your own notes and cluster names: `CLUSTERS` and `VOC` in `src/graph.js`.
- Number of clusters and notes per cluster: `P` and `PER` in `src/graph.js`.
- Rotation range: `yawRange` in `src/navigation.js`.
- Zoom range: `NEAR` and `FAR` in `src/main.js`.
- New network shapes: add an entry to `TOPOLOGIES` and a branch in `layout()` in `src/graph.js`.

## Troubleshooting

- Nothing responds to your hand: look at the message at the top of the screen. It says if the camera was blocked or the hand model failed to load. Press `D` to see whether tracking is `camera` or `none`.
- The hand model downloads on the first run, so you need internet once.
- Good light and a clearly visible hand about an arm's length from the camera work best.

## Credits

Created by tubakhxn. Built with Three.js, MediaPipe Hand Landmarker and Vite. See `THIRD_PARTY_NOTICES.md`.
