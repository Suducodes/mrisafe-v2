# MRISafe Twin v2: handoff

## Who and why
- The original is **MRISafe Twin** by Allwyn Sir (Sudarshan's professor): https://allwyn3t6.github.io/MRI---safe-train/ (repo owner: Allwyn3t6).
  He built it after being inspired by Sudarshan's RP2040 / Pico W Teardown Bench (https://suducodes.github.io/RP2040/). Sudarshan is proud of this and wants to give back.
- **Goal:** take sir's project to the next level. It should be extravagant, look real (photographic), be genuinely enjoyable to study, and make the subject clear.
  It should **not** just copy the RP2040 look. It should be far better than that.
- **Hard rule:** it must NOT look vibecoded. It should feel natural, authored and restrained, and surprise Sudarshan the way the RP2040 bench did.
- **Status (2026-10-14):** built and working end to end. Local git only (Suducodes identity), nothing pushed. Sir's buy-in is still pending, so treat this as a v2 branch/PR on his repo, not a replacement.
  Open questions: deadline. Target hardware is now partly answered: the in-app browser renders on Intel UHD integrated graphics, and the adaptive resolution holds it usable.

## Where it stands (read this first)
- **Run:**
  - `npm run dev`: the dev server. The parent `.claude/launch.json` entry is `mrisafe-v2`, on port 5191.
  - `npm run build`, then `npm run preview`: the production build, on port 5192 (`mrisafe-v2-dist`).
- **Assets:** `npm run build:assets` runs a headless Blender bake (OptiX) plus Meshopt, about 12 minutes (room atlas 4096); `-Quick` takes about 2 minutes.
  - Equipment and the patient are kept out of the bake (no shadows, no bounce): they move or hide at runtime and left dark ghost shadows. They get live contact shadows in `train/scene.ts`.
  - The model rebuilds from the scripts `assets-src/blender/01..26`.
  - The run order is in `assets-src/README.md`.
- **Learn:**
  - **Cold open:** a flight through the RF glass. The room then dissolves in nanotech tiles and the scanner stands in a dark studio hall. It is peeled down to the windings, then reassembled.
  - **Studio hall (`src/engine/studio.ts`):** the room layers stay hidden in Learn. A graphite floor (one shader: light pools, shadow, fog, grid), sky and a softbox environment crossfade with the baked suite rig (exposure, bloom threshold, lightmap scale, IBL).
    - ch07 and ch13 bring the suite back (`env: 'suite'` in `chapters.ts`).
    - The dark console theme is `body.theme-dark`.
    - There are no three.js lights anywhere. The hall's key and rims are softboxes in the environment (`KEYS` in `studio.ts`); every light would cost every material per pixel, in the suite too.
  - **Nano peel (`src/engine/patches.ts` + `layers.ts`):** a single `onBeforeCompile` patch composes the baked lighting and the dissolve.
    - Triplanar hex plates with glowing rims, a lit seam and darkening near the front.
    - GPU particles sampled from each layer's surface.
    - The dissolve and the quarter section (`CUT`) are compiled in only while a layer is live (`setNanoLive`): a `discard` turns off early depth rejection. Draw order is outside in (`DRAW_ORDER`).
    - Bloom runs only while something dissolves. At rest the scene renders straight to the canvas with 4x MSAA; during a dissolve, the post chain (HDR, bloom, FXAA). `App.warmUp()` compiles every variant (lean/live x canvas/HDR) in parallel behind the loading line.
  - **Surface detail (`DETAIL` in `patches.ts`, `FINISH` in `layers.ts`):** procedural, world-space finishes by material name (vinyl, paint, ceiling tile, brushed metal, copper, oak, fabric, coat), driven by a 256 px tiling noise texture.
  - **Chapters:** 14, in sir's words, each with a camera shot, peel, cutaway, callouts and a live instrument:
    - assembly
    - Biotâ€“Savart field lines, the 5 G floor line and the wrench projectile
    - cryostat, shim map, gradient pulses and knocks, RF cage reveal
    - spin ensemble and spin echo, T1/T2 relaxation
    - slice selection, k-space with sound and artefacts
    - quench, quiz
- **Train:**
  - **Walk mode (`input/walk.ts`):** W A S D / arrows, Shift to run, drag to look, click the floor to walk there. Collisions against a 4 cm floor plan rasterised once from the geometry; equipment is avoided live; the RF door opens as you approach.
  - **Guide (`train/guide.ts`):** objective bar from sir's `nextHint()` plus how to do it here, a waypoint marker on the target (edge arrow when off-screen), hover labels, and a controls card (H).
  - Sir's engine is unmodified, playing out in the Zone II/III/IV corridor and staging bay with his five items and the patient under a blanket.
  - Hints, violations with their evidence, the projectile replay for blocked MR Unsafe moves, the table sliding into the bore on T5, and a report with his adaptive recommendation and JSON/CSV export.
  - A quench drill, illustrative and scored separately.
- **Coach:**
  - Sir's KB runs offline.
  - It detects a local Ollama and grounds answers in the KB. The user's Ollama install is broken (`llama-server` missing), so the coach falls back honestly.
- **Controller:** sir's ESP32 over Web Serial: pads, tilt-orbit, gestures and the wand.
- **Hands:**
  - Sir's MediaPipe hand control: vendored library and his gesture logic.
  - The model file `hand_landmarker.task` isn't downloaded yet. It loads from Google's storage at runtime, or can be saved into `public/models/` for offline use.
- **Verification:** with the browser pane hidden, use `__stage.advance(seconds)` in dev to step frames deterministically, then screenshot. Set `__stage.holdUntil = Infinity` first: a hidden pane throttles the loop, and the resolution controller would read that as a slow GPU.
- **Performance (Intel UHD, 1920x1080, GPU timer queries):** Train staging view ~16 ms, Learn hall hero ~8 ms. The user's laptop also has an RTX 5060 that the browser does not use by default (Windows graphics setting per app).
- **Not done yet:**
  - A live console UI on the control-room monitors.
  - KTX2 textures (`toktx` isn't installed).

## What the current site does (audited 2026-10-13 in browser)
- Home page with Train/Learn cards. The status chips (controller, coach) are fine.
- **Learn:** a 14-chapter list, a 3D cutaway (peel layers, explode, labels, patient) and a text panel. Live Larmor, slice and FFT values. Coach and quiz.
- **Train:** scenario dropdown (L2 Standard pre-scan), checkpoints T1â€“T6, a 3D suite with zones, an inspector, a rule-based assessor with evidence, an event log, and a trainer report.
- **Input:** ESP32-S3 controller (6 touch pads, MPU9250 tilt/tap/flick, magnetometer "wand meter"), MediaPipe hand tracking, and keys 1â€“6.
- **Problems:**
  - The 3D sits in a cramped centre column, squeezed between panels.
  - Labels overlap and get clipped.
  - Flat white primitive models.
  - A dashboard-style 3-panel layout with a horizontal scrollbar at 800px.
  - Slow Learn load ("Winding the magnet").
  - `/api/status` returns 404 on Pages, but the Coach chip still shows green.
  - No hero moment on the home page.
- **Keep:** the rule assessor, physics, controller and hands input, and the honest disclaimers (ACR Manual on MR Safety, ASTM F2503).

## Architecture (agreed direction)
**Core idea:** the scanner itself is the interface. A real-looking suite at true scale. Every visual comes from real physics.

- **Asset pipeline:**
  - Model everything in Blender: a real layer stack (covers â†’ gradient former â†’ cryostat â†’ 4 K He vessel â†’ NbTi windings â†’ shims), RF body and head coils, the table.
  - Build the full suite: control room glass, Faraday cage, penetration panel, quench pipe, Zone Iâ€“IV.
  - Bake lightmaps and AO. Export glTF with Meshopt and KTX2, streamed per chapter, with a first paint under 5 MB.
  - Use real ASTM F2503 signage.
- **Render engine:**
  - Vite + TS + Three.js, with WebGPU and a WebGL2 fallback.
  - AgX tone mapping, HDRI, SSAO, TAA, restrained bloom.
  - A spline camera director, a clipping and peel system driven by data, and quality tiers.
- **Physics core** (workers + GPU):
  - Biotâ€“Savart field from the coil geometry, stored as a 3D texture. It drives field lines, the 5-gauss floor line, spatial gradient maps and projectile force (âˆ BÂ·âˆ‡B).
  - A GPU Bloch sim with 10kâ€“50k spins.
  - A sequence engine (SE, GRE, EPI as data).
  - k-space plus FFT recon with injectable artefacts.
  - Larmor, SAR and dB/dt calculators.
- **Master sequence clock:** one timeline syncs the RF and gradient visuals, the audio, the scope and k-space filling. This is the key decision.
- **Director:** chapters are data files made of "beats" (camera shot, highlight, sim params, caption, audio cue, checkpoint). Sir can edit content without touching code.
- **Training engine:**
  - Port sir's assessor intact.
  - Add a first-person walk through Zones I to IV, with a ferromagnetic detector at the door.
  - Show consequences honestly: the projectile effect from the real force curve, and a quench (vent plume, frost, Oâ‚‚ alarm).
- **Audio:**
  - Gradient waveforms synthesize the scanner sound (EPI buzz vs SE knock).
  - Cold-head chirp ambience, room tone, alarms.
- **Input:** abstract intents shared by mouse, ESP32 (Web Serial) and hands. The wand meter can be compared with the simulated field.
- **Coach:** offline KB plus Ollama, context-aware. Show "offline" honestly.
- **UI:**
  - Clinical and architectural: hospital signage, technical drawings, an MR console feel.
  - A cool off-white default with a dark console theme. ACR zone colours are the only accents. One real type pairing, mono for numbers only.
  - The 3D always fills the screen.

## Wow moments (each one teaches)
1. **Cold open:** move through the control-room glass to the scanner. The covers lift away layer by layer down to the windings.
2. **Field lines bloom:** the 5-gauss line draws on the floor, and a wrench feels the pull.
3. **A sea of spins:** an RF tip, then dephasing, then the echo refocuses, in sync with the signal trace.
4. **Hear the image being made:** gradients flash, the knocking plays, k-space fills and the image appears.
5. **Break it:** motion ghosts, metal distortion, an RF spike from an open door.
6. **Quench emergency** in Train.

## Folder plan
```
mrisafe-v2/
  assets-src/  public/assets/
  src/engine physics clock director content training audio input coach ui
```

## Phases
1. **Foundation:** clone sir's repo, extract his rules and chapters, build the engine shell, model the hero scanner in Blender.
2. **Learn v2:** wow moments 1 to 5.
3. **Train v2:** first-person walk, assessor, consequences, quench.
4. **Polish:** tour, coach, controller, performance tiers, mobile fallback.

## Environment notes
- **Blender 5.1.2** with the "MCP for Blender" add-on v1.8 (`blender_mcp.py`) on port 9876. The old `addon.py` was renamed to `.old`.
- **MCP server:** `blender-mcp` in `~/.claude.json` runs `uvx mcp-for-blender`, and its tools are `mcp__blender-mcp__*`.
  Ignore the other `mcp__Blender__*` tools, which are incompatible with this add-on.
- **Shell:** PowerShell 5.1, so use `;` and never `&&`.
- **GitHub:** push personal work as Suducodes only. Never add Co-Authored-By lines to commits.
