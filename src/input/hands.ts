/**
 * Allwyn Sir's hand control: MediaPipe hand landmarks from the webcam, interpreted by his pure
 * gesture logic (hand-logic.js, unmodified): pinch-tap selects, pinch-drag orbits, an open palm held
 * still resets the view, two open palms zoom. The library and WASM are vendored (loaded only when
 * hands are switched on); the hand model is read from models/ or, failing that, from Google's
 * storage, exactly as in his version. Nothing leaves the browser: frames are processed locally.
 */
import logicSrc from './sir-hand-logic.cjs?raw';
import { el } from '../ui/dom';

/* eslint-disable @typescript-eslint/no-explicit-any */
const LOGIC = (() => { const module = { exports: {} as any }; new Function('module', 'exports', logicSrc)(module, module.exports); return module.exports; })();
const BASE = new URL(import.meta.env.BASE_URL, location.href).href;
const MODEL_LOCAL = `${BASE}models/hand_landmarker.task`;
const MODEL_CDN = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export interface HandHandlers {
  tap(clientX: number, clientY: number): void;
  orbit(dx: number, dy: number): void;
  zoom(dz: number): void;
  reset(): void;
  status(text: string, on: boolean): void;
}

export class Hands {
  private landmarker: any = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private readonly gestures = new LOGIC.HandGestures();
  private readonly zoomer = new LOGIC.TwoPalmZoom();
  private readonly cursor = el('div', { class: 'hand-cursor', hidden: true });
  private readonly preview = el('div', { class: 'hand-preview', hidden: true });
  private last = -1;
  private running = false;
  private x = 0; private y = 0;

  constructor(private readonly on: HandHandlers) {
    document.body.append(this.cursor, this.preview);
  }

  get active() { return this.running; }

  async toggle() { if (this.running) this.stop(); else await this.start(); }

  private async load() {
    if (this.landmarker) return;
    this.on.status('Loading hand tracking…', false);
    const lib = await import(/* @vite-ignore */ `${BASE}vendor/mediapipe/vision_bundle.mjs`);
    const vision = await lib.FilesetResolver.forVisionTasks(`${BASE}vendor/mediapipe/wasm`);
    let lastErr: unknown = null;
    for (const model of [MODEL_LOCAL, MODEL_CDN]) for (const delegate of ['GPU', 'CPU']) {
      try {
        this.landmarker = await lib.HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: model, delegate }, runningMode: 'VIDEO', numHands: 2 });
        return;
      } catch (e) { lastErr = e; }
    }
    throw new Error(`The hand model could not be loaded. Save hand_landmarker.task into public/models/ (see public/vendor/mediapipe/README.md) or connect to the internet once. ${String(lastErr ?? '')}`);
  }

  async start() {
    try {
      if (!window.isSecureContext) throw new Error('The camera needs the page to be opened from localhost or https.');
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use the camera.');
      await this.load();
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      this.video = el('video', { autoplay: true, muted: true, playsinline: true }) as HTMLVideoElement;
      this.video.srcObject = this.stream;
      await this.video.play();
      this.preview.replaceChildren(this.video, el('span', {}, 'Hands on · pinch to select, pinch-drag to orbit, open palm to reset'));
      this.preview.hidden = false; this.cursor.hidden = false;
      this.running = true;
      this.on.status('Hands on', true);
      this.loop();
    } catch (e) {
      this.stop();
      this.on.status(e instanceof Error ? e.message : String(e), false);
    }
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null; this.video = null;
    this.preview.hidden = true; this.cursor.hidden = true;
    this.gestures.reset(); this.zoomer.reset();
    this.on.status('Hands', false);
  }

  private loop = () => {
    if (!this.running || !this.video || !this.landmarker) return;
    const now = performance.now();
    if (this.video.readyState >= 2 && this.video.currentTime !== this.last) {
      this.last = this.video.currentTime;
      const res = this.landmarker.detectForVideo(this.video, now);
      const hands = (res.landmarks ?? []).map((lm: any, i: number) => ({ lm, label: res.handednesses?.[i]?.[0]?.categoryName }));
      // the camera frame is not mirrored, so MediaPipe's "Left" is the user's right hand
      const { aim, other } = LOGIC.pickHands(hands, 'Left');
      const zoomEvents = this.zoomer.update(aim?.lm, other?.lm, now);
      const zooming = this.zoomer.engaged;
      for (const ev of [...this.gestures.update(aim?.lm, now, { quiet: zooming }), ...zoomEvents]) this.handle(ev);
    }
    requestAnimationFrame(this.loop);
  };

  private handle(ev: any) {
    if (ev.type === 'pos') {
      this.x = ev.x * innerWidth; this.y = ev.y * innerHeight;
      this.cursor.style.transform = `translate(${this.x}px, ${this.y}px)`;
    }
    if (ev.type === 'lost') this.cursor.classList.add('lost'); else this.cursor.classList.remove('lost');
    if (ev.type === 'tap') { this.cursor.classList.add('tap'); setTimeout(() => this.cursor.classList.remove('tap'), 180); this.on.tap(this.x, this.y); }
    if (ev.type === 'drag') this.on.orbit(ev.dx, ev.dy);
    if (ev.type === 'zoom') this.on.zoom(ev.dz);
    if (ev.type === 'reset') this.on.reset();
  }
}
