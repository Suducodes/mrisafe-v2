"""Shared geometry helpers for the MRISafe v2 scanner build.

Conventions: metres, Blender Z up, bore axis along Blender Y, isocentre at (0, 0, ISO).
Front of the scanner (patient table side) is -Y.
Load inside Blender with: exec(open(HELPERS).read())
"""
import bpy, bmesh, math
from mathutils import Vector

ISO = 1.05
SEGS = 128
# shroud outline: superellipse half-width, half-height, exponent; D = half-depth along the bore
SHROUD_A, SHROUD_B, SHROUD_N, SHROUD_D = 1.12, 1.10, 4.2, 0.84


TARGET = "Scanner"      # collection new objects go into; room scripts set TARGET = "Room"


def coll(name=None):
    name = name or TARGET
    sc = bpy.context.scene
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in [x.name for x in sc.collection.children]:
        sc.collection.children.link(c)
    return c


def layer(name):
    """Get or create the L_<name> empty the engine peels by."""
    e = bpy.data.objects.get("L_" + name)
    if e is None:
        e = bpy.data.objects.new("L_" + name, None)
        coll().objects.link(e)
        e.empty_display_size = 0.2
    return e


def material(name, base, metal=0.0, rough=0.5, coat=0.0, emit=None, emit_strength=0.0, alpha=1.0, transmission=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*base, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Transmission Weight"].default_value = transmission
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
    m.diffuse_color = (*base, 1)
    return m


def _link(o, parent=None, mat=None):
    coll().objects.link(o)
    if mat is not None:
        o.data.materials.append(mat)
    if parent is not None:
        o.parent = parent
    return o


def replace(name):
    """Remove an existing object of this name so a step can be re-run cleanly."""
    o = bpy.data.objects.get(name)
    if o is not None:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and data.users == 0:      # don't leave Name.004 orphans behind
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Curve):
                bpy.data.curves.remove(data)
            elif isinstance(data, bpy.types.Light):
                bpy.data.lights.remove(data)


def lathe(name, prof, mat, parent=None, segs=SEGS, arc=(0.0, 2 * math.pi), closed_profile=True, smooth=True):
    """Revolve an (r, y) profile around the bore axis."""
    replace(name)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    full = abs(arc[1] - arc[0] - 2 * math.pi) < 1e-6
    count = segs if full else segs + 1
    rings = []
    for i in range(count):
        a = arc[0] + (arc[1] - arc[0]) * i / segs
        rings.append([bm.verts.new((r * math.cos(a), y, r * math.sin(a) + ISO)) for r, y in prof])
    n = len(prof)
    span = n if closed_profile else n - 1
    for i in range(segs):
        A, B = rings[i], rings[(i + 1) % count]
        for j in range(span):
            bm.faces.new((A[j], A[(j + 1) % n], B[(j + 1) % n], B[j]))
    if not full and closed_profile:          # partial arc: cap both cut ends so the shell reads solid
        bm.faces.new(rings[0])
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    return _link(bpy.data.objects.new(name, me), parent, mat)


def restand(o, x, y, z0):
    """Turn a lathe (revolved about the bore axis Y at ISO) into one standing vertically at (x, y),
    profile 'y' becoming height above z0. The axis swap mirrors winding, so normals are recomputed."""
    for v in o.data.vertices:
        vx, vy, vz = v.co.x, v.co.y, v.co.z - ISO
        v.co = (x + vx, y + vz, z0 + vy)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free()
    return o


def ring(rin, rout, y0, y1, ch=0.0):
    """Rectangular (optionally chamfered) annulus profile."""
    if ch <= 0:
        return [(rin, y0), (rout, y0), (rout, y1), (rin, y1)]
    return [(rin, y0 + ch), (rin + ch, y0), (rout - ch, y0), (rout, y0 + ch),
            (rout, y1 - ch), (rout - ch, y1), (rin + ch, y1), (rin, y1 - ch)]


def rounded_profile(rin, rout, y0, y1, rad, steps=4):
    """Annulus profile with all four corners filleted by `rad`."""
    pts = []
    corners = [((rin + rad, y0 + rad), math.pi, 1.5 * math.pi),
               ((rout - rad, y0 + rad), 1.5 * math.pi, 2 * math.pi),
               ((rout - rad, y1 - rad), 0.0, 0.5 * math.pi),
               ((rin + rad, y1 - rad), 0.5 * math.pi, math.pi)]
    for (cr, cy), a0, a1 in corners:
        for k in range(steps + 1):
            a = a0 + (a1 - a0) * k / steps
            pts.append((cr + rad * math.cos(a), cy + rad * math.sin(a)))
    return pts


def squircle(a, b, n, s=1.0, N=192):
    """Superellipse outline (x, z-offset-from-axis) used by the shroud."""
    pts = []
    for i in range(N):
        t = 2 * math.pi * i / N
        c, si = math.cos(t), math.sin(t)
        pts.append((a * s * math.copysign(abs(c) ** (2 / n), c), b * s * math.copysign(abs(si) ** (2 / n), si)))
    return pts


def loft_loops(name, loops, mat, parent=None, cyclic=False, smooth=True, cap=True):
    """Bridge a list of equal-length closed point loops [(x, y, z), ...] into one surface.
    cyclic joins last loop back to first (a closed tube-of-revolution); cap closes the ends."""
    replace(name)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vl = [[bm.verts.new(p) for p in lp] for lp in loops]
    N = len(vl[0])
    pairs = list(zip(vl, vl[1:] + (vl[:1] if cyclic else [])))
    for A, B in pairs:
        for i in range(N):
            bm.faces.new((A[i], A[(i + 1) % N], B[(i + 1) % N], B[i]))
    if cap and not cyclic:
        bm.faces.new(vl[0][::-1])
        bm.faces.new(vl[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    return _link(bpy.data.objects.new(name, me), parent, mat)


def rounded_box(name, size, loc, radius, mat, parent=None, segments=4):
    """Box with bevelled edges (bevel kept as a modifier so it stays editable)."""
    replace(name)
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    for c in list(o.users_collection):
        c.objects.unlink(o)
    o.scale = size
    o.location = loc
    with bpy.context.temp_override(active_object=o, object=o, selected_editable_objects=[o]):
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bv = o.modifiers.new("Round", "BEVEL")
    bv.width = radius
    bv.segments = segments
    bv.limit_method = "NONE"
    o.modifiers.new("WN", "WEIGHTED_NORMAL")
    for p in o.data.polygons:
        p.use_smooth = True
    return _link(o, parent, mat)


def cylinder(name, r, depth, loc, mat, parent=None, axis="Z", verts=48, bevel=0.0):
    replace(name)
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    for c in list(o.users_collection):
        c.objects.unlink(o)
    if axis == "Y":
        o.rotation_euler = (math.pi / 2, 0, 0)
    elif axis == "X":
        o.rotation_euler = (0, math.pi / 2, 0)
    o.location = loc
    if bevel > 0:
        bv = o.modifiers.new("Round", "BEVEL")
        bv.width = bevel
        bv.segments = 3
        bv.limit_method = "ANGLE"
        o.modifiers.new("WN", "WEIGHTED_NORMAL")
    for p in o.data.polygons:
        p.use_smooth = True
    return _link(o, parent, mat)


def box(name, size, loc, mat, parent=None):
    """Plain axis-aligned box, scale applied (walls, slabs, panels)."""
    replace(name)
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    for c in list(o.users_collection):
        c.objects.unlink(o)
    o.scale = size
    o.location = loc
    with bpy.context.temp_override(active_object=o, object=o, selected_editable_objects=[o]):
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _link(o, parent, mat)


def merged_boxes(name, items, mat, parent=None):
    """Many axis-aligned boxes [(size, loc), ...] as ONE mesh (ceiling grid, seam battens, slats)."""
    replace(name)
    from mathutils import Matrix
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    for (sx, sy, sz), loc in items:
        m = Matrix.Translation(loc) @ Matrix.Diagonal((sx, sy, sz, 1.0))
        bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    bm.to_mesh(me)
    bm.free()
    return _link(bpy.data.objects.new(name, me), parent, mat)


def cut_openings(obj, cutters, prefix="Open"):
    """Boolean the given cutter objects out of obj (doors, windows). Cutters are hidden helpers."""
    for i, c in enumerate(cutters):
        c.display_type = "WIRE"; c.hide_render = True; c.hide_set(True)
        m = obj.modifiers.get(f"{prefix}_{i}") or obj.modifiers.new(f"{prefix}_{i}", "BOOLEAN")
        m.object = c; m.operation = "DIFFERENCE"; m.solver = "EXACT"


FONTS = {"regular": r"C:\Windows\Fonts\arial.ttf", "bold": r"C:\Windows\Fonts\arialbd.ttf"}


def text(name, body, size, loc, rot, mat, parent=None, weight="regular", align="CENTER", extrude=0.0004):
    """Sign lettering as a real mesh (converted from a text curve) so it survives glTF export."""
    replace(name)
    path = FONTS[weight]
    font = next((f for f in bpy.data.fonts if f.filepath == path), None) or bpy.data.fonts.load(path)
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body; cu.font = font; cu.size = size; cu.extrude = extrude
    cu.align_x = align; cu.align_y = "CENTER"
    o = bpy.data.objects.new(name, cu)
    coll().objects.link(o)
    o.location = loc; o.rotation_euler = rot
    with bpy.context.temp_override(selected_objects=[o], selected_editable_objects=[o], active_object=o, object=o):
        bpy.ops.object.convert(target="MESH")
    o = bpy.data.objects[name]
    o.data.materials.clear(); o.data.materials.append(mat)
    if parent is not None:
        o.parent = parent
    return o


def cutaway(on):
    """Toggle the quarter-section booleans (Blender-side preview only; the engine clips at runtime)."""
    for o in coll("Scanner").objects:
        for m in o.modifiers:
            if m.name == "Cutaway":
                m.show_viewport = on
                m.show_render = on


def aim(obj, target):
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = (Vector(target) - obj.location).to_track_quat("-Z", "Y")
