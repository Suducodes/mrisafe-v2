"""Magnet room (Zone IV) shell: finished floor, walls and suspended ceiling, with the copper RF
cage behind them. Openings: control-room window (west), RF door (front), penetration panel
recess (rear). Units m; scanner isocentre at (0, 0, ISO); patient table runs toward -Y."""
import bpy, math
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\helpers.py").read())
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\room_dims.py").read())
TARGET = "Room"

finish = layer("room_finish")
cage = layer("rf_cage")

# tonal order, darkest to lightest: floor < walls < scanner covers, so the white scanner separates
paint = material("Wall_Paint", (0.72, 0.71, 0.68), 0.0, 0.78)
vinyl = material("Floor_Vinyl", (0.38, 0.38, 0.37), 0.0, 0.40, coat=0.15)
tile_m = material("Ceiling_Tile", (0.86, 0.86, 0.84), 0.0, 0.92)
tbar = material("Ceiling_TBar", (0.90, 0.90, 0.89), 0.3, 0.45)
copper = material("Cage_Copper", (0.86, 0.53, 0.37), 1.0, 0.34)
copper_seam = material("Cage_Copper_Seam", (0.70, 0.40, 0.26), 1.0, 0.45)
steel = bpy.data.materials["OVC_Stainless"]

# --- floor (vinyl on screed over the cage floor) ---------------------------------------------
box("Room_floor", (X1 - X0, Y1 - Y0, 0.10), ((X0 + X1) / 2, (Y0 + Y1) / 2, -0.05), vinyl, finish)
old = bpy.data.objects.get("Floor_ref")
if old is not None:
    bpy.data.objects.remove(old, do_unlink=True)

# --- finished walls -----------------------------------------------------------------------
WH = HC + 0.06
xm, ym, Lx, Ly = (X0 + X1) / 2, (Y0 + Y1) / 2, X1 - X0 + 2 * WALL, Y1 - Y0
w_w = box("Wall_west", (WALL, Ly, WH), (X0 - WALL / 2, ym, WH / 2), paint, finish)
w_e = box("Wall_east", (WALL, Ly, WH), (X1 + WALL / 2, ym, WH / 2), paint, finish)
w_f = box("Wall_front", (Lx, WALL, WH), (xm, Y0 - WALL / 2, WH / 2), paint, finish)
w_r = box("Wall_rear", (Lx, WALL, WH), (xm, Y1 + WALL / 2, WH / 2), paint, finish)

def opening_cutter(name, x0, x1, y0, y1, z0, z1):
    return box(name, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), None)

T = 0.6   # cutter depth: through the finished wall AND the cage line behind it
cut_win = opening_cutter("_cut_window", X0 - T, X0 + 0.05, WIN["y0"], WIN["y1"], WIN["z0"], WIN["z1"])
cut_door = opening_cutter("_cut_door", DOOR["x0"], DOOR["x1"], Y0 - T, Y0 + 0.05, -0.2, DOOR["z1"])
cut_pen = opening_cutter("_cut_pen", PEN["x0"], PEN["x1"], Y1 - 0.05, Y1 + WALL + 0.005, PEN["z0"], PEN["z1"])
cut_openings(w_w, [cut_win]); cut_openings(w_f, [cut_door]); cut_openings(w_r, [cut_pen])

# coved vinyl skirting, broken at the door
sk = []
for (x0, x1, y0, y1) in [(X0, X1, Y1 - 0.012, Y1), (X0, X0 + 0.012, Y0, Y1), (X1 - 0.012, X1, Y0, Y1),
                          (X0, DOOR["x0"], Y0, Y0 + 0.012), (DOOR["x1"], X1, Y0, Y0 + 0.012)]:
    sk.append(((x1 - x0, y1 - y0, 0.10), ((x0 + x1) / 2, (y0 + y1) / 2, 0.05)))
merged_boxes("Skirting", sk, vinyl, finish)

# --- suspended ceiling: 600 mm tiles in a T-bar grid, centred on the room ---------------------
ct = box("Ceiling_tiles", (X1 - X0, Y1 - Y0, 0.015), (xm, ym, HC + 0.0075), tile_m, finish)
grid = []
gx = [k * 0.6 for k in range(-4, 5)]
gy = [ym + k * 0.6 for k in range(-5, 6)]
for x in gx:
    grid.append(((0.024, Y1 - Y0, 0.012), (x, ym, HC - 0.004)))
for y in gy:
    grid.append(((X1 - X0, 0.024, 0.012), (xm, y, HC - 0.004)))
grid += [((X1 - X0, 0.03, 0.03), (xm, Y0 + 0.015, HC - 0.012)), ((X1 - X0, 0.03, 0.03), (xm, Y1 - 0.015, HC - 0.012)),
         ((0.03, Y1 - Y0, 0.03), (X0 + 0.015, ym, HC - 0.012)), ((0.03, Y1 - Y0, 0.03), (X1 - 0.015, ym, HC - 0.012))]
merged_boxes("Ceiling_grid", grid, tbar, finish)
# penetrations for the quench line and the cold-head helium hoses
cq = cylinder("_cut_ceiling_quench", 0.175, 0.2, (QX, QY, HC), None, verts=48)
ch = cylinder("_cut_ceiling_hoses", 0.09, 0.2, (HX, HY, HC), None, verts=32)
cut_openings(ct, [cq, ch])

# --- RF cage: copper sheet on all six faces, vertical strips with seam battens ---------------
cx0, cx1, cy0, cy1 = CX0, CX1, CY0, CY1
CH = CAGE_TOP - CAGE_FLOOR; cz = (CAGE_TOP + CAGE_FLOOR) / 2
cw = box("Cage_west", (0.002, cy1 - cy0, CH), (cx0, (cy0 + cy1) / 2, cz), copper, cage)
ce = box("Cage_east", (0.002, cy1 - cy0, CH), (cx1, (cy0 + cy1) / 2, cz), copper, cage)
cf = box("Cage_front", (cx1 - cx0, 0.002, CH), ((cx0 + cx1) / 2, cy0, cz), copper, cage)
cr = box("Cage_rear", (cx1 - cx0, 0.002, CH), ((cx0 + cx1) / 2, cy1, cz), copper, cage)
box("Cage_ceiling", (cx1 - cx0, cy1 - cy0, 0.002), ((cx0 + cx1) / 2, (cy0 + cy1) / 2, CAGE_TOP), copper, cage)
box("Cage_floor", (cx1 - cx0, cy1 - cy0, 0.002), ((cx0 + cx1) / 2, (cy0 + cy1) / 2, CAGE_FLOOR), copper, cage)
cut_openings(cw, [cut_win], "Open_cage"); cut_openings(cf, [cut_door], "Open_cage")
for c in (cut_win, cut_door, cut_pen, cq, ch):
    c.hide_set(True)

seams, P = [], 1.2         # roll width of the copper strip
def strips(a0, a1):
    n = int((a1 - a0) / P)
    return [a0 + (a1 - a0) * k / (n + 1) for k in range(1, n + 1)] if n else []
for y in strips(cy0, cy1):
    seams += [((0.004, 0.05, CH), (cx0 + 0.003, y, cz)), ((0.004, 0.05, CH), (cx1 - 0.003, y, cz))]
for x in strips(cx0, cx1):
    seams += [((0.05, 0.004, CH), (x, cy0 + 0.003, cz)), ((0.05, 0.004, CH), (x, cy1 - 0.003, cz))]
    seams.append(((0.05, cy1 - cy0, 0.004), (x, (cy0 + cy1) / 2, CAGE_TOP - 0.003)))
# perimeter angles where walls meet ceiling and floor
for z in (CAGE_TOP - 0.03, CAGE_FLOOR + 0.03):
    seams += [((0.006, cy1 - cy0, 0.06), (cx0 + 0.004, (cy0 + cy1) / 2, z)), ((0.006, cy1 - cy0, 0.06), (cx1 - 0.004, (cy0 + cy1) / 2, z)),
              ((cx1 - cx0, 0.006, 0.06), ((cx0 + cx1) / 2, cy0 + 0.004, z)), ((cx1 - cx0, 0.006, 0.06), ((cx0 + cx1) / 2, cy1 - 0.004, z))]
sb = merged_boxes("Cage_seams", seams, copper_seam, cage)
# the seam battens must not run across the window and door openings either
cut_openings(sb, [cut_win, cut_door], "Open_seam")

# RF threshold under the door: stainless sill with a copper contact strip
box("RF_threshold", (DOOR["x1"] - DOOR["x0"], 0.16, 0.012), ((DOOR["x0"] + DOOR["x1"]) / 2, Y0 - 0.06, 0.006), steel, cage)
box("RF_threshold_contact", (DOOR["x1"] - DOOR["x0"] - 0.02, 0.02, 0.003), ((DOOR["x0"] + DOOR["x1"]) / 2, Y0 - CAGE_OFF, 0.0135), copper, cage)
print("room shell ok")
