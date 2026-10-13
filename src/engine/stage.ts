import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** Blender renders use -0.8 EV under AgX; match it so the bake reads the same on the web. */
const EXPOSURE_EV = -0.8;

/** The full-screen 3D stage. Everything else (director, UI) drives this. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
  readonly controls: OrbitControls;
  /** Named layer roots from the scanner glTF (cover, gradient, cryostat, ...). */
  readonly layers = new Map<string, THREE.Object3D>();
  /** Runs on every asset root as it arrives (baked lighting, material fixes). */
  onAsset?: (root: THREE.Object3D) => void;
  private readonly gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 2 ** EXPOSURE_EV;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // neutral stand-in until the baked room probe replaces it
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--paper').trim());

    // Metres throughout; floor at y = 0, isocentre at (0, 1.05, 0), table toward +z.
    // Opening shot = Blender's ColdOpen_cam: behind the operator in the control room, through the RF glass.
    this.camera.fov = 42;
    this.camera.position.set(-5.18, 1.70, 2.05);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0.30, 1.18, 0.80);
    this.controls.enableDamping = true;

    addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => { this.controls.update(); this.renderer.render(this.scene, this.camera); });
  }

  /** Load one streamed asset (scanner, suite, ...) and register its L_* peel layers. */
  async loadAsset(url: string) {
    const gltf = await this.gltfLoader.loadAsync(url);
    gltf.scene.traverse((o) => { if (o.name.startsWith('L_')) this.layers.set(o.name.slice(2), o); });
    this.onAsset?.(gltf.scene);
    this.scene.add(gltf.scene);
    return gltf;
  }

  private resize() {
    const { innerWidth: w, innerHeight: h } = window;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
