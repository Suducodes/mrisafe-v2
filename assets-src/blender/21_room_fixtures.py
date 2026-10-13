"""Room fixtures that belong to the RF envelope or the walls: RF window, RF door with finger
stock, penetration (filter) panel with waveguides, magnet-stop button, O2 sensor, CCTV."""
import bpy, math
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\helpers.py").read())
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\room_dims.py").read())
TARGET = "Room"

fix = layer("room_fixtures")
cage = layer("rf_cage")
steel = bpy.data.materials["OVC_Stainless"]
copper = bpy.data.materials["Cage_Copper"]
paint = bpy.data.materials["Wall_Paint"]
frame_m = material("Frame_PowderCoat", (0.84, 0.85, 0.84), 0.0, 0.5)
# thin-glass model (alpha-blended, reflective) rather than refraction: two stacked refracting panes
# defeat EEVEE's screen-space refraction, and glTF/three.js will treat it as blended glass anyway.
# The bronze tint stands in for the copper mesh laminated between the panes.
glass = material("RF_Window_Glass", (0.30, 0.27, 0.23), 0.0, 0.03, alpha=0.16)
gb = next(n for n in glass.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
gb.inputs["Transmission Weight"].default_value = 0.0; gb.inputs["IOR"].default_value = 1.52
glass.surface_render_method = "BLENDED"; glass.use_transparency_overlap = False
finger = material("FingerStock_BeCu", (0.88, 0.62, 0.36), 1.0, 0.28)
dark = material("Device_Black", (0.03, 0.03, 0.035), 0.0, 0.45)
red = bpy.data.materials["Button_Stop"]
clear = material("Clear_PC", (0.90, 0.90, 0.90), 0.0, 0.05, alpha=0.22)
next(n for n in clear.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Transmission Weight"].default_value = 0.0
clear.surface_render_method = "BLENDED"
led_g = bpy.data.materials["Panel_LED_ready"]

CYF, CYR = CY0, CY1          # cage lines, front and rear

# --- RF window ----------------------------------------------------------------------------
y0, y1, z0, z1 = WIN["y0"], WIN["y1"], WIN["z0"], WIN["z1"]
ym_, zm_ = (y0 + y1) / 2, (z0 + z1) / 2
depth = 0.30                  # through finished wall, cage and the control-room partition
xin = X0 - depth / 2 + 0.02
merged_boxes("Window_reveal", [((depth, y1 - y0, 0.02), (xin, ym_, z0 + 0.01)), ((depth, y1 - y0, 0.02), (xin, ym_, z1 - 0.01)),
                               ((depth, 0.02, z1 - z0), (xin, y0 + 0.01, zm_)), ((depth, 0.02, z1 - z0), (xin, y1 - 0.01, zm_))], frame_m, fix)
F = 0.06                       # room-side architrave face width
merged_boxes("Window_frame", [((0.025, y1 - y0 + 2 * F, F), (X0 + 0.0125, ym_, z0 - F / 2)), ((0.025, y1 - y0 + 2 * F, F), (X0 + 0.0125, ym_, z1 + F / 2)),
                              ((0.025, F, z1 - z0), (X0 + 0.0125, y0 - F / 2, zm_)), ((0.025, F, z1 - z0), (X0 + 0.0125, y1 + F / 2, zm_))], frame_m, fix)
# two laminated panes with the copper mesh between them; copper clamp ring bonds the mesh to the cage
box("Window_glass_room", (0.012, y1 - y0 - 0.04, z1 - z0 - 0.04), (CX0 + 0.02, ym_, zm_), glass, fix)
box("Window_glass_ctrl", (0.012, y1 - y0 - 0.04, z1 - z0 - 0.04), (CX0 - 0.05, ym_, zm_), glass, fix)
merged_boxes("Window_cage_clamp", [((0.03, y1 - y0, 0.03), (CX0, ym_, z0 + 0.035)), ((0.03, y1 - y0, 0.03), (CX0, ym_, z1 - 0.035)),
                                   ((0.03, 0.03, z1 - z0), (CX0, y0 + 0.035, zm_)), ((0.03, 0.03, z1 - z0), (CX0, y1 - 0.035, zm_))], copper, cage)

# --- RF door (closed): stainless lined opening, finger stock at the cage line, leaf outside ---
dx0, dx1, dz1 = DOOR["x0"], DOOR["x1"], DOOR["z1"]
dxm = (dx0 + dx1) / 2
merged_boxes("Door_lining", [((0.02, CAGE_OFF + 0.02, dz1), (dx0 + 0.01, Y0 - CAGE_OFF / 2, dz1 / 2)),
                             ((0.02, CAGE_OFF + 0.02, dz1), (dx1 - 0.01, Y0 - CAGE_OFF / 2, dz1 / 2)),
                             ((dx1 - dx0, CAGE_OFF + 0.02, 0.02), (dxm, Y0 - CAGE_OFF / 2, dz1 - 0.01))], steel, fix)
merged_boxes("Door_architrave", [((0.07, 0.022, dz1 + 0.07), (dx0 - 0.035, Y0 + 0.011, (dz1 + 0.07) / 2)),
                                 ((0.07, 0.022, dz1 + 0.07), (dx1 + 0.035, Y0 + 0.011, (dz1 + 0.07) / 2)),
                                 ((dx1 - dx0 + 0.14, 0.022, 0.07), (dxm, Y0 + 0.011, dz1 + 0.035))], frame_m, fix)
fingers = []
pitch, fw = 0.0075, 0.0045
for k in range(int(dz1 / pitch)):                                   # jambs
    z = 0.01 + k * pitch
    fingers += [((0.006, 0.012, fw), (dx0 + 0.024, CYF + 0.004, z)), ((0.006, 0.012, fw), (dx1 - 0.024, CYF + 0.004, z))]
for k in range(int((dx1 - dx0 - 0.05) / pitch)):                    # head
    fingers.append(((fw, 0.012, 0.006), (dx0 + 0.025 + k * pitch, CYF + 0.004, dz1 - 0.024)))
merged_boxes("Door_finger_stock", fingers, finger, cage)

# leaf seats on the cage frame from the corridor side (opens outward, away from quench overpressure)
leaf = rounded_box("Door_leaf", (dx1 - dx0 + 0.10, 0.08, dz1 + 0.05), (dxm, CYF - 0.041, (dz1 + 0.05) / 2), 0.006, paint, fix)
# room face: painted panel inside a stainless contact border (the border is what the finger stock bears on)
door_face = material("Door_Face_Paint", (0.83, 0.83, 0.81), 0.0, 0.6)
skin = box("Door_leaf_skin_in", (dx1 - dx0 - 0.04, 0.003, dz1 - 0.04), (dxm, CYF + 0.001, dz1 / 2), steel, fix)
face = box("Door_leaf_face", (dx1 - dx0 - 0.14, 0.002, dz1 - 0.14), (dxm, CYF + 0.0035, dz1 / 2), door_face, fix)
# vertical cam-lever handle on the room face, latch side, seated on the skin
rose = cylinder("Door_handle_rose", 0.03, 0.02, (dx1 - 0.12, CYF + 0.014, 1.05), steel, fix, axis="Y", verts=32, bevel=0.003)
lever = rounded_box("Door_handle_lever", (0.03, 0.03, 0.26), (dx1 - 0.12, CYF + 0.037, 0.95), 0.012, steel, fix)
hinge = bpy.data.objects.get("Door_pivot") or bpy.data.objects.new("Door_pivot", None)
if hinge.name not in coll().objects:
    coll().objects.link(hinge)
hinge.location = (dx0 - 0.05, CYF - 0.041, 0); hinge.parent = fix; hinge.empty_display_size = 0.15
bpy.context.view_layer.update()
for part in (leaf, skin, face, rose, lever):          # the engine swings everything on the leaf about this pivot
    part.parent = hinge; part.matrix_parent_inverse = hinge.matrix_world.inverted()

# --- penetration panel in the rear recess -------------------------------------------------
px0, px1, pz0, pz1 = PEN["x0"], PEN["x1"], PEN["z0"], PEN["z1"]
pxm, pzm = (px0 + px1) / 2, (pz0 + pz1) / 2
plate_y = CYR - 0.004
box("Pen_plate", (px1 - px0 - 0.02, 0.006, pz1 - pz0 - 0.02), (pxm, plate_y, pzm), steel, cage)
merged_boxes("Pen_recess_trim", [((px1 - px0 + 0.08, 0.02, 0.04), (pxm, Y1 - 0.01, pz0 - 0.02)), ((px1 - px0 + 0.08, 0.02, 0.04), (pxm, Y1 - 0.01, pz1 + 0.02)),
                                 ((0.04, 0.02, pz1 - pz0), (px0 - 0.02, Y1 - 0.01, pzm)), ((0.04, 0.02, pz1 - pz0), (px1 + 0.02, Y1 - 0.01, pzm))], frame_m, fix)
# signal feedthrough filters: two rows of six
for r_, z in enumerate((pz1 - 0.12, pz1 - 0.22)):
    for c_ in range(6):
        x = px0 + 0.10 + c_ * 0.10
        cylinder(f"Pen_filter_{r_}{c_}", 0.014, 0.05, (x, plate_y - 0.028, z), steel, cage, axis="Y", verts=24, bevel=0.002)
        cylinder(f"Pen_filter_{r_}{c_}_pin", 0.006, 0.02, (x, plate_y - 0.06, z), finger, cage, axis="Y", verts=16)
# mains filter boxes and waveguides (tube length >> bore: RF cut-off by geometry)
rounded_box("Pen_mains_filter_A", (0.16, 0.07, 0.10), (px0 + 0.16, plate_y - 0.04, pz0 + 0.17), 0.006, frame_m, cage)
rounded_box("Pen_mains_filter_B", (0.16, 0.07, 0.10), (px0 + 0.36, plate_y - 0.04, pz0 + 0.17), 0.006, frame_m, cage)
for i, (x, r) in enumerate(((px1 - 0.13, 0.032), (px1 - 0.05, 0.022))):
    wg = lathe(f"Pen_waveguide_{i}", ring(r - 0.003, r, 0.0, 0.14), copper, cage, segs=40)
    wg.location = (x, plate_y - 0.14, pz0 + 0.17 - ISO)     # lathe revolves about Y at ISO; shift into place

# --- magnet stop (emergency run-down) beside the door, under a flip cover -----------------
ms_x, ms_z = -0.35, 1.45
rounded_box("MagnetStop_plate", (0.16, 0.02, 0.24), (ms_x, Y0 + 0.01, ms_z), 0.006, material("Sign_Yellow", (0.95, 0.76, 0.06), 0.0, 0.45), fix)
cylinder("MagnetStop_button", 0.028, 0.03, (ms_x, Y0 + 0.035, ms_z - 0.02), red, fix, axis="Y", verts=40, bevel=0.006)
rounded_box("MagnetStop_cover", (0.11, 0.06, 0.11), (ms_x, Y0 + 0.05, ms_z - 0.02), 0.01, clear, fix)

# --- O2 monitor sensor (high, near the cryostat) and a CCTV camera --------------------------
rounded_box("O2_sensor", (0.11, 0.05, 0.16), (-1.0, Y1 - 0.025, 2.55), 0.008, frame_m, fix)
merged_boxes("O2_sensor_grille", [((0.07, 0.004, 0.004), (-1.0, Y1 - 0.051, 2.50 + k * 0.012)) for k in range(6)], dark, fix)
cylinder("O2_sensor_led", 0.004, 0.003, (-0.97, Y1 - 0.051, 2.60), led_g, fix, axis="Y", verts=16)
rounded_box("CCTV_bracket", (0.05, 0.05, 0.10), (X1 - 0.08, Y0 + 0.08, HC - 0.06), 0.006, frame_m, fix)
cam_body = cylinder("CCTV_body", 0.04, 0.16, (X1 - 0.13, Y0 + 0.13, HC - 0.13), frame_m, fix, axis="Y", verts=32, bevel=0.004)
cam_body.rotation_euler = (math.radians(70), 0, math.radians(35))
print("fixtures ok")
