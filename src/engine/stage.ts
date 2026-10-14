import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type FrameHook = (dt: number, t: number) => void;

/**
 * The full-screen 3D stage. Coordinates (three.js): metres, floor at y = 0, isocentre at
 * (0, 1.05, 0), bore axis along z, patient table toward +z, control room toward -x.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.03, 120);
  readonly controls: OrbitControls;
  /** Named layer roots (L_* empties) from every loaded asset. */
  readonly layers = new Map<string, THREE.Object3D>();
  /** Runs on every asset root as it arrives (baked lighting, material fixes). */
  onAsset?: (root: THREE.Object3D) => void;
  private readonly hooks = new Set<FrameHook>();
  // adaptive resolution: integrated GPUs (most lab PCs) are fill-rate bound, so trade pixels for frames
  private readonly maxRatio = Math.min(devicePixelRatio, 2);
  private ratio = Math.min(devicePixelRatio, 2);
  private frameMs = 16;
  private sinceAdjust = 0;
  private readonly gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly clock = new THREE.Clock();

  readonly composer: EffectComposer;
  /** Bloom picks up only HDR values above its threshold: nano seams, particles, screens. */
  readonly bloom: UnrealBloomPass;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    // filmic curve with real contrast (plain AgX read flat and washed out on the web)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 2 ** -1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.localClippingEnabled = true;               // the live cutaway
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.42, 0.45, 3.2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());                // tone mapping + sRGB after the bloom

    // neutral stand-in until the baked room probe replaces it
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.background = new THREE.Color(0x15191b);

    this.camera.position.set(-5.18, 1.70, 2.05);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0.30, 1.18, 0.80);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxDistance = 9;

    addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const t = this.clock.elapsedTime;
      for (const h of this.hooks) h(dt, t);
      this.applyOffset(dt);
      this.controls.update();
      this.composer.render(dt);
      this.adaptResolution(dt);
    });
  }

  /** Exposure in EV (the suite and the studio use different values). */
  set exposureEV(ev: number) { this.renderer.toneMappingExposure = 2 ** ev; }
  get exposureEV() { return Math.log2(this.renderer.toneMappingExposure); }

  /** Step the render resolution toward ~30-60 fps, with hysteresis so it does not hunt. */
  private adaptResolution(dt: number) {
    this.frameMs += (dt * 1000 - this.frameMs) * 0.08;
    this.sinceAdjust += dt;
    if (this.sinceAdjust < 1.2) return;
    let next = this.ratio;
    if (this.frameMs > 30) next = Math.max(0.6, this.ratio - 0.15);
    else if (this.frameMs < 15 && this.ratio < this.maxRatio) next = Math.min(this.maxRatio, this.ratio + 0.1);
    if (next !== this.ratio) {
      this.ratio = next;
      this.renderer.setPixelRatio(next);
      this.composer.setPixelRatio(next);
      this.sinceAdjust = 0;
    }
  }

  /** Test harness: run every frame hook at a fixed 60 Hz for `seconds`, then render once.
   *  Gives deterministic frames when the page is not being animated (hidden, headless). */
  advance(seconds: number) {
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) {
      for (const h of this.hooks) h(dt, this.clock.elapsedTime + t);
      this.applyOffset(dt);
      this.controls.update();
    }
    this.composer.render(1 / 60);
  }

  /** Current render scale and smoothed frame time, for the quality readout. */
  get quality() { return { ratio: this.ratio, frameMs: this.frameMs }; }

  onFrame(hook: FrameHook) { this.hooks.add(hook); return () => this.hooks.delete(hook); }

  // screen space taken by UI panels; the projection centre slides into the free area between them
  private inset = { left: 0, right: 0, bottom: 0 };
  private offset = { x: 0, y: 0 };
  setInsets(left: number, right: number, bottom = 0) { this.inset = { left, right, bottom }; }

  private applyOffset(dt: number) {
    const tx = (this.inset.right - this.inset.left) / 2, ty = this.inset.bottom / 2;
    const k = 1 - Math.exp(-dt * 6);
    this.offset.x += (tx - this.offset.x) * k; this.offset.y += (ty - this.offset.y) * k;
    const { innerWidth: w, innerHeight: h } = window;
    if (Math.abs(this.offset.x) < 0.5 && Math.abs(this.offset.y) < 0.5 && tx === 0 && ty === 0) {
      if (this.camera.view?.enabled) this.camera.clearViewOffset();
      return;
    }
    this.camera.setViewOffset(w, h, this.offset.x, this.offset.y, w, h);
  }

  /** Load one streamed asset (scanner, suite, ...) and register its L_* peel layers. */
  async loadAsset(url: string) {
    const gltf = await this.gltfLoader.loadAsync(url);
    gltf.scene.traverse((o) => { if (o.name.startsWith('L_')) this.layers.set(o.name.slice(2), o); });
    this.onAsset?.(gltf.scene);
    this.scene.add(gltf.scene);
    return gltf;
  }

  /** Nearest named mesh under a screen point (client px), ignoring see-through and hidden things. */
  pick(clientX: number, clientY: number, filter: (o: THREE.Object3D) => boolean = () => true) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    for (const h of ray.intersectObjects(this.scene.children, true)) {
      const m = h.object as THREE.Mesh;
      if (!m.isMesh || !visibleInTree(m)) continue;
      const mat = m.material as THREE.Material;
      if (mat.transparent && mat.opacity < 0.5) continue;
      if (filter(m)) return h;
    }
    return null;
  }

  private resize() {
    const { innerWidth: w, innerHeight: h } = window;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // 42 deg vertical at 16:9; on narrower screens hold that horizontal coverage instead
    const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(21)) * (16 / 9));
    this.camera.fov = aspect >= 16 / 9 ? 42 : 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(halfH) / aspect));
    this.camera.fov = Math.min(this.camera.fov, 75);
    this.camera.updateProjectionMatrix();
  }
}

export function visibleInTree(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
