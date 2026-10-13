"""The training patient for Train mode: lying on the cradle under a blanket, head inside the head
coil (brain exam, as in Allwyn Sir's scenario). Only the blanketed form shows; no face is modelled.
Separate layer so Learn can hide it."""
import bpy, math
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\helpers.py").read())

pat = layer("patient")
blanket = material("Blanket_Cotton", (0.60, 0.67, 0.74), 0.0, 0.92)
TOP = ISO - 0.16                       # cradle top (12_table_headcoil.py)
# body under the blanket: (y station, height above cradle, half width), head end to feet
STATIONS = [(-1.30, 0.07, 0.17), (-1.38, 0.15, 0.22), (-1.50, 0.19, 0.235), (-1.70, 0.20, 0.235), (-1.92, 0.17, 0.23),
            (-2.10, 0.165, 0.225), (-2.30, 0.125, 0.205), (-2.52, 0.11, 0.19), (-2.70, 0.10, 0.175), (-2.80, 0.15, 0.16), (-2.86, 0.07, 0.15)]
N = 40


def section(y, h, w):
    """Blanket cross-section: a soft dome over the body, flaring slightly where it meets the mattress."""
    pts = []
    for i in range(N):
        t = i / (N - 1)                                   # left edge -> right edge over the top
        a = math.pi * (1 - t)
        x = math.cos(a) * w * 1.04
        z = TOP + 0.052 + math.sin(a) ** 0.8 * h
        pts.append((x, y, z))
    pts.append((w * 1.04, y, TOP + 0.050)); pts.append((-w * 1.04, y, TOP + 0.050))   # close along the mattress
    return pts


body = loft_loops("Patient_blanket", [section(*s) for s in STATIONS], blanket, pat)
sub = body.modifiers.new("Soft", "SUBSURF"); sub.levels = 1; sub.render_levels = 2
print("patient ok")
