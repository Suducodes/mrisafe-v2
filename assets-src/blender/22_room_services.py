"""Room services: quench vent line (bellows, reducer, clad pipe, elbow, cage exit), cold-head
helium hoses, ceiling-void ducts through honeycomb waveguide vents, diffusers, exhaust grille,
and the DC LED ceiling panels that light the room (replacing the studio stand-in lights)."""
import bpy, math
from mathutils import Vector
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\helpers.py").read())
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\room_dims.py").read())
TARGET = "Room"

svc = layer("room_services")
fin = layer("room_finish")
cage = layer("rf_cage")
steel = bpy.data.materials["OVC_Stainless"]
copper = bpy.data.materials["Cage_Copper"]
clad = material("Quench_Cladding_Al", (0.80, 0.81, 0.82), 1.0, 0.38)
braid = material("Hose_Braid_SS", (0.62, 0.63, 0.64), 1.0, 0.55)
galv = material("Duct_Galvanised", (0.66, 0.68, 0.69), 1.0, 0.48)
trim = bpy.data.materials["Ceiling_TBar"]
dark = bpy.data.materials["Device_Black"]


def tube(name, pts, r, mat, parent, res=3, smooth_path=False):
    """Tube along a path (curve with bevel), converted to mesh for export.
    smooth_path: NURBS through the points (hoses); otherwise a polyline (pre-filleted pipes)."""
    replace(name)
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"
    cu.bevel_depth = r; cu.bevel_resolution = res; cu.use_fill_caps = True; cu.resolution_u = 10
    sp = cu.splines.new("NURBS" if smooth_path else "POLY"); sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts):
        p.co = (*c, 1)
    if smooth_path:
        sp.order_u = 3; sp.use_endpoint_u = True
    o = bpy.data.objects.new(name, cu); coll().objects.link(o)
    with bpy.context.temp_override(selected_objects=[o], selected_editable_objects=[o], active_object=o, object=o):
        bpy.ops.object.convert(target="MESH")
    o = bpy.data.objects[name]; o.data.materials.append(mat); o.parent = parent
    for f in o.data.polygons:
        f.use_smooth = True
    return o


def bend(p0, corner, p1, radius, n=10):
    """Fillet a polyline corner: points from `radius` before the corner to `radius` after it,
    on the quadratic Bezier controlled by the corner (tangent-continuous with both legs)."""
    a, c, b = Vector(p0), Vector(corner), Vector(p1)
    t0, t1 = c + (a - c).normalized() * radius, c + (b - c).normalized() * radius
    return [tuple((1 - u) ** 2 * t0 + 2 * (1 - u) * u * c + u * u * t1) for u in (k / n for k in range(n + 1))]


# --- quench vent line ------------------------------------------------------------------------
Z_FLANGE = 2.395                      # top of Quench_flange on the turret
Z_RUN = 3.22                          # horizontal run in the ceiling void (cage top is 3.45)
R_PIPE = 0.16                         # 250 mm pipe + lagging + aluminium cladding
ZB1 = 2.72                            # top of the bellows
# flexible bellows: corrugated stainless takes up magnet movement and thermal contraction
pitch = 0.014
crests = [(0.086 if k % 2 == 0 else 0.096, k * pitch / 2) for k in range(int((ZB1 - Z_FLANGE) / (pitch / 2)))]
bel = lathe("Quench_bellows", crests + [(0.078, crests[-1][1]), (0.078, 0.0)], steel, svc, segs=48)
restand(bel, QX, QY, Z_FLANGE)
cylinder("Quench_bellows_flange", 0.12, 0.02, (QX, QY, ZB1 + 0.01), steel, svc, verts=48, bevel=0.003)
red = lathe("Quench_reducer", [(0.09, 0.0), (R_PIPE, 0.12), (R_PIPE - 0.01, 0.12), (0.08, 0.0)], clad, svc, segs=48)
restand(red, QX, QY, ZB1 + 0.02)
z_pipe0 = ZB1 + 0.14
corner, exit_pt = (QX, QY, Z_RUN), (QX, CY1 + 0.35, Z_RUN)
tube("Quench_pipe", [(QX, QY, z_pipe0)] + bend((QX, QY, z_pipe0), corner, exit_pt, 0.34, 12) + [exit_pt], R_PIPE, clad, svc, res=5)
# cladding straps (one on the riser, three on the run), ceiling collar, cage waveguide sleeve
restand(lathe("Quench_strap_0", ring(R_PIPE, R_PIPE + 0.006, -0.012, 0.012), steel, svc, segs=48), QX, QY, 2.80)
for i, y in enumerate((0.95, 1.55, 2.05), start=1):
    s = lathe(f"Quench_strap_{i}", ring(R_PIPE, R_PIPE + 0.006, -0.012, 0.012), steel, svc, segs=48)
    s.location = (QX, y, Z_RUN - ISO)
restand(lathe("Ceiling_collar_quench", ring(R_PIPE + 0.005, 0.215, 0.0, 0.012), trim, fin, segs=48), QX, QY, HC - 0.012)
sleeve = lathe("Quench_cage_sleeve", ring(R_PIPE + 0.004, R_PIPE + 0.02, -0.10, 0.10), copper, cage, segs=48)
sleeve.location = (QX, CY1, Z_RUN - ISO)
box("Quench_cage_plate", (0.50, 0.006, 0.50), (QX, CY1 - 0.004, Z_RUN), copper, cage)

# --- helium hoses: coupling -> through the turret grommet -> sagging loop -> ceiling -> void --
for i, y0 in enumerate((0.29, 0.335)):                 # coupling positions from 11_cover_panels_turret
    z_run = 3.06 + 0.04 * i
    pts = [(0.145, y0, 2.29), (0.15, y0, 2.40), (0.20, y0, 2.52), (0.19, y0, 2.72), (HX, y0, 2.88), (HX, y0, HC + 0.05)]
    pts += bend((HX, y0, HC + 0.05), (HX, y0, z_run), (HX, CY1 + 0.2, z_run), 0.15, 6) + [(HX, CY1 + 0.2, z_run)]
    tube(f"He_hose_{'supply' if i == 0 else 'return'}", pts, 0.016, braid, svc, res=2, smooth_path=True)
cylinder("Turret_hose_grommet", 0.05, 0.012, (0.15, 0.3125, 2.372), dark, svc, verts=32, bevel=0.003)
restand(lathe("Ceiling_collar_hoses", ring(0.07, 0.11, 0.0, 0.012), trim, fin, segs=32), HX, HY + 0.02, HC - 0.012)

# --- ducts in the ceiling void, entering through honeycomb waveguide vents in the east cage wall
def duct(name, y, w, h, x_end, z):
    box(name, (CX1 - x_end, w, h), ((CX1 + x_end) / 2, y, z), galv, svc)
    cells, p = [], 0.014     # square cells, 50 mm deep: depth >> width cuts RF off by geometry
    cells += [((0.05, 0.0015, h), (CX1, y - w / 2 + k * p, z)) for k in range(int(w / p) + 1)]
    cells += [((0.05, w, 0.0015), (CX1, y, z - h / 2 + k * p)) for k in range(int(h / p) + 1)]
    merged_boxes(name + "_honeycomb", cells, copper, cage)
    merged_boxes(name + "_vent_frame", [((0.06, w + 0.06, 0.03), (CX1, y, z + h / 2 + 0.015)), ((0.06, w + 0.06, 0.03), (CX1, y, z - h / 2 - 0.015)),
                                         ((0.06, 0.03, h), (CX1, y - w / 2 - 0.015, z)), ((0.06, 0.03, h), (CX1, y + w / 2 + 0.015, z))], copper, cage)
duct("Duct_supply", -2.60, 0.40, 0.25, -1.50, 3.20)
duct("Duct_exhaust", 1.00, 0.45, 0.25, 0.90, 3.18)
for i, (x, y) in enumerate(((-1.5, -2.60), (1.5, -2.60), (0.9, 1.00))):     # drops to diffusers and the exhaust grille
    box(f"Duct_drop_{i}", (0.30, 0.30, 0.16), (x, y, HC + 0.10), galv, svc)

def diffuser(name, x, y):
    items = [((0.594, 0.594, 0.01), (x, y, HC - 0.005))]
    for k, s in enumerate((0.50, 0.40, 0.30, 0.20)):          # stepped concentric louvres
        t, z = 0.012, HC - 0.012 - 0.006 * k
        items += [((s, t, 0.012), (x, y - s / 2, z)), ((s, t, 0.012), (x, y + s / 2, z)),
                  ((t, s, 0.012), (x - s / 2, y, z)), ((t, s, 0.012), (x + s / 2, y, z))]
    items.append(((0.10, 0.10, 0.02), (x, y, HC - 0.04)))
    merged_boxes(name, items, trim, fin)
diffuser("Diffuser_A", -1.5, -2.6)
diffuser("Diffuser_B", 1.5, -2.6)
merged_boxes("Exhaust_grille", [((0.594, 0.594, 0.01), (0.9, 1.0, HC - 0.005))] +
             [((0.56, 0.012, 0.03), (0.9, 0.73 + k * 0.03, HC - 0.02)) for k in range(19)], trim, fin)

# --- DC LED panels (1200 x 600, two tiles) and the area lights they cast --------------------
for nm in ("Ceiling_panel_A", "Ceiling_panel_B", "Key_soft", "Fill_cool", "Key", "Fill", "Rim"):
    replace(nm)
led_m = material("LED_Panel_Diffuser", (0.95, 0.95, 0.93), 0.0, 0.5, emit=(1.0, 0.96, 0.90), emit_strength=6.0)
for i, (x, y) in enumerate([(-1.2, -3.2), (1.2, -3.2), (-1.2, -1.4), (1.2, -1.4), (-1.2, 0.4), (1.2, 0.4)]):
    box(f"LED_panel_{i}_frame", (1.20, 0.60, 0.012), (x, y, HC - 0.006), trim, fin)
    box(f"LED_panel_{i}", (1.16, 0.56, 0.004), (x, y, HC - 0.013), led_m, fin)
    replace(f"LED_light_{i}")
    l = bpy.data.lights.new(f"LED_light_{i}", "AREA"); l.shape = "RECTANGLE"; l.size = 1.16; l.size_y = 0.56
    l.energy = 85; l.color = (1.0, 0.95, 0.88)
    o = bpy.data.objects.new(f"LED_light_{i}", l); coll().objects.link(o)
    o.location = (x, y, HC - 0.02); o.parent = fin             # area lights face -Z by default

bg = next(n for n in bpy.context.scene.world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs[1].default_value = 0.04     # interior: the room lights itself
print("services ok")
