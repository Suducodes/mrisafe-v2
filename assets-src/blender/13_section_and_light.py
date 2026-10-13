"""Hatched section caps for cutaway views, and the pre-room studio light / render setup.
The room (phase 1, next) replaces these lights with its own ceiling luminaires."""
import bpy, math
exec(open(r"C:\Users\Sudarshan\claude_code\mrisafe-v2\assets-src\blender\helpers.py").read())

# --- section cap: pale warm grey with a fine 45-degree hatch, like a drawing's cut face -------
sec = material("Section_Cap", (0.80, 0.78, 0.74), 0.0, 0.7)
nt = sec.node_tree
for n in [n for n in nt.nodes if n.type not in ("BSDF_PRINCIPLED", "OUTPUT_MATERIAL")]:
    nt.nodes.remove(n)
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
geo = nt.nodes.new("ShaderNodeNewGeometry")
sep = nt.nodes.new("ShaderNodeSeparateXYZ")
add1 = nt.nodes.new("ShaderNodeMath"); add1.operation = "ADD"
add2 = nt.nodes.new("ShaderNodeMath"); add2.operation = "ADD"
scale = nt.nodes.new("ShaderNodeMath"); scale.operation = "MULTIPLY"; scale.inputs[1].default_value = 1 / 0.022  # 22 mm pitch: legible at hero distance
frac = nt.nodes.new("ShaderNodeMath"); frac.operation = "FRACT"
line = nt.nodes.new("ShaderNodeMath"); line.operation = "LESS_THAN"; line.inputs[1].default_value = 0.14
mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
# cap colour = the cut object's own colour (object.color, set below), hatch = a darker shade of it
info = nt.nodes.new("ShaderNodeObjectInfo")
shade = nt.nodes.new("ShaderNodeMix"); shade.data_type = "RGBA"; shade.blend_type = "MULTIPLY"
shade.inputs["Factor"].default_value = 1.0; shade.inputs["B"].default_value = (0.62, 0.62, 0.62, 1)
L = nt.links.new
L(info.outputs["Color"], mix.inputs["A"])
L(info.outputs["Color"], shade.inputs["A"]); L(shade.outputs["Result"], mix.inputs["B"])
L(geo.outputs["Position"], sep.inputs[0])
L(sep.outputs["X"], add1.inputs[0]); L(sep.outputs["Y"], add1.inputs[1])
L(add1.outputs[0], add2.inputs[0]); L(sep.outputs["Z"], add2.inputs[1])     # x+y+z: 45 deg on both cut planes
L(add2.outputs[0], scale.inputs[0]); L(scale.outputs[0], frac.inputs[0]); L(frac.outputs[0], line.inputs[0])
L(line.outputs[0], mix.inputs["Factor"]); L(mix.outputs["Result"], bsdf.inputs["Base Color"])

cut = bpy.data.objects["_cut_quarter"]
cut.data.materials.clear(); cut.data.materials.append(sec)
n = 0
for o in coll().objects:
    for m in o.modifiers:
        if m.name == "Cutaway" and m.type == "BOOLEAN":
            m.solver = "EXACT"; m.material_mode = "TRANSFER"; n += 1
print("cutaway caps on", n, "objects")

# per-object cap tint: the object's own material colour, lifted toward paper so dark layers stay legible
for o in coll().objects:
    if o.type == "MESH" and o.data.materials and o.data.materials[0] is not None:
        mb = next((nd for nd in o.data.materials[0].node_tree.nodes if nd.type == "BSDF_PRINCIPLED"), None)
        if mb is not None:
            r, g, b, _ = mb.inputs["Base Color"].default_value
            lift = 0.35
            o.color = (r + (0.92 - r) * lift, g + (0.91 - g) * lift, b + (0.88 - b) * lift, 1.0)

# --- studio light (stand-in until the room exists) -----------------------------------------
sc = bpy.context.scene
STUDIO = bpy.data.collections.get("Room") is None      # once the room exists, its LED panels light the scene
def area(name, loc, target, power, sx, sy, color=(1, 1, 1)):
    replace(name)
    l = bpy.data.lights.get(name) or bpy.data.lights.new(name, "AREA")
    l.shape = "RECTANGLE"; l.size = sx; l.size_y = sy; l.energy = power; l.color = color
    o = bpy.data.objects.new(name, l); sc.collection.objects.link(o)
    o.location = loc; aim(o, target)
    return o
if STUDIO:
    for nm in ("Key", "Fill", "Rim"):
        replace(nm)
    area("Ceiling_panel_A", (0.0, -1.6, 3.0), (0.0, -1.6, 0.0), 650, 1.2, 2.4, (1.0, 0.98, 0.95))
    area("Ceiling_panel_B", (0.0, 1.4, 3.0), (0.0, 1.4, 0.0), 350, 1.2, 1.8, (1.0, 0.98, 0.95))
    area("Key_soft", (3.6, -3.4, 2.2), (0.0, -0.6, 1.0), 380, 2.0, 2.0, (0.97, 0.98, 1.0))
    area("Fill_cool", (-3.8, -2.0, 1.6), (0.0, 0.0, 1.0), 120, 3.0, 2.0, (0.90, 0.95, 1.0))
    bg = next(n for n in sc.world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.72, 0.75, 0.77, 1); bg.inputs[1].default_value = 0.35
    floor = bpy.data.objects.get("Floor_ref")
    if floor is not None:
        fb = next(n for n in floor.data.materials[0].node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        fb.inputs["Base Color"].default_value = (0.46, 0.48, 0.47, 1); fb.inputs["Roughness"].default_value = 0.42

# painted white GRP sits near 0.8 albedo, not 0.86; brighter clips under AgX
cb = next(n for n in bpy.data.materials["Cover_GlossABS"].node_tree.nodes if n.type == "BSDF_PRINCIPLED")
cb.inputs["Base Color"].default_value = (0.79, 0.80, 0.79, 1)
cb.inputs["Roughness"].default_value = 0.36          # semi-gloss paint, not lacquered plastic
cb.inputs["Coat Weight"].default_value = 0.25
cb.inputs["Coat Roughness"].default_value = 0.12
bz = next(n for n in bpy.data.materials["Bore_Bezel_Satin"].node_tree.nodes if n.type == "BSDF_PRINCIPLED")
bz.inputs["Base Color"].default_value = (0.47, 0.48, 0.48, 1)   # a trim, one clear step darker than the cover
for nm in ("BoreLiner_GRP",):
    lb = next(n for n in bpy.data.materials[nm].node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    lb.inputs["Roughness"].default_value = 0.55

e = sc.eevee
e.use_raytracing = True
e.ray_tracing_options.use_denoise = True
e.ray_tracing_options.resolution_scale = "1"
e.fast_gi_resolution = "1"
e.fast_gi_ray_count = 4
sc.view_settings.exposure = -0.75
e.use_shadows = True
e.use_fast_gi = True
e.taa_render_samples = 128
e.shadow_ray_count = 3          # soft area-light shadows inside the bore were grainy at the default
e.shadow_step_count = 12
try:
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
except TypeError as err:
    print(err)
sc.render.resolution_x, sc.render.resolution_y = 1600, 900
print("light + render ok")
