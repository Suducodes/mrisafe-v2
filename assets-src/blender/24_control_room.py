"""Control room (Zone III) behind the RF window: partition, floor, walls, ceiling, operator desk
with console monitors below the window line, chair, and its own warmer, dimmer lighting.
Also places the cold-open camera (behind the operator, looking through the glass)."""
import bpy, math
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\helpers.py").read())
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\room_dims.py").read())
TARGET = "Room"

ctrl = layer("control_room")
paint = material("Ctrl_Wall_Paint", (0.70, 0.70, 0.67), 0.0, 0.8)
floor_m = material("Ctrl_Floor_Vinyl", (0.36, 0.36, 0.35), 0.0, 0.45, coat=0.1)
ceil_m = material("Ctrl_Ceiling", (0.84, 0.84, 0.82), 0.0, 0.9)
desk_m = material("Desk_Laminate_Oak", (0.55, 0.42, 0.30), 0.0, 0.42, coat=0.15)
desk_edge = material("Desk_Edge", (0.16, 0.16, 0.17), 0.0, 0.5)
bezel = material("Monitor_Bezel", (0.025, 0.025, 0.028), 0.0, 0.35)
# near-black glossy glass with a faint glow; the engine will draw the live console UI onto these
screen = material("Console_Screen", (0.01, 0.012, 0.016), 0.0, 0.08, coat=1.0,
                  emit=(0.10, 0.14, 0.18), emit_strength=0.25)
fabric = material("Chair_Fabric", (0.12, 0.13, 0.15), 0.0, 0.9)
alu = bpy.data.materials["CoilFormer_Al"]
frame_m = bpy.data.materials["Frame_PowderCoat"]

PX0, PX1 = CX0 - 0.165, CX0 - 0.015          # partition (control-room side of the cage), matches window reveal
CY_0, CY_1 = -4.40, 0.40                      # control room extent along Y
CH_ = 2.70                                    # control room ceiling
xm = (PX0 + CTRL_X) / 2

box("Ctrl_floor", (PX0 - CTRL_X, CY_1 - CY_0, 0.10), (xm, (CY_0 + CY_1) / 2, -0.05), floor_m, ctrl)
box("Ctrl_ceiling", (PX0 - CTRL_X, CY_1 - CY_0, 0.02), (xm, (CY_0 + CY_1) / 2, CH_ + 0.01), ceil_m, ctrl)
part = box("Ctrl_partition", (PX1 - PX0, CY_1 - CY_0, CH_), ((PX0 + PX1) / 2, (CY_0 + CY_1) / 2, CH_ / 2), paint, ctrl)
cut = box("_cut_ctrl_window", (0.6, WIN["y1"] - WIN["y0"], WIN["z1"] - WIN["z0"]),
          ((PX0 + PX1) / 2, (WIN["y0"] + WIN["y1"]) / 2, (WIN["z0"] + WIN["z1"]) / 2), None)
cut_openings(part, [cut])
box("Ctrl_wall_back", (0.12, CY_1 - CY_0, CH_), (CTRL_X - 0.06, (CY_0 + CY_1) / 2, CH_ / 2), paint, ctrl)
box("Ctrl_wall_front", (PX0 - CTRL_X, 0.12, CH_), (xm, CY_0 - 0.06, CH_ / 2), paint, ctrl)
box("Ctrl_wall_side", (PX0 - CTRL_X, 0.12, CH_), (xm, CY_1 + 0.06, CH_ / 2), paint, ctrl)
# control-room face of the window: a sill and architrave
merged_boxes("Ctrl_window_frame", [((0.03, WIN["y1"] - WIN["y0"] + 0.12, 0.06), (PX0 - 0.015, (WIN["y0"] + WIN["y1"]) / 2, WIN["z1"] + 0.03)),
                                   ((0.03, 0.06, WIN["z1"] - WIN["z0"]), (PX0 - 0.015, WIN["y0"] - 0.03, (WIN["z0"] + WIN["z1"]) / 2)),
                                   ((0.03, 0.06, WIN["z1"] - WIN["z0"]), (PX0 - 0.015, WIN["y1"] + 0.03, (WIN["z0"] + WIN["z1"]) / 2))], frame_m, ctrl)
box("Ctrl_window_sill", (0.12, WIN["y1"] - WIN["y0"] + 0.12, 0.025), (PX0 - 0.06, (WIN["y0"] + WIN["y1"]) / 2, WIN["z0"] - 0.0125), frame_m, ctrl)

# --- operator desk along the window wall ----------------------------------------------------
DZ, DD = 0.74, 0.78                          # desk height, depth
dy0, dy1 = -3.40, -0.40
dxc = PX0 - DD / 2
box("Desk_top", (DD, dy1 - dy0, 0.03), (dxc, (dy0 + dy1) / 2, DZ - 0.015), desk_m, ctrl)
box("Desk_edge_band", (0.004, dy1 - dy0, 0.03), (PX0 - DD - 0.002, (dy0 + dy1) / 2, DZ - 0.015), desk_edge, ctrl)
box("Desk_modesty", (0.02, dy1 - dy0 - 0.1, 0.45), (PX0 - 0.08, (dy0 + dy1) / 2, DZ - 0.27), desk_edge, ctrl)
for i, y in enumerate((dy0 + 0.04, dy1 - 0.04)):
    box(f"Desk_leg_{i}", (DD - 0.04, 0.04, DZ - 0.03), (dxc, y, (DZ - 0.03) / 2), desk_edge, ctrl)

# --- console monitors (screens face the operator, -X; tops stay below sight line to the bore) --
def monitor(tag, y, w=0.62, h=0.37, yaw=0.0, x=PX0 - 0.26):
    a = bpy.data.objects.get(tag) or bpy.data.objects.new(tag, None)
    if a.name not in coll().objects:
        coll().objects.link(a)
    a.parent = ctrl; a.location = (x, y, DZ); a.rotation_euler = (0, 0, yaw); a.empty_display_size = 0.05
    rounded_box(f"{tag}_body", (0.025, w, h), (0, 0, 0.13 + h / 2), 0.006, bezel, a)
    box(f"{tag}_screen", (0.002, w - 0.02, h - 0.02), (-0.0135, 0, 0.13 + h / 2), screen, a)
    rounded_box(f"{tag}_neck", (0.03, 0.06, 0.13), (0.03, 0, 0.065), 0.006, alu, a)
    rounded_box(f"{tag}_foot", (0.20, 0.24, 0.012), (0.03, 0, 0.006), 0.004, alu, a)
monitor("Mon_console_L", -2.25, yaw=math.radians(8))
monitor("Mon_console_R", -1.55, yaw=math.radians(-8))
monitor("Mon_monitoring", -0.85, w=0.42, h=0.27, yaw=math.radians(-16))   # patient monitoring / camera feed
rounded_box("Keyboard", (0.15, 0.44, 0.018), (PX0 - 0.55, -1.90, DZ + 0.009), 0.005, bezel, ctrl)
rounded_box("Mouse", (0.10, 0.06, 0.03), (PX0 - 0.55, -1.52, DZ + 0.015), 0.012, bezel, ctrl)
# intercom with gooseneck mic: the operator's only voice link into the bore
rounded_box("Intercom_base", (0.16, 0.12, 0.04), (PX0 - 0.30, -2.85, DZ + 0.02), 0.01, bezel, ctrl)
cylinder("Intercom_neck", 0.005, 0.24, (PX0 - 0.30, -2.85, DZ + 0.16), alu, ctrl, verts=12)

# --- operator chair -----------------------------------------------------------------------
cx_, cy_ = PX0 - 1.05, -1.90
chair = bpy.data.objects.get("Chair") or bpy.data.objects.new("Chair", None)
if chair.name not in coll().objects:
    coll().objects.link(chair)
chair.parent = ctrl; chair.location = (cx_, cy_, 0); chair.rotation_euler = (0, 0, math.radians(-6))
rounded_box("Chair_seat", (0.48, 0.48, 0.08), (0, 0, 0.47), 0.03, fabric, chair, segments=5)
rounded_box("Chair_back", (0.07, 0.44, 0.52), (-0.24, 0, 0.82), 0.03, fabric, chair, segments=5)
rounded_box("Chair_spine", (0.04, 0.06, 0.34), (-0.22, 0, 0.58), 0.01, desk_edge, chair)
cylinder("Chair_column", 0.028, 0.34, (0, 0, 0.26), alu, chair, verts=24)
for k in range(5):
    a = 2 * math.pi * k / 5
    arm = rounded_box(f"Chair_leg_{k}", (0.30, 0.04, 0.03), (0.15 * math.cos(a), 0.15 * math.sin(a), 0.07), 0.01, desk_edge, chair)
    arm.rotation_euler = (0, 0, a)
    cylinder(f"Chair_castor_{k}", 0.025, 0.03, (0.29 * math.cos(a), 0.29 * math.sin(a), 0.03), desk_edge, chair, axis="X", verts=16)

# --- lighting: two warm downlight panels, dimmer than the magnet room ------------------------
for i, y in enumerate((-2.9, -1.0)):
    box(f"Ctrl_light_{i}_panel", (0.60, 0.60, 0.01), (xm, y, CH_ - 0.005),
        material("Ctrl_LED", (0.95, 0.94, 0.90), 0.0, 0.5, emit=(1.0, 0.90, 0.78), emit_strength=3.0), ctrl)
    replace(f"Ctrl_light_{i}")
    l = bpy.data.lights.new(f"Ctrl_light_{i}", "AREA"); l.shape = "SQUARE"; l.size = 0.58
    l.energy = 45; l.color = (1.0, 0.88, 0.74)
    o = bpy.data.objects.new(f"Ctrl_light_{i}", l); coll().objects.link(o)
    o.location = (xm, y, CH_ - 0.015); o.parent = ctrl

# --- cold-open camera: behind the operator, eye height, looking through the glass ------------
cam = bpy.data.objects.get("ColdOpen_cam")
if cam is None:
    cam = bpy.data.objects.new("ColdOpen_cam", bpy.data.cameras.new("ColdOpen_cam"))
    bpy.context.scene.collection.objects.link(cam)
cam.data.lens = 26
cam.location = (PX0 - 2.30, -2.05, 1.70)
aim(cam, (0.30, -0.80, 1.18))
print("control room ok")
