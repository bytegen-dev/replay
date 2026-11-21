/**
 * The game's sound, made in the browser with the Web Audio API: no sound files to download. A handful of effects (flap, coin, crash,
 * the sync sweep, a level clear) and a quiet looping tune, all through one master volume that the cabinet's knob and mute button set.
 * Browsers only allow sound after a tap or key press, so nothing is created until `startAudio` is called from one.
 */

type Win = typeof window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.6;
let muted = false;
let music: { timer: number; step: number } | null = null;

function apply() {
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume * 0.55, ctx.currentTime, 0.02);
}

/** Opens the audio (call it from a tap or key press). Safe to call again. */
export function startAudio(): void {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as Win).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    apply();
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function setVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v));
  apply();
}
export function setMuted(m: boolean): void {
  muted = m;
  apply();
}

/** One note: a short tone that can slide from one pitch to another. */
function tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number, delay = 0): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  src.buffer = buf;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  flap: () => tone(420, 0.09, "square", 0.12, 760),
  coin: () => {
    tone(880, 0.07, "square", 0.1);
    tone(1320, 0.13, "square", 0.1, undefined, 0.06);
  },
  crash: () => {
    noise(0.35, 0.3);
    tone(220, 0.4, "sawtooth", 0.16, 55);
  },
  clear: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "square", 0.1, undefined, i * 0.09)),
  sync: () => {
    tone(160, 0.7, "sawtooth", 0.1, 1400);
    noise(0.5, 0.08, 0.05);
  },
  select: () => tone(660, 0.05, "square", 0.08),
  coinDrop: () => {
    tone(1568, 0.09, "square", 0.1);
    tone(2093, 0.25, "square", 0.1, undefined, 0.09);
  },
};

/* A quiet looping tune: a slow bass and a soft arpeggio in A minor, scheduled a little ahead so it never stutters. */
const BASS = [110, 110, 87.31, 87.31, 130.81, 130.81, 98, 98];
const ARP = [440, 523.25, 659.25, 523.25, 349.23, 440, 523.25, 440, 523.25, 659.25, 783.99, 659.25, 392, 493.88, 587.33, 493.88];

export function startMusic(): void {
  if (!ctx || music) return;
  const stepMs = 190;
  music = {
    step: 0,
    timer: window.setInterval(() => {
      if (!music) return;
      const s = music.step++;
      if (s % 2 === 0) tone(BASS[(s / 2) % BASS.length], 0.34, "triangle", 0.1);
      tone(ARP[s % ARP.length], 0.16, "square", 0.028);
    }, stepMs),
  };
}

export function stopMusic(): void {
  if (music) window.clearInterval(music.timer);
  music = null;
}
