"""Cover detailing, part 2: face control panels, cold-head turret, and the cryocooler /
service neck / quench stub under it. (The bore liner is defined in 01_stack.py.)"""
import bpy, math
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\helpers.py").read())

D = 0.84
covers = layer("covers")
white = bpy.data.materials["Cover_GlossABS"]
graphite = bpy.data.materials["Bezel_Graphite"]

# --- face control panels, either side of the bezel ------------------------------------------
soft = material("Button_SoftTouch", (0.20, 0.21, 0.22), 0.0, 0.55)
stop = material("Button_Stop", (0.62, 0.06, 0.05), 0.0, 0.35, coat=0.5)
screen = material("Panel_Display", (0.01, 0.012, 0.014), 0.0, 0.06, coat=1.0,
                  emit=(0.35, 0.62, 0.78), emit_strength=0.35)
led = material("Panel_LED_ready", (0.1, 0.5, 0.2), 0.0, 0.3, emit=(0.15, 1.0, 0.35), emit_strength=4.0)
for side, sx in (("L", -1), ("R", 1)):
    x = sx * 0.80; zc = ISO + 0.02; yf = -D - 0.006
    rounded_box(f"Panel_{side}", (0.105, 0.012, 0.36), (x, yf, zc), 0.006, graphite, covers)
    rounded_box(f"Panel_{side}_display", (0.080, 0.003, 0.045), (x, yf - 0.0065, zc + 0.13), 0.002, screen, covers)
    # table up / down, in / out, laser, home: two columns of soft-touch buttons
    for i, (dx, dz) in enumerate([(-0.022, 0.06), (0.022, 0.06), (-0.022, 0.012), (0.022, 0.012), (-0.022, -0.036), (0.022, -0.036)]):
        cylinder(f"Panel_{side}_btn{i}", 0.0115, 0.006, (x + dx, yf - 0.007, zc + dz), soft, covers, axis="Y", verts=32, bevel=0.0015)
    cylinder(f"Panel_{side}_stop", 0.016, 0.009, (x, yf - 0.009, zc - 0.115), stop, covers, axis="Y", verts=40, bevel=0.002)
    cylinder(f"Panel_{side}_led", 0.0028, 0.002, (x + 0.032, yf - 0.007, zc + 0.165), led, covers, axis="Y", verts=16)

# --- turret cover over the cold head -------------------------------------------------------
# a low tapered hump set toward the rear, not a hat: ~22 cm above the shroud crown
TZ0, TZ1, TY = 2.115, 2.37, 0.30
def rrect3(w, d, z, n=7.0):
    return [(x, TY + y, z) for x, y in squircle(w / 2, d / 2, n, N=96)]
loops = [rrect3(0.74, 0.92, TZ0), rrect3(0.72, 0.90, 2.19), rrect3(0.62, 0.78, TZ1 - 0.03),
         rrect3(0.58, 0.74, TZ1 - 0.007), rrect3(0.50, 0.66, TZ1)]
t = loft_loops("Turret_cover", loops, white, covers)
s = t.modifiers.new("Wall", "SOLIDIFY"); s.thickness = 0.008; s.offset = -1
shadow = bpy.data.materials["Seam_Shadow"]
ts = loft_loops("Turret_seam", [rrect3(0.746, 0.926, 2.150), rrect3(0.746, 0.926, 2.158)], shadow, covers, cap=False)
ts.modifiers.new("Wall", "SOLIDIFY").thickness = 0.003               # watertight for the EXACT cutaway

# --- cryocooler + service neck + quench stub (own layer, sits inside the turret) ----------
cold = layer("coldhead")
steel = bpy.data.materials["OVC_Stainless"]
alu = bpy.data.materials["CoilFormer_Al"]
copper = bpy.data.materials["RF_Copper"]
motor = material("ColdHead_Motor", (0.16, 0.17, 0.18), 0.6, 0.4)
cx, cy = 0.0, TY
# heights: OVC crown 2.05, thermal shield 2.025, He vessel 2.00, turret inner top ~2.36
hx, hy = cx + 0.02, cy - 0.03
cylinder("Service_neck", 0.150, 0.12, (cx, cy, 2.11), steel, cold, verts=64, bevel=0.004)          # OVC turret tube
cylinder("Neck_flange", 0.185, 0.020, (cx, cy, 2.18), steel, cold, verts=64, bevel=0.003)
cylinder("Coldhead_motor", 0.085, 0.150, (hx, hy, 2.265), motor, cold, verts=48, bevel=0.006)
cylinder("Coldhead_valve", 0.050, 0.015, (hx, hy, 2.3475), motor, cold, verts=32, bevel=0.003)
cylinder("Coldhead_stage1", 0.060, 0.200, (hx, hy, 2.09), copper, cold, verts=40)     # ~45 K, ties to the thermal shield
cylinder("Coldhead_stage2", 0.034, 0.060, (hx, hy, 1.96), copper, cold, verts=32)     # 4 K, recondenses helium
for i, y in enumerate((cy - 0.01, cy + 0.035)):                                       # supply / return He gas lines
    cylinder(f"He_line_coupling_{i}", 0.018, 0.05, (cx + 0.12, y, 2.29), steel, cold, axis="X", verts=24, bevel=0.002)
cylinder("Quench_stub", 0.075, 0.30, (cx - 0.16, cy + 0.14, 2.23), steel, cold, verts=48, bevel=0.003)   # to the room's quench pipe
cylinder("Quench_flange", 0.105, 0.02, (cx - 0.16, cy + 0.14, 2.385), steel, cold, verts=48, bevel=0.003)
cylinder("He_fill_port", 0.028, 0.10, (cx + 0.12, cy - 0.10, 2.23), steel, cold, verts=24, bevel=0.002)

# the quench stub breaks through the turret top: give the cover a matching collar
cylinder("Quench_collar", 0.092, 0.012, (cx - 0.16, cy + 0.14, TZ1 + 0.002), graphite, covers, verts=48, bevel=0.003)

for o in coll().objects:
    if o.parent in (cold,) or o.name.startswith(("Turret", "Panel_", "Quench_collar")):
        cut = bpy.data.objects["_cut_quarter"]
        if o.type == "MESH" and "Cutaway" not in o.modifiers:
            m = o.modifiers.new("Cutaway", "BOOLEAN"); m.object = cut; m.solver = "EXACT"
cutaway(False)
print("panels + turret ok")
