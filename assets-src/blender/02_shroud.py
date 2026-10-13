"""Main cover shroud: superellipse outline, rolled edges, flat faces, flared bore mouths.
Open at the bore: the liner is its own peel layer. Rebuilds the mesh in place so the
object's modifiers (wall, floor flat, seams, cutaway) are kept."""
import bpy, bmesh, math
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\helpers.py").read())

A, B, NX, D = SHROUD_A, SHROUD_B, SHROUD_N, SHROUD_D
N = 192
ROLL = [(1.0, 0.10), (0.995, 0.045), (0.985, 0.018), (0.970, 0.004), (0.950, 0.0)]    # (scale, inset from face)
FACE_INNER = 0.62                                                                      # face plane runs in to this scale
FLARE = [(0.50, 0.002), (0.462, 0.012), (0.430, 0.032), (0.400, 0.062), (0.378, 0.100), (0.362, 0.140)]

me = bpy.data.meshes.new("Cover_shroud")
bm = bmesh.new()
def outline(s, y): return [bm.verts.new((x, y, z + ISO)) for x, z in squircle(A, B, NX, s, N)]
def circle(r, y): return [bm.verts.new((r * math.cos(2 * math.pi * i / N), y, r * math.sin(2 * math.pi * i / N) + ISO)) for i in range(N)]

front = [outline(s, -D + d) for s, d in ROLL] + [outline(FACE_INNER, -D)] + [circle(r, -D + d) for r, d in FLARE]
back = [circle(r, D - d) for r, d in reversed(FLARE)] + [outline(FACE_INNER, D)] + [outline(s, D - d) for s, d in reversed(ROLL)]
seq = front + back
bore_gap = len(front) - 1                     # the pair (front flare end, back flare start) stays open
for k in range(len(seq)):                     # cyclic: the last pair closes the outer wall
    if k == bore_gap:
        continue
    P, Q = seq[k], seq[(k + 1) % len(seq)]
    for i in range(N):
        bm.faces.new((P[i], P[(i + 1) % N], Q[(i + 1) % N], Q[i]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(me); bm.free()
for p in me.polygons:
    p.use_smooth = True
me.materials.append(bpy.data.materials["Cover_GlossABS"])

o = bpy.data.objects.get("Cover_shroud")
if o is None:
    o = bpy.data.objects.new("Cover_shroud", me); coll().objects.link(o); o.parent = layer("covers")
    s = o.modifiers.new("Wall", "SOLIDIFY"); s.thickness = 0.008; s.offset = -1; s.use_even_offset = True
else:
    old = o.data; o.data = me; bpy.data.meshes.remove(old)
o.data.name = "Cover_shroud"
print("shroud faces", len(me.polygons))
