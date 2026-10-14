import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { patchMaterial } from './patches';

/** Written by tools/bake_and_export.py. */
interface BakeManifest {
  atlases: Record<string, { file: string; scale: number }>;
  objects: Record<string, string>;
  probe?: { file: string; position: [number, number, number] };
}

// Baked surfaces take diffuse light from their lightmap; the environment's diffuse term is scaled
// by a global (patches.ts) so the bake is not counted twice in the suite.
function bakedMaterial(src: THREE.MeshStandardMaterial, lightMap: THREE.Texture, intensity: number) {
  const m = src.clone();
  m.lightMap = lightMap;
  m.lightMapIntensity = intensity;
  return patchMaterial(m, { baked: true });
}

/** RF window: thin bronze-tinted glass that mostly reflects (the copper mesh darkens transmission). */
function rfGlass(src: THREE.MeshStandardMaterial) {
  // two panes stack, so each stays faint; reflections come from the room probe
  return new THREE.MeshPhysicalMaterial({
    name: src.name, color: 0x2c2822, roughness: 0.03, metalness: 0,
    transparent: true, opacity: 0.07, depthWrite: false, envMapIntensity: 0.5,
  });
}

export interface BakedLighting {
  /** Apply lightmaps and glass to a loaded asset root. Safe to call for every asset. */
  apply(root: THREE.Object3D): number;
  /** The room's reflection probe (the suite's environment). */
  probe: THREE.Texture | null;
}

export async function loadBakedLighting(renderer: THREE.WebGLRenderer, scene: THREE.Scene, base = '/assets/'): Promise<BakedLighting> {
  const manifest: BakeManifest = await (await fetch(base + 'lightmaps.json')).json();
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const atlases = new Map<string, { tex: THREE.Texture; intensity: number }>();
  await Promise.all(Object.entries(manifest.atlases).map(async ([name, a]) => {
    const tex = await loader.loadAsync(base + a.file);
    tex.flipY = false;                       // glTF UV convention
    tex.colorSpace = THREE.SRGBColorSpace;   // the bake stores sRGB-encoded irradiance / scale
    tex.channel = 1;                         // TEXCOORD_1 = the "Lightmap" UV map
    tex.anisotropy = Math.min(16, maxAniso);  // floors and walls are seen at grazing angles when walking
    // three: indirectDiffuse = irradiance * albedo / pi; Cycles' diffuse pass is already "* albedo"
    atlases.set(name, { tex, intensity: Math.PI * a.scale });
  }));

  let probe: THREE.Texture | null = null;
  if (manifest.probe) {
    const hdr = await new RGBELoader().loadAsync(base + manifest.probe.file);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    probe = pmrem.fromEquirectangular(hdr).texture;
    scene.environment = probe;
    hdr.dispose(); pmrem.dispose();
  }

  const cache = new Map<string, THREE.Material>();
  const shared = (key: string, make: () => THREE.Material) => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key)!;
  };
  return {
    probe,
    apply(root) {
      let n = 0;
      root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.name === 'RF_Window_Glass') {
          mesh.material = shared('glass', () => rfGlass(mat));
          mesh.renderOrder = 2;
          return;
        }
        // single-primitive glTF nodes become the Mesh itself; multi-material ones a Group of Meshes
        const atlasName = manifest.objects[mesh.name] ?? manifest.objects[mesh.parent?.name ?? ''];
        const atlas = atlasName ? atlases.get(atlasName) : undefined;
        if (!atlas) return;
        mesh.material = shared(`${mat.uuid}|${atlasName}`, () => bakedMaterial(mat, atlas.tex, atlas.intensity));
        n++;
      });
      return n;
    },
  };
}
