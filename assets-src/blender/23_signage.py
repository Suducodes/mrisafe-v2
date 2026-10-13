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
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\signs_lib.py").read())
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
