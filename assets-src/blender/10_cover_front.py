"""Cover detailing, part 1: panel seams, bore bezel, light line, laser window, exterior camera.
Re-runnable: every object it makes is replaced on the next run."""
import bpy, math
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\helpers.py").read())

A, B, N_EXP, D = SHROUD_A, SHROUD_B, SHROUD_N, SHROUD_D
SEAM = 0.010
covers = layer("covers")
shroud = bpy.data.objects["Cover_shroud"]

graphite = material("Bezel_Graphite", (0.055, 0.06, 0.065), 0.0, 0.38, coat=0.35)
gap_dark = material("Seam_Shadow", (0.025, 0.027, 0.03), 0.0, 0.8)
light = material("Bore_LightLine", (0.9, 0.95, 1.0), 0.0, 0.3, emit=(0.86, 0.93, 1.0), emit_strength=8.0)
glass = material("Laser_Window", (0.01, 0.01, 0.012), 0.0, 0.05, coat=1.0)

# --- shadow-gap seams: front cover / body / rear cover -------------------------------------
# A thin annular cutter outside the cryostat (r > 1.03) so only the outer wall is grooved.
for tag, y0 in (("front", -0.600), ("rear", 0.600 - SEAM)):
    cut = lathe(f"_cut_seam_{tag}", ring(1.03, 1.70, y0, y0 + SEAM), None, segs=64)
    cut.display_type = "WIRE"; cut.hide_render = True; cut.hide_set(True)
    name = f"Seam_{tag}"
    mod = shroud.modifiers.get(name) or shroud.modifiers.new(name, "BOOLEAN")
    mod.object = cut; mod.operation = "DIFFERENCE"; mod.solver = "EXACT"
    # dark backer band just inside the skin so the gap reads as a shadow, not as hollow cover
    s = 0.975
    loops = [[(x, y, z + ISO) for x, z in squircle(A, B, N_EXP, s)] for y in (y0 - 0.03, y0 + SEAM + 0.03)]
    bk = loft_loops(f"Seam_backer_{tag}", loops, gap_dark, covers, cap=False)
    bk.modifiers.new("Wall", "SOLIDIFY").thickness = 0.003          # watertight, so the EXACT cutaway can cut it
    c = bk.modifiers.new("Cutaway", "BOOLEAN"); c.object = bpy.data.objects["_cut_quarter"]; c.solver = "EXACT"

# keep the cutaway boolean last so the section still cuts through the seamed shell
with bpy.context.temp_override(object=shroud, active_object=shroud):
    bpy.ops.object.modifier_move_to_index(modifier="Cutaway", index=len(shroud.modifiers) - 1)

# --- bezel around the bore mouth ------------------------------------------------------------
bez = lathe("Bore_bezel", rounded_profile(0.506, 0.640, -D - 0.010, -D + 0.004, 0.0045), graphite, covers)
lathe("Bore_light_line", ring(0.521, 0.528, -D - 0.0106, -D - 0.0096), light, covers)
rounded_box("Laser_window", (0.078, 0.004, 0.016), (0, -D - 0.0108, ISO + 0.585), 0.0019, glass, covers)

# rear bezel: same language, plainer (no light, no laser)
lathe("Bore_bezel_rear", rounded_profile(0.506, 0.600, D - 0.004, D + 0.008, 0.004), graphite, covers)

# --- exterior hero camera --------------------------------------------------------------------
cam = bpy.data.objects.get("Exterior_cam")
if cam is None:
    cam = bpy.data.objects.new("Exterior_cam", bpy.data.cameras.new("Exterior_cam"))
    bpy.context.scene.collection.objects.link(cam)
cam.data.lens = 38
cam.location = (3.3, -5.6, 1.55)
aim(cam, (0.0, -0.9, 0.95))
bpy.context.scene.camera = cam
for n in ("Bore_bezel", "Bore_light_line", "Laser_window", "Bore_bezel_rear"):
    o = bpy.data.objects[n]
    if "Cutaway" not in o.modifiers:
        c = o.modifiers.new("Cutaway", "BOOLEAN"); c.object = bpy.data.objects["_cut_quarter"]; c.solver = "EXACT"
cutaway(False)
print("cover front ok", [m.name for m in shroud.modifiers])
