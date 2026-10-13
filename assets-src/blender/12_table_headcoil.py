"""Patient table (pedestal, docking bridge, cradle, mattress) and head coil, plus the
bezel / plinth corrections from the washing-machine critique."""
import bpy, math
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\helpers.py").read())

D = 0.84
covers = layer("covers")
white = bpy.data.materials["Cover_GlossABS"]
graphite = bpy.data.materials["Bezel_Graphite"]
cut_quarter = bpy.data.objects["_cut_quarter"]

# --- corrections ---------------------------------------------------------------------------
satin = material("Bore_Bezel_Satin", (0.62, 0.63, 0.62), 0.0, 0.42, coat=0.2)
for n in ("Bore_bezel", "Bore_bezel_rear"):
    bpy.data.objects[n].data.materials[0] = satin
pl = bpy.data.objects["Plinth"]
pl.scale = (1.58, 1.46, 0.12)          # recessed under the shroud's flat bottom (~1.75 x 1.68)

# --- table ---------------------------------------------------------------------------------
table = layer("table")
cradle_mat = material("Cradle_GRP", (0.80, 0.80, 0.78), 0.0, 0.38, coat=0.25)
pad_mat = material("Mattress_PU", (0.31, 0.36, 0.41), 0.0, 0.85)
kick = material("Table_Kick", (0.05, 0.055, 0.06), 0.0, 0.7)

TOP = ISO - 0.16          # cradle top surface, so the patient's body axis lands near isocentre
BORE_R = 0.352            # liner inner radius
Y_HEAD, Y_FOOT = -0.90, -3.00


def cradle_section(half_w=0.262, clearance=0.012, max_depth=0.08, n=24, fil=0.012):
    """Flat top; underside follows the bore curve with clearance, capped at max_depth."""
    r = BORE_R - clearance
    under = [(x, max(ISO - math.sqrt(max(r * r - x * x, 0.0)), TOP - max_depth))
             for x in (-half_w + 2 * half_w * i / n for i in range(n + 1))]
    top = [(half_w, TOP - fil), (half_w - 0.3 * fil, TOP - 0.3 * fil), (half_w - fil, TOP),
           (-half_w + fil, TOP), (-half_w + 0.3 * fil, TOP - 0.3 * fil), (-half_w, TOP - fil)]
    return under + top


sec = cradle_section()
def at(y, s):             # section placed at y, scaled in plan to round the ends
    return [(x * s, y, z) for x, z in sec]
loft_loops("Cradle", [at(Y_HEAD, 0.94), at(Y_HEAD - 0.025, 0.995), at(Y_HEAD - 0.06, 1.0),
                      at(Y_FOOT + 0.06, 1.0), at(Y_FOOT + 0.025, 0.995), at(Y_FOOT, 0.94)], cradle_mat, table)

# head coil sits at the bore end of the cradle; mattress runs from it to the foot
HC_Y0, HC_Y1 = Y_HEAD - 0.06, Y_HEAD - 0.40          # crown end, chin end
m_y0, m_y1 = HC_Y1 - 0.02, Y_FOOT + 0.08
rounded_box("Mattress", (0.47, m_y0 - m_y1, 0.05), (0, (m_y0 + m_y1) / 2, TOP + 0.025), 0.02, pad_mat, table, segments=5)

# pedestal: narrower than the cradle so the cradle overhangs; slight flare toward the top
PED_Y0, PED_Y1 = -1.10, -2.75
yc, half_l = (PED_Y0 + PED_Y1) / 2, (PED_Y0 - PED_Y1) / 2
loops = [[(x, yc + y, z) for x, y in squircle(w, l, 8.0, N=96)]
         for z, w, l in ((0.14, 0.18, half_l - 0.03), (0.16, 0.20, half_l), (0.60, 0.22, half_l),
                         (0.74, 0.245, half_l + 0.01), (0.77, 0.24, half_l))]
loft_loops("Table_pedestal", loops, white, table)
rounded_box("Table_kick", (0.34, 2 * half_l - 0.10, 0.14), (0, yc, 0.07), 0.01, kick, table)
# carriage the cradle rides on, and the docking bridge to the bore mouth
rounded_box("Table_carriage", (0.40, 2 * half_l - 0.06, 0.04), (0, yc, 0.79), 0.008, graphite, table)
rounded_box("Table_bridge", (0.36, PED_Y0 + D + 0.02, 0.05), (0, (PED_Y0 - D - 0.02) / 2, TOP - 0.11), 0.01, graphite, table)

# --- head coil: posterior trough + anterior cage with a face window and side slots --------
rf = layer("rf_head_coil")
coil_mat = material("HeadCoil_PC", (0.86, 0.86, 0.84), 0.0, 0.32, coat=0.3)
hz = TOP + 0.150                                      # coil axis height (centre of the head)


def shell(name, rin, rout, a0, a1):
    o = lathe(name, rounded_profile(rin, rout, HC_Y1, HC_Y0, 0.008), coil_mat, rf, segs=64, arc=(a0, a1))
    o.location.z = hz - ISO                           # lathe builds around ISO; drop to head height
    return o


shell("HeadCoil_posterior", 0.132, 0.158, math.pi * 1.04, math.pi * 1.96)
ant = shell("HeadCoil_anterior", 0.130, 0.152, math.pi * 0.06, math.pi * 0.94)
ant.location.z += 0.004
# cutters: box local z is turned radial (rotation about Y by pi/2 - angle), local y stays the coil axis
for i, (ang, dy, w, h) in enumerate([(math.pi / 2, -0.15, 0.16, 0.14),
                                     (math.pi * 0.22, -0.15, 0.05, 0.18), (math.pi * 0.78, -0.15, 0.05, 0.18)]):
    c = rounded_box(f"_cut_hc_{i}", (w, h, 0.10), (0.142 * math.cos(ang), HC_Y0 + dy, hz + 0.142 * math.sin(ang)), 0.02, None)
    c.rotation_mode = "XYZ"; c.rotation_euler = (0, math.pi / 2 - ang, 0)
    c.display_type = "WIRE"; c.hide_render = True; c.hide_set(True)
    m = ant.modifiers.get(f"Window_{i}") or ant.modifiers.new(f"Window_{i}", "BOOLEAN")
    m.object = c; m.solver = "EXACT"
rounded_box("HeadCoil_base", (0.30, HC_Y0 - HC_Y1 + 0.01, 0.03), (0, (HC_Y0 + HC_Y1) / 2, TOP + 0.015), 0.008, coil_mat, rf)
rounded_box("HeadCoil_plug", (0.06, 0.05, 0.025), (0.10, HC_Y1 - 0.03, TOP + 0.013), 0.006, graphite, rf)

for o in coll().objects:
    if o.type == "MESH" and o.parent in (table, rf) and "Cutaway" not in o.modifiers:
        m = o.modifiers.new("Cutaway", "BOOLEAN"); m.object = cut_quarter; m.solver = "EXACT"
cutaway(False)
print("table + head coil ok")
