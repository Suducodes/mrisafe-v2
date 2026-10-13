"""Headless asset build for MRISafe v2.

  blender -b assets-src/scanner.blend --python-exit-code 1 -P tools/bake_and_export.py -- <out_dir> [--quick]

1. Bake-ready geometry: modifiers applied from the evaluated mesh (cutaway preview off).
2. Lightmap UVs ("Lightmap", always UV index 1 -> glTF TEXCOORD_1), one shared atlas per group.
3. Cycles bake of diffuse lighting only (direct + indirect, no albedo) -> lm_<group>.webp,
   normalised by a per-atlas scale and stored sRGB-encoded. The engine restores it as
   lightMapIntensity = pi * scale (three.js multiplies irradiance by albedo / pi).
4. Reflection probe: an equirect HDR rendered inside the magnet room with the scanner hidden.
5. glTF export of the Scanner and Room collections plus lightmaps.json.
The .blend is never saved: the source file keeps its editable modifiers.
"""
import bpy, sys, os, json, math, time
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else "assets-src/build")
QUICK = "--quick" in argv
SAMPLES = 48 if QUICK else 512
ATLAS = {"room": 1024 if QUICK else 2048, "scanner": 1024 if QUICK else 2048}
PROBE_AT = (0.9, -2.2, 1.5)                 # Blender coords: in front of the table, eye height
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene
t0 = time.time()
def log(*a):
    print(f"[build {time.time() - t0:6.1f}s]", *a, flush=True)


# --- render device ---------------------------------------------------------------------------
def use_gpu():
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA", "HIP", "ONEAPI"):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        (getattr(prefs, "refresh_devices", None) or prefs.get_devices)()
        if any(d.type == kind for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == kind
            sc.cycles.device = "GPU"
            return kind
    sc.cycles.device = "CPU"
    return "CPU"

sc.render.engine = "CYCLES"
log("device:", use_gpu())


# --- 1. apply modifiers ---------------------------------------------------------------------
def export_objects(coll_name):
    return [o for o in bpy.data.collections[coll_name].all_objects if not o.name.startswith("_cut")]

for o in bpy.data.objects:
    for m in o.modifiers:
        if m.name == "Cutaway":
            m.show_viewport = False; m.show_render = False
    if o.name.startswith("_cut"):
        o.hide_render = True
dg = bpy.context.evaluated_depsgraph_get()
pending = []
for o in export_objects("Scanner") + export_objects("Room"):
    if o.type == "MESH" and o.modifiers:
        pending.append((o, bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)))
for o, me in pending:
    o.modifiers.clear(); o.data = me
log("applied modifiers on", len(pending), "objects")


def drop_empty_slots(o):
    """Booleans whose cutters carry no material add an empty slot for the faces they cut (the inside
    of a seam groove). Those faces belong to the object's own material: remap them, drop the slot."""
    mats = list(o.data.materials)
    if None not in mats or all(m is None for m in mats):
        return 0
    keep = [m for m in mats if m is not None]
    remap = [keep.index(m) if m is not None else 0 for m in mats]
    idx = np.empty(len(o.data.polygons), dtype=np.int32)
    o.data.polygons.foreach_get("material_index", idx)
    o.data.polygons.foreach_set("material_index", np.array(remap, dtype=np.int32)[np.clip(idx, 0, len(mats) - 1)])
    o.data.materials.clear()
    for m in keep:
        o.data.materials.append(m)
    return 1

fixed = sum(drop_empty_slots(o) for o in export_objects("Scanner") + export_objects("Room") if o.type == "MESH")
log("remapped empty material slots on", fixed, "objects")


# --- 2. bake groups and lightmap UVs ---------------------------------------------------------
def layer_of(o):
    p = o
    while p is not None:
        if p.name.startswith("L_"):
            return p.name[2:]
        p = p.parent
    return None

def principled(m):
    return next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m and m.use_nodes else None

def bakeable(o):
    """Lit by diffuse light: not emissive, not see-through, not metal (metal has no diffuse to bake)."""
    if o.type != "MESH" or not o.data.polygons or not o.material_slots:
        return False
    for s in o.material_slots:
        b = principled(s.material)
        if b is None:
            return False
        if b.inputs["Emission Strength"].default_value > 0 or b.inputs["Alpha"].default_value < 1:
            return False
        if b.inputs["Metallic"].default_value > 0.5:
            return False
    return True

GROUPS = {
    "room": {"room_finish", "control_room", "zones"},     # equipment moves between zones: probe-lit, not baked
    "scanner": {"covers", "table", "rf_head_coil"},
}
groups = {g: [o for o in export_objects("Room") + export_objects("Scanner") if layer_of(o) in layers and bakeable(o)]
          for g, layers in GROUPS.items()}

# Each LED panel is represented by an area light. In Cycles its emissive diffuser would ALSO light
# the room (EEVEE barely lets emissive surfaces illuminate, so the renders never showed it), doubling
# every panel. Emitters stay visible to the camera (probe reflections) but stop casting light.
for o in export_objects("Room") + export_objects("Scanner"):
    if o.type != "MESH":
        continue
    for s in o.material_slots:
        b = principled(s.material)
        if b is not None and b.inputs["Emission Strength"].default_value > 0:
            s.material.cycles.emission_sampling = "NONE"
            o.visible_diffuse = o.visible_glossy = o.visible_transmission = o.visible_volume_scatter = False
for g, objs in groups.items():
    log(f"group {g}: {len(objs)} objects")

def lightmap_uvs(objs):
    for o in objs:
        uv = o.data.uv_layers
        if len(uv) == 0:
            uv.new(name="UVMap")
        while len(uv) > 1:
            uv.remove(uv[1])
        uv.active = uv.new(name="Lightmap")
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.hide_set(False); o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()          # one texel density across every object in the atlas
    bpy.ops.uv.pack_islands(rotate=True, margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")


# --- 3. bake + encode -------------------------------------------------------------------------
def blur(a, r=2, passes=2):
    """Separable box blur (two passes ~ gaussian) to take the residual Monte Carlo grain out."""
    for _ in range(passes):
        for axis in (0, 1):
            pad = [(r + 1, r) if i == axis else (0, 0) for i in range(a.ndim)]
            c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis)
            n = a.shape[axis]
            a = (np.take(c, range(2 * r + 1, n + 2 * r + 1), axis=axis) - np.take(c, range(0, n), axis=axis)) / (2 * r + 1)
    return a

def srgb_encode(v):
    return np.where(v <= 0.0031308, 12.92 * v, 1.055 * np.power(v, 1 / 2.4) - 0.055)

def bake_raw(name, objs, res, samples):
    """Bake diffuse lighting into a float image; returns the (res, res, 4) pixel array."""
    img = bpy.data.images.new(f"LM_{name}", res, res, alpha=False, float_buffer=True)
    added = []
    for m in {s.material for o in objs for s in o.material_slots}:
        n = m.node_tree.nodes.new("ShaderNodeTexImage"); n.image = img
        m.node_tree.nodes.active = n
        added.append((m, n))
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    sc.cycles.samples = samples
    sc.render.bake.margin = 16
    sc.render.bake.margin_type = "EXTEND"
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, uv_layer="Lightmap",
                        margin=16, use_clear=True, target="IMAGE_TEXTURES")
    for m, n in added:
        m.node_tree.nodes.remove(n)
    px = np.empty(res * res * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(res, res, 4)


def bake(name, objs, res):
    rgb = blur(bake_raw(name, objs, res, SAMPLES)[..., :3])
    peak = rgb.max(axis=2)
    lit = peak[peak > 1e-4]
    scale = float(np.percentile(lit, 99.8)) if lit.size else 1.0
    enc = srgb_encode(np.clip(rgb / scale, 0.0, 1.0))
    out = bpy.data.images.new(f"LMout_{name}", res, res, alpha=False, float_buffer=False)
    out.colorspace_settings.name = "Non-Color"           # bytes go to disk exactly as encoded
    out.pixels.foreach_set(np.concatenate([enc, np.ones((res, res, 1), np.float32)], axis=2).astype(np.float32).ravel())
    path = os.path.join(OUT, f"lm_{name}.webp")
    out.filepath_raw = path; out.file_format = "WEBP"
    sc.render.image_settings.quality = 92
    out.save(filepath=path, quality=92)
    log(f"baked {name}: {res}px, scale {scale:.3f}, lit texels {lit.size / (res * res):.0%}")
    return scale

manifest = {"version": 1, "note": "lightMapIntensity = pi * scale; texture is sRGB-encoded, TEXCOORD_1, flipY false",
            "atlases": {}, "objects": {}}
for g, objs in groups.items():
    if not objs:
        continue
    lightmap_uvs(objs)
    log(f"uv {g} packed")
    s = bake(g, objs, ATLAS[g])
    manifest["atlases"][g] = {"file": f"lm_{g}.webp", "scale": s}
    for o in objs:
        manifest["objects"][o.name] = g


# --- 4. reflection probe -----------------------------------------------------------------------
hidden = [o for o in export_objects("Scanner") if not o.hide_render]
for o in hidden:
    o.hide_render = True                      # the scanner must not reflect itself
cam = bpy.data.objects.new("_probe", bpy.data.cameras.new("_probe")); sc.collection.objects.link(cam)
cam.data.type = "PANO"
try:
    cam.data.panorama_type = "EQUIRECTANGULAR"
except AttributeError:
    cam.data.cycles.panorama_type = "EQUIRECTANGULAR"
cam.location = PROBE_AT
cam.rotation_euler = (math.pi / 2, 0, -math.pi / 2)   # image centre looks along +X (three.js equirect u = 0.5)
sc.camera = cam
vs = sc.view_settings
saved = (vs.view_transform, vs.look, vs.exposure)
vs.view_transform = "Standard"; vs.look = "None"; vs.exposure = 0.0
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = (1024, 512, 100) if QUICK else (2048, 1024, 100)
sc.cycles.samples = 64 if QUICK else 256
sc.cycles.use_denoising = True
sc.render.image_settings.file_format = "HDR"
sc.render.filepath = os.path.join(OUT, "probe_room.hdr")
bpy.ops.render.render(write_still=True)
vs.view_transform, vs.look, vs.exposure = saved
for o in hidden:
    o.hide_render = False

# optional ground truth: the cold-open shot path-traced from the same scene, to judge the web view against
if "--reference" in argv:
    sc.camera = bpy.data.objects["ColdOpen_cam"]
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.cycles.samples = 256
    sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = os.path.join(OUT, "reference_cold_open.png")
    look = vs.look
    vs.look = "None"          # three.js AgX has no 'look'; compare like for like
    bpy.ops.render.render(write_still=True)
    vs.look = look
    log("reference rendered")
x, y, z = PROBE_AT
manifest["probe"] = {"file": "probe_room.hdr", "position": [x, z, -y]}   # three.js coords (Y up)
log("probe rendered")


# --- 5. export --------------------------------------------------------------------------------
def export(coll_name, filename):
    bpy.ops.object.select_all(action="DESELECT")
    for o in export_objects(coll_name):
        if o.type in ("MESH", "EMPTY"):
            o.hide_set(False); o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, filename), use_selection=True, export_apply=False,
                              export_yup=True, export_lights=False, export_cameras=False,
                              export_texcoords=True, export_normals=True)
export("Scanner", "scanner.glb")
export("Room", "suite.glb")
with open(os.path.join(OUT, "lightmaps.json"), "w") as f:
    json.dump(manifest, f, indent=1)
log("done:", {k: v["scale"] for k, v in manifest["atlases"].items()}, len(manifest["objects"]), "lightmapped objects")
