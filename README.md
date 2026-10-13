# MRISafe Twin v2

A 1.5 T MRI suite you can take apart: learn how MRI works on a to-scale scanner whose physics is
computed from its own geometry, then practise the MR safety checks in the suite itself.

v2 is built on **MRISafe Twin by Allwyn Sir** ([original](https://allwyn3t6.github.io/MRI---safe-train/)).
His assessment engine, physics, knowledge base, coach and controller mapping are used **unmodified**
(`src/training/sir-engine.cjs`, `src/physics/sir-physics.cjs`, `src/coach/sir-kb.cjs`,
`src/coach/sir-coach.cjs`, `src/input/sir-controller.cjs`), and his 14 chapters are reproduced word
for word (`src/content/chapters.json`, extracted by `tools/extract-chapters.mjs`).

> Educational simulation. The rules are illustrative (see Allwyn Sir's `docs/rules.md`) and are not a
> substitute for local MR safety procedures, manufacturer labelling, or an MR safety officer.

## Run it

```bash
npm install
npm run dev
```

Open the address it prints. A production build goes to `dist/` with `npm run build`; it uses relative
paths, so `dist/` can be served from any folder (for example GitHub Pages).

## What is in it

**Learn** (14 chapters, Allwyn Sir's text):

| Chapter | What the scanner does |
|---|---|
| Cold open | Through the control-room glass; the covers lift away layer by layer to the NbTi windings |
| Assembly | Builds the magnet in factory order, in a live quarter section |
| Magnet | Field lines and the 5 gauss floor line from a Biot–Savart model of the coils (turns solved for a flat field and a cancelled far-field dipole). Shielded vs unshielded, 0.5 / 1.5 / 3 T, and a steel wrench whose pull uses B·dB/dx |
| Cryostat, shims, gradients, RF | Peeled layers with callouts; shim error map from the coil model; gradient coils pulse and knock; the copper cage behind the walls |
| Spins, RF, relaxation | An ensemble of magnetisation vectors: precession, a 90° tip, dephasing, a spin echo on an oscilloscope; T1/T2 by tissue |
| Slice selection, k-space | Δz = BW / (γ̄G) in the bore; k-space fills in time with synthesised gradient knocks or EPI buzz, the image forms (Allwyn Sir's FFT); motion, metal and open-RF-door artefacts |
| Quench | Field collapse, helium boil-off up the vent line; blocked-vent oxygen estimate and alarm |
| Quiz | Allwyn Sir's six questions |

**Train**: his scenarios, checkpoints (pads T1–T6, keys 1–6), rules and scoring, played in the
suite: the patient record at the console, equipment in the Zone II staging bay and in Zone IV, the
door check with the patient on the table, the ferromagnetic detector at the Zone IV door, and a
"what would have happened" replay when an MR Unsafe item is stopped at the door. Reports and the
adaptive next-scenario recommendation are his; they export as JSON and CSV. A separate quench drill
(illustrative) practises the order of priorities.

**Coach**: his offline knowledge base. If a local Ollama server is running, the coach can phrase
answers with a local model, grounded only in the retrieved knowledge-base entries, and labels it.

**Controller**: his ESP32-S3 controller over Web Serial (Chrome or Edge): pads, tilt to orbit,
gestures, and the magnetometer wand reading.

## Editing content without code

* Chapter text: `src/content/chapters.json` (or re-extract from the original with
  `npm run extract:chapters`).
* What the scanner shows per chapter (camera shot, which layers peel away, callouts, instrument):
  `src/learn/chapters.ts`.
* Rules, items and scenarios: Allwyn Sir's `src/training/sir-engine.cjs`, unchanged from his repo.

## 3D assets

Everything 3D is built by Blender scripts in `assets-src/blender/` (see `assets-src/README.md`), so
the model can be rebuilt and reviewed like code. `tools/build-assets.ps1` bakes the lighting in a
headless Blender (Cycles, GPU), exports the glTF files and Meshopt-compresses them into
`public/assets/` (about 2.5 MB of geometry plus two lightmaps and a reflection probe).

## Performance

The renderer adapts its resolution to hold a steady frame rate on integrated graphics (most lab
PCs). Lighting is baked, so the browser does very little lighting work at runtime.
