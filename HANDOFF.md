# MRISafe Twin v2: handoff

## Who and why
- The original is **MRISafe Twin** by Allwyn Sir (Sudarshan's professor): https://allwyn3t6.github.io/MRI---safe-train/ (repo owner: Allwyn3t6).
  He built it after being inspired by Sudarshan's RP2040 / Pico W Teardown Bench (https://suducodes.github.io/RP2040/). Sudarshan is proud of this and wants to give back.
- **Goal:** take sir's project to the next level. It should be extravagant, look real (photographic), be genuinely enjoyable to study, and make the subject clear.
  It should **not** just copy the RP2040 look. It should be far better than that.
- **Hard rule:** it must NOT look vibecoded. It should feel natural, authored and restrained, and surprise Sudarshan the way the RP2040 bench did.
- **Status:** the architecture is planned and approved for direction. Nothing has been built yet. Sir's buy-in is still pending, so treat this as a v2 branch/PR on his repo, not a replacement.
  Open questions: target hardware (lab PCs vs laptops), deadline.

## What the current site does (audited 2026-10-13 in browser)
- Home page with Train/Learn cards. The status chips (controller, coach) are fine.
- **Learn:** a 14-chapter list, a 3D cutaway (peel layers, explode, labels, patient) and a text panel. Live Larmor, slice and FFT values. Coach and quiz.
- **Train:** scenario dropdown (L2 Standard pre-scan), checkpoints T1–T6, a 3D suite with zones, an inspector, a rule-based assessor with evidence, an event log, and a trainer report.
- **Input:** ESP32-S3 controller (6 touch pads, MPU9250 tilt/tap/flick, magnetometer "wand meter"), MediaPipe hand tracking, and keys 1–6.
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
  - Model everything in Blender: a real layer stack (covers → gradient former → cryostat → 4 K He vessel → NbTi windings → shims), RF body and head coils, the table.
  - Build the full suite: control room glass, Faraday cage, penetration panel, quench pipe, Zone I–IV.
  - Bake lightmaps and AO. Export glTF with Meshopt and KTX2, streamed per chapter, with a first paint under 5 MB.
  - Use real ASTM F2503 signage.
- **Render engine:**
  - Vite + TS + Three.js, with WebGPU and a WebGL2 fallback.
  - AgX tone mapping, HDRI, SSAO, TAA, restrained bloom.
  - A spline camera director, a clipping and peel system driven by data, and quality tiers.
- **Physics core** (workers + GPU):
  - Biot–Savart field from the coil geometry, stored as a 3D texture. It drives field lines, the 5-gauss floor line, spatial gradient maps and projectile force (∝ B·∇B).
  - A GPU Bloch sim with 10k–50k spins.
  - A sequence engine (SE, GRE, EPI as data).
  - k-space plus FFT recon with injectable artefacts.
  - Larmor, SAR and dB/dt calculators.
- **Master sequence clock:** one timeline syncs the RF and gradient visuals, the audio, the scope and k-space filling. This is the key decision.
- **Director:** chapters are data files made of "beats" (camera shot, highlight, sim params, caption, audio cue, checkpoint). Sir can edit content without touching code.
- **Training engine:**
  - Port sir's assessor intact.
  - Add a first-person walk through Zones I to IV, with a ferromagnetic detector at the door.
  - Show consequences honestly: the projectile effect from the real force curve, and a quench (vent plume, frost, O₂ alarm).
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
