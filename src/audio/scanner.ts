/**
 * The suite's sound, synthesised (no samples). Gradient knocks are a broadband click filtered by
 * the coil's mechanical resonance; EPI is the same physics at the readout switching rate, which is
 * why it buzzes instead of knocking. The cold head chuffs at about 1 Hz.
 */
export class ScannerAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private ambience: { stop(): void } | null = null;
  private alarmTimer: number | null = null;
  muted = false;

  /** Call from a user gesture. */
  ensure() {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(ctx.destination);
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  get now() { return this.ctx?.currentTime ?? 0; }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  private burst(t: number, dur: number, freq: number, q: number, gain: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.02);
  }

  /** One gradient switch. `pitch` shifts the coil resonance (different axes ring differently). */
  knock(t = this.now, gain = 0.55, pitch = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.burst(t, 0.07, 950 * pitch, 3.5, gain);
    this.burst(t, 0.03, 2600 * pitch, 6, gain * 0.35);
    const o = ctx.createOscillator(); o.frequency.value = 135 * pitch;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.06);
  }

  /** EPI readout: gradients reversing at ~1 kHz for `seconds`. */
  buzz(t = this.now, seconds = 0.08, freq = 1050, gain = 0.22) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const lp = ctx.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = freq * 1.6; lp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.setValueAtTime(gain, t + seconds - 0.006); g.gain.linearRampToValueAtTime(0, t + seconds);
    o.connect(lp).connect(g).connect(this.master); o.start(t); o.stop(t + seconds + 0.01);
  }

  /** Room tone plus the cold head's helium compressor chuff. */
  setAmbience(on: boolean) {
    if (!this.ctx) return;
    if (!on) { this.ambience?.stop(); this.ambience = null; return; }
    if (this.ambience) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const g = ctx.createGain(); g.gain.value = 0.05;
    src.connect(lp).connect(g).connect(this.master); src.start();
    let next = ctx.currentTime + 0.3;
    const timer = window.setInterval(() => {
      while (next < ctx.currentTime + 0.5) { this.burst(next, 0.22, 700, 1.2, 0.05); this.burst(next + 0.08, 0.12, 300, 1.5, 0.04); next += 1.02; }
    }, 200);
    this.ambience = { stop: () => { clearInterval(timer); src.stop(); } };
  }

  /** Oxygen-monitor alarm: two-tone, repeating until stopped. */
  setAlarm(on: boolean) {
    if (!this.ctx) return;
    if (this.alarmTimer) { clearInterval(this.alarmTimer); this.alarmTimer = null; }
    if (!on) return;
    const ctx = this.ctx;
    const beep = () => {
      [[880, 0], [660, 0.32]].forEach(([f, dt]) => {
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
        const g = ctx.createGain(); const t = ctx.currentTime + dt;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.01);
        g.gain.setValueAtTime(0.06, t + 0.26); g.gain.linearRampToValueAtTime(0.0001, t + 0.28);
        o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.3);
      });
    };
    beep();
    this.alarmTimer = window.setInterval(beep, 900);
  }
}
