"""Scanner core, inside out: bore liner, RF body coil (16-rung birdcage), RF shield, gradient
assembly (former, distributed Z winding, fingerprint X/Y saddles, 16 passive shim trays), and the
cryostat (vacuum vessel, 50 K shield, 4 K helium vessel) around the NbTi windings (6 primary
coils on a former + 2 counter-wound shield coils). True-scale radii for a 70 cm wide-bore 1.5 T.
Every object gets the quarter-section 'Cutaway' boolean (Blender preview only)."""
import bpy, math
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\helpers.py").read())

S = coll("Scanner")


def mat(name, base, metal=0.0, rough=0.5, coat=0.0):
    """Create once; later steps (13) tune some of these, so never overwrite an existing one."""
    return bpy.data.materials.get(name) or material(name, base, metal, rough, coat)


M = {
    "liner": mat("BoreLiner_GRP", (0.80, 0.81, 0.79), 0, 0.45),
    "rfcu": mat("RF_Copper", (0.93, 0.55, 0.38), 1, 0.25),
    "rfshield": mat("RFShield_CuMesh", (0.80, 0.50, 0.35), 1, 0.45),
    "grad": mat("Gradient_Epoxy", (0.18, 0.24, 0.21), 0, 0.35, coat=0.4),
    "shim": mat("Shim_Steel", (0.55, 0.56, 0.57), 1, 0.35),
    "ovc": mat("OVC_Stainless", (0.75, 0.75, 0.74), 1, 0.22),
    "tshield": mat("ThermalShield_Al", (0.91, 0.92, 0.92), 1, 0.15),
    "hevessel": mat("HeVessel_Stainless", (0.70, 0.70, 0.70), 1, 0.30),
    "nbti": mat("NbTi_Winding", (0.78, 0.45, 0.25), 1, 0.38),
    "former": mat("CoilFormer_Al", (0.62, 0.63, 0.64), 1, 0.4),
}

# quarter-section cutter shared by every preview cutaway
cut = bpy.data.objects.get("_cut_quarter")
if cut is None:
    cut = box("_cut_quarter", (1.5, 2.2, 1.5), (0.75, 0, ISO + 0.75), None)
    for c in list(cut.users_collection):
        c.objects.unlink(cut)
    bpy.context.scene.collection.objects.link(cut)
cut.display_type = "WIRE"; cut.hide_render = True


def shell(name, rin, rout, half, wall, chamfer, m, parent):
    """Thin-walled vessel: a closed annulus made hollow by an inward Solidify (a solid annulus
    would hide everything nested inside it in section)."""
    o = lathe(name, ring(rin, rout, -half, half, chamfer), m, parent)
    s = o.modifiers.new("Wall", "SOLIDIFY"); s.thickness = wall; s.offset = -1; s.use_even_offset = True
    return o


def wires(name, splines, r_wire, m, parent, cyclic=True):
    """Many wire paths as ONE curve -> one mesh (watertight: cyclic loops, or capped ends)."""
    replace(name)
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"
    cu.bevel_depth = r_wire; cu.bevel_resolution = 1; cu.use_fill_caps = True
    for pts in splines:
        sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
        for p, (x, y, z) in zip(sp.points, pts):
            p.co = (x, y, z, 1)
        sp.use_cyclic_u = cyclic
    o = bpy.data.objects.new(name, cu); S.objects.link(o)
    with bpy.context.temp_override(selected_objects=[o], selected_editable_objects=[o], active_object=o, object=o):
        bpy.ops.object.convert(target="MESH")
    o = bpy.data.objects[name]; o.data.materials.append(m); o.parent = parent
    # fill caps are built from their own vertices; weld them to the tube ends so the mesh is
    # watertight (the EXACT cutaway boolean inverts on open meshes)
    import bmesh
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.to_mesh(o.data); bm.free()
    return o


# --- cryostat: nested thin shells (radii m, half-lengths m) ------------------------------------
shell("OVC_vacuum_vessel", 0.480, 1.000, 0.800, 0.015, 0.03, M["ovc"], layer("cryostat"))          # room temperature
shell("Thermal_shield_50K", 0.500, 0.975, 0.775, 0.006, 0.02, M["tshield"], layer("thermal_shield"))
shell("He_vessel_4K", 0.520, 0.950, 0.750, 0.012, 0.02, M["hevessel"], layer("he_vessel"))

# --- NbTi windings: 6 primary coils on a former, 2 counter-wound shield coils ------------------
lw = layer("windings")
lathe("Primary_former", ring(0.545, 0.555, -0.72, 0.72), M["former"], lw)
for k, (yc, w, t) in enumerate([(0.10, 0.06, 0.040), (0.37, 0.09, 0.050), (0.64, 0.12, 0.070)]):   # centre, width, build
    for s, tag in ((1, "A"), (-1, "B")):
        lathe(f"Primary_coil_{k + 1}{tag}", ring(0.556, 0.556 + t, s * yc - w / 2, s * yc + w / 2, 0.004), M["nbti"], lw)
for s, tag in ((1, "A"), (-1, "B")):
    lathe(f"Shield_coil_{tag}", ring(0.860, 0.910, s * 0.56 - 0.07, s * 0.56 + 0.07, 0.004), M["nbti"], lw)

# --- passive shim trays: 16 steel pockets in the gradient former, r ~0.43 ----------------------
lsh = layer("shims")
for i in range(16):
    a = 2 * math.pi * (i + 0.5) / 16
    o = box(f"Shim_tray_{i + 1:02d}", (0.05, 1.30, 0.012), (0.432 * math.cos(a), 0, 0.432 * math.sin(a) + ISO), M["shim"], lsh)
    o.rotation_euler = (0, -a + math.pi / 2, 0)

# --- gradient assembly -----------------------------------------------------------------------
lg = layer("gradient")
lathe("Gradient_former_epoxy", ring(0.386, 0.470, -0.70, 0.70), M["grad"], lg)
# Z: distributed turns, opposite sense in each half, spacing tightening toward the ends
z_turns = []
for s in (1, -1):
    for k in range(10):
        y = s * (0.06 + 0.60 * (k / 9) ** 0.8)
        z_turns.append([(0.389 * math.cos(2 * math.pi * t / 96), y, 0.389 * math.sin(2 * math.pi * t / 96) + ISO) for t in range(96)])
wires("Gradient_Z_coil", z_turns, 0.0028, M["rfcu"], lg)


def fingerprint(phi0, rr):
    """X/Y saddles: four quadrants of nested squared-off loops wrapped on the cylinder."""
    loops = []
    for pc, yc in [(phi0, 0.32), (phi0, -0.32), (phi0 + math.pi, 0.32), (phi0 + math.pi, -0.32)]:
        for k in range(7):
            ah, yh = 0.18 + 0.11 * k, 0.035 + 0.040 * k          # half-width (rad), half-height (m)
            pts = []
            for t in range(120):
                u = 2 * math.pi * t / 120
                cx = math.copysign(abs(math.cos(u)) ** 0.45, math.cos(u))
                cy = math.copysign(abs(math.sin(u)) ** 0.45, math.sin(u))
                phi, y = pc + ah * cx, yc + yh * cy
                pts.append((rr * math.cos(phi), y, rr * math.sin(phi) + ISO))
            loops.append(pts)
    return loops
wires("Gradient_X_saddles", fingerprint(0.0, 0.395), 0.0024, M["rfcu"], lg)
wires("Gradient_Y_saddles", fingerprint(math.pi / 2, 0.401), 0.0024, M["rfcu"], lg)

# --- RF shield, birdcage body coil, liner ------------------------------------------------------
lathe("RF_shield_mesh", ring(0.378, 0.381, -0.66, 0.66), M["rfshield"], layer("rf_shield"))
lrf = layer("rf_body_coil")
for s, tag in ((1, "A"), (-1, "B")):
    lathe(f"Birdcage_endring_{tag}", ring(0.364, 0.368, s * 0.30 - 0.02, s * 0.30 + 0.02), M["rfcu"], lrf)
rungs = [[(0.366 * math.cos(a), -0.30, 0.366 * math.sin(a) + ISO), (0.366 * math.cos(a), 0.30, 0.366 * math.sin(a) + ISO)]
         for a in (2 * math.pi * i / 16 for i in range(16))]
wires("Birdcage_rungs", rungs, 0.006, M["rfcu"], lrf, cyclic=False)
# liner spans flare-to-flare (the shroud is open at the bore), 2 mm joint at each flare lip
lathe("Bore_liner", ring(0.352, 0.360, -0.700, 0.700), M["liner"], layer("liner"))

stack_layers = {"cryostat", "thermal_shield", "he_vessel", "windings", "shims", "gradient", "rf_shield", "rf_body_coil", "liner"}
for o in S.objects:
    if o.type == "MESH" and o.parent is not None and o.parent.name[2:] in stack_layers and "Cutaway" not in o.modifiers:
        m = o.modifiers.new("Cutaway", "BOOLEAN"); m.object = cut; m.solver = "EXACT"
cutaway(False)
print("stack ok")
