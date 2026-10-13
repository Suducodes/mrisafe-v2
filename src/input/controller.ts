/**
 * Allwyn Sir's ESP32-S3 controller over Web Serial: six touch pads, tilt-to-orbit, gestures and the
 * magnetometer "wand meter". Protocol parsing, sequence tracking and the tilt/wand mappings are his
 * (engine.js parseLine / LineBuffer / SeqTracker, controller.js), loaded unmodified.
 */
import ctlSrc from './sir-controller.cjs?raw';
import { ENGINE } from '../physics/sir';

/* eslint-disable @typescript-eslint/no-explicit-any */
function loadUMD(src: string) { const module = { exports: {} as any }; new Function('module', 'exports', src)(module, module.exports); return module.exports; }
const CTL = loadUMD(ctlSrc);

export interface ControllerHandlers {
  pad(id: string, seq: number): void;
  gesture(g: string): void;
  tilt(dAz: number, dEl: number): void;
  status(text: string, connected: boolean): void;
  wand(text: string, level: number, dmagUT: number): void;
}

export class Controller {
  private port: any = null;
  private writer: WritableStreamDefaultWriter<string> | null = null;
  private readonly seq = new ENGINE.SeqTracker();
  private last = performance.now();
  readonly supported = 'serial' in navigator;

  constructor(private readonly on: ControllerHandlers) {}

  get connected() { return !!this.port; }

  async connect() {
    if (!this.supported) { this.on.status('Controller needs Chrome or Edge (Web Serial)', false); return; }
    try {
      this.port = await (navigator as any).serial.requestPort();
      await this.port.open({ baudRate: 115200 });
    } catch { this.port = null; this.on.status('Controller not connected', false); return; }
    const enc = new TextEncoderStream(); enc.readable.pipeTo(this.port.writable);
    this.writer = enc.writable.getWriter();
    this.send({ v: 1, type: 'cmd', cmd: 'hello' });
    this.on.status('Controller connected, waiting for hello…', true);
    this.read();
  }

  private send(msg: object) { this.writer?.write(JSON.stringify(msg) + '\n'); }

  private async read() {
    const dec = new TextDecoderStream();
    this.port.readable.pipeTo(dec.writable);
    const reader = dec.readable.getReader();
    const lines = new ENGINE.LineBuffer();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const line of lines.push(value)) this.handle(line);
      }
    } catch { /* unplugged */ }
    this.port = null; this.writer = null;
    this.on.status('Controller disconnected', false);
  }

  private handle(line: string) {
    const r = ENGINE.parseLine(line);
    if (!r.ok) return;
    const m = r.msg;
    if (m.type === 'hello') { this.seq.hello(m.boot); this.on.status(`Controller · ${m.board ?? 'ESP32-S3'} · ${m.imu ?? 'no IMU'}`, true); }
    if (m.type === 'action') {
      const s = this.seq.check(m);
      if (s === 'duplicate') return;
      this.send({ v: 1, type: 'ack', seq: m.seq, status: 'received' });
      this.on.pad(m.id, m.seq);
    }
    if (m.type === 'gesture') this.on.gesture(m.g);
    if (m.type === 'imu') {
      const now = performance.now(), dt = (now - this.last) / 1000; this.last = now;
      const { dAz, dEl } = CTL.orbitStep(m.r, m.p, dt);
      if (dAz || dEl) this.on.tilt(dAz, dEl);
      if (Number.isFinite(m.dmag)) { const w = CTL.wandLevel(m.dmag); this.on.wand(w.text, w.level, m.dmag); }
    }
  }
}

export const PAD_MAP = CTL.PAD_MAP as Record<'train' | 'learn', Record<string, string>>;
