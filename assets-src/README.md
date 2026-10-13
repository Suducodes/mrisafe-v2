# Assets

Everything 3D is built by scripts, so the model can be rebuilt, reviewed and changed like code.

## Model (live Blender)

`scanner.blend` is the working file. Each step in `blender/` re-creates what it owns, so any
step can be re-run after an edit. Run them in order from Blender's Python console or through
the MCP add-on with `exec(open(r"...\blender\<step>.py").read())`:

| Step | Builds |
|---|---|
| `01_stack.py` | Scanner core, inside out: liner, birdcage, RF shield, gradient set + shims, cryostat shells, NbTi windings |
| `02_shroud.py` | Main cover (superellipse outline, flared bore mouths, open at the bore) |
| `10_cover_front.py` | Panel seams, bore bezel, light line, laser window, exterior camera |
| `11_cover_panels_turret.py` | Face control panels, cold-head turret, cryocooler, quench stub |
| `12_table_headcoil.py` | Patient table (cradle follows the bore curve), head coil |
| `13_section_and_light.py` | Hatched section caps for cutaway previews, render settings |
| `20_room_shell.py` … `24_control_room.py` | Zone IV room + RF cage, fixtures, services, signage, control room |

`helpers.py` holds the shared geometry helpers; `room_dims.py` the room dimensions.
Conventions: metres, Blender Z up, bore axis along Y, isocentre at (0, 0, 1.05), table toward -Y.
Every engine-peelable part sits under an `L_<layer>` empty.

## Web build

```bash
powershell -File tools/build-assets.ps1
```

Runs Blender headless (`tools/bake_and_export.py`; the `.blend` is never modified), then
Meshopt-compresses into `public/assets/`. `-Quick` bakes at 1024 px / 48 samples to check the
pipeline in about two minutes; `-Reference` also path-traces the cold-open shot as ground truth.

Outputs: `scanner.glb`, `suite.glb`, `lm_room.webp` and `lm_scanner.webp` (baked diffuse
lighting on UV channel 1), `probe_room.hdr` (reflections), `lightmaps.json` (which mesh uses
which atlas, and each atlas's intensity scale).
