"""Outside the RF door: the Zone III corridor and the Zone II staging bay (glass partition, floor
zone lines, lockers, signs), the ferromagnetic detector at the Zone IV door, and Allwyn Sir's five
training items with their MR labelling exactly as his engine defines it (o2 and pump unlabelled).
Each item is an Item_<id> empty the engine moves between zones."""
import bpy, math
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\helpers.py").read())
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\room_dims.py").read())
TARGET = "Room"
signs = layer("room_signage")
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\signs_lib.py").read())

zones = layer("zones")
paint = bpy.data.materials["Ctrl_Wall_Paint"]
floor_m = bpy.data.materials["Ctrl_Floor_Vinyl"]
ceil_m = bpy.data.materials["Ctrl_Ceiling"]
frame_m = bpy.data.materials["Frame_PowderCoat"]
glass = bpy.data.materials["RF_Window_Glass"]
steel = bpy.data.materials["OVC_Stainless"]
dark = bpy.data.materials["Device_Black"]
tape = {z: material(f"Floor_Tape_Zone{z}", c, 0.0, 0.5) for z, c in
        (("II", (0.72, 0.56, 0.08)), ("III", (0.78, 0.40, 0.14)), ("IV", (0.70, 0.17, 0.14)))}

# corridor box in front of the magnet room and the control room
CX_W, CX_E = CTRL_X, 2.95
CYN, CYS = CY0 - 0.125, -7.10            # north edge (door line) to south wall
HCOR = 2.70
xm, ym = (CX_W + CX_E) / 2, (CYN + CYS) / 2
box("Corr_floor", (CX_E - CX_W, Y0 - CYS, 0.10), (xm, (Y0 + CYS) / 2, -0.05), floor_m, zones)   # runs under the threshold to the room floor
box("Corr_ceiling", (CX_E - CX_W, CYN - CYS, 0.02), (xm, ym, HCOR + 0.01), ceil_m, zones)
box("Corr_wall_south", (CX_E - CX_W, 0.12, HCOR), (xm, CYS - 0.06, HCOR / 2), paint, zones)
box("Corr_wall_east", (0.12, CYN - CYS, HCOR), (CX_E + 0.06, ym, HCOR / 2), paint, zones)
box("Corr_wall_west", (0.12, CYN - CYS, HCOR), (CX_W - 0.06, ym, HCOR / 2), paint, zones)
# corridor face of the magnet room: a finished wall outside the cage, the RF door leaf flush in its opening
NW = CX0 - 0.165                           # west end: the control-room partition (24_control_room.py)
outer = box("Corr_wall_north", (CX_E - NW, 0.07, HCOR), ((CX_E + NW) / 2, CY0 - 0.088, HCOR / 2), paint, zones)
outer_cut = box("_cut_outer_door", (DOOR["x1"] - DOOR["x0"] + 0.16, 0.3, (DOOR["z1"] + 0.07) * 2), ((DOOR["x0"] + DOOR["x1"]) / 2, CY0 - 0.088, 0), None)
cut_openings(outer, [outer_cut], "Door")
# a doorway from the control room into the corridor (the control room's front wall exists already)
cut = box("_cut_ctrl_door", (1.0, 0.4, 2.1), (-4.6, -4.46, 1.05), None)
cut_openings(bpy.data.objects["Ctrl_wall_front"], [cut], "Door")

# Zone II staging bay behind a glass partition with a door gap; Zone III west of it
PX = 0.85                                  # partition line
merged_boxes("Zone_partition_frame", [((0.05, 0.05, HCOR), (PX, y, HCOR / 2)) for y in (CYN - 0.03, -5.55, -6.55, CYS + 0.03)]
             + [((0.05, CYN - CYS, 0.06), (PX, ym, HCOR - 0.03)), ((0.05, CYN - CYS, 0.06), (PX, ym, 0.03))], frame_m, zones)
for i, (y0, y1) in enumerate(((CYN - 0.06, -5.55), (-6.55, CYS + 0.06))):
    box(f"Zone_partition_glass_{i}", (0.012, y0 - y1 - 0.05, HCOR - 0.12), (PX, (y0 + y1) / 2, HCOR / 2), glass, zones)
# floor zone lines (100 mm tape): Zone II/III at the partition, Zone III/IV at the RF door threshold
box("Tape_II_III", (0.10, CYN - CYS, 0.003), (PX, ym, 0.0015), tape["III"], zones)
box("Tape_III_IV", (DOOR["x1"] - DOOR["x0"] + 0.6, 0.10, 0.003), ((DOOR["x0"] + DOOR["x1"]) / 2, CYN - 0.12, 0.0015), tape["IV"], zones)
box("Tape_II_bay", (CX_E - PX - 0.3, 0.10, 0.003), ((PX + CX_E) / 2 + 0.15, CYN - 0.12, 0.0015), tape["II"], zones)

# corridor lights
for i, x in enumerate((-4.0, -1.35, 1.9)):
    box(f"Corr_light_{i}", (0.6, 0.6, 0.01), (x, ym, HCOR - 0.005), bpy.data.materials["Ctrl_LED"], zones)
    replace(f"Corr_light_area_{i}")
    l = bpy.data.lights.new(f"Corr_light_area_{i}", "AREA"); l.shape = "SQUARE"; l.size = 0.58; l.energy = 55; l.color = (1.0, 0.93, 0.84)
    o = bpy.data.objects.new(f"Corr_light_area_{i}", l); coll().objects.link(o); o.location = (x, ym, HCOR - 0.015); o.parent = zones

# patient lockers in Zone II (personal items are stored here before screening)
locker_m = material("Locker_Laminate", (0.66, 0.70, 0.72), 0.0, 0.45, coat=0.2)
for i in range(6):
    x = 1.25 + i * 0.27
    rounded_box(f"Locker_{i}", (0.26, 0.45, 1.8), (x, CYS + 0.24, 0.9), 0.004, locker_m, zones)
    rounded_box(f"Locker_{i}_handle", (0.012, 0.02, 0.12), (x + 0.09, CYS + 0.47, 1.05), 0.003, steel, zones)
    rounded_box(f"Locker_{i}_tag", (0.06, 0.004, 0.035), (x, CYS + 0.468, 1.55), 0.002, bpy.data.materials["Sign_White"], zones)
# staging bench where equipment waits to be checked
rounded_box("Staging_bench", (1.6, 0.5, 0.05), (1.95, -5.15, 0.46), 0.01, frame_m, zones)
for x in (1.25, 2.65):
    box(f"Staging_bench_leg_{x}", (0.04, 0.44, 0.44), (x, -5.15, 0.22), steel, zones)

# ferromagnetic detection pillars either side of the Zone IV door (corridor side)
fmd_led = material("FMD_LED", (0.2, 0.6, 0.3), 0.0, 0.4, emit=(0.2, 1.0, 0.45), emit_strength=2.5)
for side, x in (("L", DOOR["x0"] - 0.16), ("R", DOOR["x1"] + 0.16)):
    rounded_box(f"FMD_{side}", (0.10, 0.07, 1.85), (x, CYN - 0.12, 0.925), 0.02, frame_m, zones)
    rounded_box(f"FMD_{side}_strip", (0.012, 0.004, 1.5), (x, CYN - 0.157, 0.95), 0.002, fmd_led, zones)

# zone signs on the corridor walls
z3 = anchor("Sign_zone_III", (-2.4, CYS + 0.001, 1.75), 0.0)
plate("SgnZ3_plate", 0.42, 0.16, WHITE, z3)
flat("SgnZ3_bar", [(-0.2, 0.04), (0.2, 0.04), (0.2, 0.07), (-0.2, 0.07)], -STEP * 2, material("Sign_Orange", (0.78, 0.40, 0.14), 0.0, 0.45), z3)
label("SgnZ3_t", "ZONE III", 0.034, 0.0, 0.0, BLACK, z3, "bold")
label("SgnZ3_s", "Screened people only · MR personnel control access", 0.012, 0.0, -0.045, BLACK, z3)
z2 = anchor("Sign_zone_II", (2.1, CYS + 0.48, 2.12), 0.0)
plate("SgnZ2_plate", 0.36, 0.13, WHITE, z2)
label("SgnZ2_t", "ZONE II · Screening", 0.024, 0.0, 0.012, BLACK, z2, "bold")
label("SgnZ2_s", "Remove metal objects before going further", 0.011, 0.0, -0.03, BLACK, z2)

# ---------------------------------------------------------------------------------------------
# Equipment (Allwyn Sir's ITEMS). Home positions are in the staging bay; the engine moves them.
eq = layer("equipment")
white_paint = material("Eq_PowderCoat_White", (0.82, 0.83, 0.82), 0.0, 0.42)
chrome = material("Eq_Chrome", (0.86, 0.87, 0.88), 1.0, 0.16)
rubber = material("Eq_Rubber", (0.04, 0.04, 0.045), 0.0, 0.75)
fabric = bpy.data.materials["Chair_Fabric"]
foam = material("Eq_Foam_Blue", (0.20, 0.36, 0.62), 0.0, 0.9)
grey_plastic = material("Eq_Plastic_Grey", (0.55, 0.58, 0.60), 0.0, 0.5)
lcd = material("Eq_LCD", (0.02, 0.03, 0.03), 0.0, 0.1, coat=1.0, emit=(0.25, 0.55, 0.45), emit_strength=0.6)


def item(id_, x, y, rot=0.0):
    e = bpy.data.objects.get(f"Item_{id_}") or bpy.data.objects.new(f"Item_{id_}", None)
    if e.name not in coll().objects:
        coll().objects.link(e)
    e.parent = eq; e.location = (x, y, 0); e.rotation_euler = (0, 0, rot); e.empty_display_size = 0.3
    return e


def tube_between(name, a, b, r, mat, parent):
    """Cylinder from point a to point b (local to parent)."""
    from mathutils import Vector
    a, b = Vector(a), Vector(b)
    o = cylinder(name, r, (b - a).length, tuple((a + b) / 2), mat, parent, verts=20)
    o.rotation_mode = "QUATERNION"; o.rotation_quaternion = (b - a).to_track_quat("Z", "Y")
    return o


def wheel(name, r, w, loc, mat, parent, axis="X"):
    o = cylinder(name, r, w, loc, mat, parent, axis=axis, verts=32, bevel=min(0.006, w / 3))
    return o


def sticker(tag, kind, parent, loc, rot_z=0.0, size=0.07):
    """MR label sticker on an item: white backing with the mark (ASTM F2503 style, simplified)."""
    a = anchor(f"Lbl_{tag}", (0, 0, 0), 0.0, parent)
    a.location = loc; a.rotation_euler = (0, 0, rot_z)
    plate(f"Lbl_{tag}_plate", size * 1.15, size * 1.15, WHITE, a, t=0.0015, r=0.003)
    if kind == "unsafe": mr_unsafe(f"Lbl_{tag}_m", 0, 0, size * 0.45, a)
    elif kind == "conditional": mr_conditional(f"Lbl_{tag}_m", 0, -size * 0.04, size * 0.9, a)
    else: mr_safe(f"Lbl_{tag}_m", 0, 0, size * 0.8, a)
    return a


# --- oxygen cylinder on a steel trolley (no MR labelling: status unknown) ---------------------
o2 = item("o2", 1.35, -6.15)
cylinder("O2_cylinder", 0.09, 0.88, (0, 0, 0.56), white_paint, o2, verts=40, bevel=0.03)
cylinder("O2_shoulder", 0.075, 0.06, (0, 0, 1.03), white_paint, o2, verts=40, bevel=0.02)
cylinder("O2_valve", 0.028, 0.10, (0, 0, 1.11), chrome, o2, verts=24, bevel=0.004)
cylinder("O2_gauge", 0.032, 0.02, (0.04, 0, 1.12), chrome, o2, axis="X", verts=32, bevel=0.003)
cylinder("O2_gauge_face", 0.026, 0.004, (0.051, 0, 1.12), bpy.data.materials["Sign_White"], o2, axis="X", verts=32)
for s in (-1, 1):
    tube_between(f"O2_trolley_rail_{s}", (s * 0.11, -0.10, 0.12), (s * 0.11, -0.04, 1.0), 0.011, steel, o2)
    wheel(f"O2_trolley_wheel_{s}", 0.075, 0.035, (s * 0.13, -0.10, 0.075), rubber, o2)
tube_between("O2_trolley_handle", (-0.11, -0.04, 1.0), (0.11, -0.04, 1.0), 0.011, steel, o2)
tube_between("O2_trolley_axle", (-0.13, -0.10, 0.075), (0.13, -0.10, 0.075), 0.008, steel, o2)
rounded_box("O2_trolley_base", (0.24, 0.24, 0.02), (0, 0.0, 0.12), 0.005, steel, o2)
for z in (0.4, 0.85):
    tube_between(f"O2_strap_{z}", (-0.10, 0.02, z), (0.10, 0.02, z), 0.006, dark, o2)

# --- transport wheelchair (labelled MR Unsafe) -------------------------------------------------
wc = item("wheelchair", 2.2, -6.25, math.radians(-15))
for s in (-1, 1):
    wheel(f"WC_wheel_{s}", 0.30, 0.03, (s * 0.31, -0.08, 0.30), rubber, wc)
    wheel(f"WC_rim_{s}", 0.27, 0.012, (s * 0.335, -0.08, 0.30), chrome, wc)
    cylinder(f"WC_hub_{s}", 0.035, 0.05, (s * 0.31, -0.08, 0.30), chrome, wc, axis="X", verts=20)
    for k in range(6):                                                              # spokes
        a = k * math.pi / 3
        tube_between(f"WC_spoke_{s}_{k}", (s * 0.31, -0.08, 0.30), (s * 0.31, -0.08 + 0.27 * math.cos(a), 0.30 + 0.27 * math.sin(a)), 0.003, chrome, wc)
    wheel(f"WC_caster_{s}", 0.065, 0.03, (s * 0.24, 0.40, 0.065), rubber, wc)
    tube_between(f"WC_frame_side_{s}", (s * 0.24, 0.40, 0.14), (s * 0.24, -0.10, 0.50), 0.013, steel, wc)
    tube_between(f"WC_frame_back_{s}", (s * 0.24, -0.12, 0.30), (s * 0.24, -0.20, 0.98), 0.013, steel, wc)
    tube_between(f"WC_handle_{s}", (s * 0.24, -0.20, 0.98), (s * 0.24, -0.33, 0.98), 0.016, rubber, wc)
    tube_between(f"WC_arm_{s}", (s * 0.25, 0.25, 0.70), (s * 0.25, -0.12, 0.70), 0.012, steel, wc)
    rounded_box(f"WC_armpad_{s}", (0.05, 0.28, 0.03), (s * 0.25, 0.08, 0.72), 0.01, fabric, wc)
    tube_between(f"WC_arm_post_{s}", (s * 0.25, 0.22, 0.50), (s * 0.25, 0.22, 0.70), 0.01, steel, wc)
    tube_between(f"WC_foot_post_{s}", (s * 0.19, 0.38, 0.30), (s * 0.18, 0.52, 0.10), 0.011, steel, wc)
    rounded_box(f"WC_footplate_{s}", (0.14, 0.10, 0.012), (s * 0.12, 0.54, 0.09), 0.004, dark, wc)
rounded_box("WC_seat", (0.44, 0.42, 0.03), (0, 0.10, 0.50), 0.012, fabric, wc)
rounded_box("WC_back", (0.44, 0.025, 0.40), (0, -0.17, 0.78), 0.01, fabric, wc)
tube_between("WC_crossbar", (-0.24, 0.10, 0.48), (0.24, 0.10, 0.48), 0.01, steel, wc)
sticker("wheelchair", "unsafe", wc, (0.0, -0.186, 0.88), 0.0)       # on the back of the backrest, facing out

# --- IV pole (labelled MR Conditional): five-leg base on casters, four hooks ---------------------
iv = item("ivpole", 0.20, -5.40)
for k in range(5):
    a = k * 2 * math.pi / 5
    tube_between(f"IV_leg_{k}", (0, 0, 0.09), (0.28 * math.cos(a), 0.28 * math.sin(a), 0.06), 0.012, grey_plastic, iv)
    wheel(f"IV_caster_{k}", 0.03, 0.02, (0.28 * math.cos(a), 0.28 * math.sin(a), 0.03), rubber, iv, axis="Y")
cylinder("IV_hub", 0.035, 0.08, (0, 0, 0.10), grey_plastic, iv, verts=24, bevel=0.006)
cylinder("IV_pole", 0.0125, 1.85, (0, 0, 1.05), chrome, iv, verts=20)
cylinder("IV_collar", 0.02, 0.05, (0, 0, 1.25), grey_plastic, iv, verts=20, bevel=0.004)
for k in range(4):
    a = k * math.pi / 2
    tube_between(f"IV_hook_{k}", (0, 0, 1.96), (0.11 * math.cos(a), 0.11 * math.sin(a), 1.99), 0.005, chrome, iv)
    cylinder(f"IV_hook_tip_{k}", 0.006, 0.03, (0.115 * math.cos(a), 0.115 * math.sin(a), 2.0), chrome, iv, verts=12)
sticker("ivpole", "conditional", iv, (0.0, -0.0135, 1.38), 0.0, size=0.06)

# --- foam positioning pads (labelled MR Safe) ------------------------------------------------
pads = item("pads", 1.70, -5.15)
rounded_box("Pad_block", (0.42, 0.26, 0.09), (0, 0, 0.535), 0.025, foam, pads, segments=5)
wedge = rounded_box("Pad_wedge", (0.30, 0.22, 0.14), (0.02, 0.0, 0.65), 0.03, foam, pads, segments=5)
wedge.rotation_euler = (0, math.radians(18), 0)
rounded_box("Pad_roll", (0.38, 0.12, 0.10), (0.0, 0.0, 0.76), 0.045, foam, pads, segments=6)
sticker("pads", "safe", pads, (0.0, -0.131, 0.535), 0.0, size=0.05)

# --- infusion pump on a small stand (no MR labelling found: status unknown) ---------------------
pump = item("pump", 2.45, -5.15)
rounded_box("Pump_body", (0.22, 0.14, 0.26), (0, 0, 0.62), 0.015, grey_plastic, pump)
rounded_box("Pump_screen", (0.15, 0.004, 0.07), (0, -0.071, 0.69), 0.004, lcd, pump)
for k in range(6):
    rounded_box(f"Pump_key_{k}", (0.03, 0.006, 0.02), (-0.05 + (k % 3) * 0.05, -0.072, 0.60 - (k // 3) * 0.035), 0.004, white_paint, pump)
rounded_box("Pump_door", (0.20, 0.006, 0.07), (0, -0.072, 0.53), 0.005, white_paint, pump)
rounded_box("Pump_clamp", (0.05, 0.08, 0.06), (0.0, 0.09, 0.66), 0.006, steel, pump)
print("zones + equipment ok")
