"""Signage as real geometry (exports crisply, no textures): the Zone IV danger sign, the ASTM
F2503-style MR Unsafe / MR Conditional / MR Safe marks (simplified renderings for training, not
reproductions of the standard's artwork), and the magnet-stop label.
Each sign is built in a local frame (X right, Z up, facing local -Y) under an anchor empty."""
import bpy, bmesh, math
from mathutils import Matrix
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\helpers.py").read())
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\room_dims.py").read())
TARGET = "Room"

signs = layer("room_signage")
WHITE = material("Sign_White", (0.92, 0.92, 0.90), 0.0, 0.5)
RED = material("Sign_Red", (0.68, 0.05, 0.05), 0.0, 0.45)
BLACK = material("Sign_Black", (0.02, 0.02, 0.02), 0.0, 0.5)
YELLOW = bpy.data.materials.get("Sign_Yellow") or material("Sign_Yellow", (0.95, 0.76, 0.06), 0.0, 0.45)
GREEN = material("Sign_Green", (0.0, 0.47, 0.24), 0.0, 0.45)
UP = (math.pi / 2, 0, 0)            # text lies in local XZ, facing -Y, reading along +X
STEP = 0.0002                       # layer spacing in front of the sign face


def anchor(name, loc, rot_z, parent=None):
    a = bpy.data.objects.get(name) or bpy.data.objects.new(name, None)
    if a.name not in coll().objects:
        coll().objects.link(a)
    a.empty_display_size = 0.05
    a.parent = parent or signs
    a.matrix_parent_inverse = Matrix.Identity(4)
    bpy.context.view_layer.update()
    a.matrix_world = Matrix.Translation(loc) @ Matrix.Rotation(rot_z, 4, "Z")   # setter solves for the local matrix
    return a


def flat(name, pts, y, mat, parent):
    """Flat polygon (local x, z points) at depth y, facing local -Y."""
    replace(name)
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    f = bm.faces.new([bm.verts.new((x, y, z)) for x, z in pts])
    bm.normal_update()
    if f.normal.y > 0:
        f.normal_flip()
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); coll().objects.link(o)
    o.data.materials.append(mat); o.parent = parent
    return o


def flat_ring(name, cx, cz, rin, rout, y, mat, parent, n=64):
    replace(name)
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    outer = [bm.verts.new((cx + rout * math.cos(2 * math.pi * i / n), y, cz + rout * math.sin(2 * math.pi * i / n))) for i in range(n)]
    inner = [bm.verts.new((cx + rin * math.cos(2 * math.pi * i / n), y, cz + rin * math.sin(2 * math.pi * i / n))) for i in range(n)]
    for i in range(n):
        f = bm.faces.new((outer[i], outer[(i + 1) % n], inner[(i + 1) % n], inner[i]))
    bm.normal_update()
    for f in bm.faces:
        if f.normal.y > 0:
            f.normal_flip()
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); coll().objects.link(o)
    o.data.materials.append(mat); o.parent = parent
    return o


def plate(name, w, h, mat, parent, t=0.003, cx=0.0, cz=0.0, r=0.004):
    return rounded_box(name, (w, t, h), (cx, t / 2, cz), r, mat, parent, segments=3)


def label(name, body, size, cx, cz, mat, parent, weight="regular", layer_=3):
    return text(name, body, size, (cx, -STEP * layer_, cz), UP, mat, parent, weight=weight)


def disc_pts(cx, cz, r, n=64):
    return [(cx + r * math.cos(2 * math.pi * i / n), cz + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def mr_unsafe(tag, cx, cz, r, parent):
    """Red circle with a red diagonal bar (upper left to lower right) over black MR, on white."""
    flat(f"{tag}_bg", disc_pts(cx, cz, r), -STEP, WHITE, parent)
    label(f"{tag}_MR", "MR", r * 0.95, cx, cz - r * 0.02, BLACK, parent, "bold", 2)
    flat_ring(f"{tag}_ring", cx, cz, r * 0.84, r, -STEP * 3, RED, parent)
    a, w = math.radians(-45), r * 0.16
    dx, dz = math.cos(a) * r * 0.86, math.sin(a) * r * 0.86
    nx, nz = -math.sin(a) * w / 2, math.cos(a) * w / 2
    flat(f"{tag}_bar", [(cx - dx - nx, cz - dz - nz), (cx + dx - nx, cz + dz - nz), (cx + dx + nx, cz + dz + nz), (cx - dx + nx, cz - dz + nz)],
         -STEP * 3, RED, parent)


def mr_conditional(tag, cx, cz, s, parent):
    """Yellow equilateral triangle with a black border band, black MR."""
    h = s * math.sqrt(3) / 2
    tri = lambda k: [(cx - s * k / 2, cz - h * k / 3), (cx + s * k / 2, cz - h * k / 3), (cx, cz + 2 * h * k / 3)]
    flat(f"{tag}_border", tri(1.0), -STEP, BLACK, parent)
    flat(f"{tag}_fill", tri(0.80), -STEP * 2, YELLOW, parent)
    label(f"{tag}_MR", "MR", s * 0.26, cx, cz - h * 0.08, BLACK, parent, "bold", 3)


def mr_safe(tag, cx, cz, s, parent):
    """Green square, white MR."""
    flat(f"{tag}_sq", [(cx - s / 2, cz - s / 2), (cx + s / 2, cz - s / 2), (cx + s / 2, cz + s / 2), (cx - s / 2, cz + s / 2)], -STEP, GREEN, parent)
    label(f"{tag}_MR", "MR", s * 0.42, cx, cz, WHITE, parent, "bold", 2)


def alert_triangle(tag, cx, cz, s, parent):
    """Safety alert symbol: white triangle with a red exclamation mark (on the red header)."""
    h = s * math.sqrt(3) / 2
    flat(f"{tag}_tri", [(cx - s / 2, cz - h / 3), (cx + s / 2, cz - h / 3), (cx, cz + 2 * h / 3)], -STEP * 3, WHITE, parent)
    label(f"{tag}_bang", "!", s * 0.62, cx, cz - h * 0.02, RED, parent, "bold", 4)


def danger_sign(tag, anchor_obj, w=0.40, h=0.30, zone=True):
    plate(f"{tag}_plate", w, h, WHITE, anchor_obj)
    hh = h * 0.24                                                    # red DANGER header band
    flat(f"{tag}_header", [(-w / 2 + 0.008, h / 2 - 0.008 - hh), (w / 2 - 0.008, h / 2 - 0.008 - hh),
                           (w / 2 - 0.008, h / 2 - 0.008), (-w / 2 + 0.008, h / 2 - 0.008)], -STEP * 2, RED, anchor_obj)
    hz = h / 2 - 0.008 - hh / 2
    alert_triangle(f"{tag}_alert", -w * 0.30, hz, hh * 0.72, anchor_obj)
    label(f"{tag}_title", "DANGER", hh * 0.62, w * 0.06, hz, WHITE, anchor_obj, "bold", 4)
    mr_unsafe(f"{tag}_unsafe", -w * 0.31, -h * 0.13, h * 0.20, anchor_obj)
    tx = w * 0.12
    label(f"{tag}_l1", "STRONG MAGNETIC FIELD", h * 0.062, tx, h * 0.02, BLACK, anchor_obj, "bold")
    label(f"{tag}_l2", "The magnet is always on", h * 0.055, tx, -h * 0.09, BLACK, anchor_obj)
    if zone:
        label(f"{tag}_l3", "Zone IV  ·  screened people only", h * 0.050, tx, -h * 0.20, BLACK, anchor_obj)
        flat(f"{tag}_zone_bar", [(-w / 2 + 0.008, -h / 2 + 0.008), (w / 2 - 0.008, -h / 2 + 0.008),
                                 (w / 2 - 0.008, -h / 2 + 0.022), (-w / 2 + 0.008, -h / 2 + 0.022)], -STEP * 2, RED, anchor_obj)


# --- corridor face of the RF door (swings with the leaf) --------------------------------------
pivot = bpy.data.objects["Door_pivot"]
dxm = (DOOR["x0"] + DOOR["x1"]) / 2
door_out = anchor("Sign_door_danger", (dxm, CY0 - 0.082, 1.56), 0.0, pivot)   # world placement; parented to the pivot
danger_sign("SgnDoorDanger", door_out)
door_mr = anchor("Sign_door_items", (dxm, CY0 - 0.082, 1.17), 0.0, pivot)
plate("SgnDoorItems_plate", 0.40, 0.17, WHITE, door_mr)
mr_unsafe("SgnDoorItems_unsafe", -0.135, 0.01, 0.055, door_mr)
mr_conditional("SgnDoorItems_cond", -0.03, -0.005, 0.105, door_mr)
mr_safe("SgnDoorItems_safe", 0.075, 0.01, 0.085, door_mr)
label("SgnDoorItems_txt", "Check every item's MR label before entry", 0.0145, 0.0, -0.068, BLACK, door_mr)

# --- inside the room, beside the door: reminder that the field never switches off -----------
inside = anchor("Sign_inside_danger", (0.35, Y0, 1.56), math.pi)
danger_sign("SgnInside", inside, w=0.36, h=0.27, zone=False)

# --- magnet-stop label on its yellow plate ---------------------------------------------------
ms = anchor("Sign_magnet_stop", (-0.35, Y0 + 0.02, 1.45), math.pi)
label("SgnStop_title", "MAGNET STOP", 0.020, 0.0, 0.088, BLACK, ms, "bold")
label("SgnStop_sub", "Emergency only: quenches the magnet", 0.0085, 0.0, -0.096, BLACK, ms)
print("signage ok")
