import { SAMPLE_RATE } from './wav';
import { valueToPianoKey } from './render';

// ─── Instrument types ────────────────────────────────────────────────────────

export type SingleInstrumentId =
  | 'piano'
  | 'guitar'
  | 'violin'
  | 'flute'
  | 'drum'
  | 'trumpet'
  | 'harp'
  | 'xylophone';

export type InstrumentId = SingleInstrumentId | 'mix';

export interface Instrument {
  id: InstrumentId;
  label: string;
  emoji: string;
  color: string;
}

export const SINGLE_INSTRUMENTS: SingleInstrumentId[] = [
  'piano',
  'guitar',
  'violin',
  'flute',
  'drum',
  'trumpet',
  'harp',
  'xylophone',
];

export const INSTRUMENTS: Instrument[] = [
  { id: 'piano',     label: 'Piano',     emoji: '🎹', color: '#ff3df0' },
  { id: 'guitar',    label: 'Guitar',    emoji: '🎸', color: '#ffd166' },
  { id: 'violin',    label: 'Violin',    emoji: '🎻', color: '#f4845f' },
  { id: 'flute',     label: 'Flute',     emoji: '🪈', color: '#00e5ff' },
  { id: 'drum',      label: 'Drum',      emoji: '🥁', color: '#e11d48' },
  { id: 'trumpet',   label: 'Trumpet',   emoji: '🎺', color: '#fbbf24' },
  { id: 'harp',      label: 'Harp',      emoji: '🪕', color: '#34d399' },
  { id: 'xylophone', label: 'Xylophone', emoji: '🔔', color: '#38bdf8' },
  { id: 'mix',       label: 'Mix Mode',  emoji: '🔀', color: '#00f5d4' },
];

/**
 * For a given level in Mix Mode, pick a curated, pleasant combination
 * of 2 to 4 instruments (not necessarily all 8) so the melody sounds cohesive.
 */
export function generateCuratedMixForLevel(streakIndex: number, noteCount = 9): SingleInstrumentId[] {
  const harmonicPalettes: SingleInstrumentId[][] = [
    ['piano', 'violin', 'harp'],          // Classical acoustic elegance
    ['guitar', 'flute', 'harp'],           // Warm acoustic & ethereal melody
    ['drum', 'piano', 'violin'],           // Rhythmic melodic chamber
    ['flute', 'xylophone', 'piano'],       // Playful bright acoustic
    ['harp', 'drum', 'violin'],            // Rhythmic strings & harp
    ['piano', 'guitar', 'flute'],          // Soft contemporary trio
    ['trumpet', 'piano', 'drum'],          // Punchy brass & beats
    ['guitar', 'piano', 'harp', 'drum'],   // Full rich ensemble
  ];

  const palette = harmonicPalettes[Math.floor(Math.random() * harmonicPalettes.length)];
  const assignments: SingleInstrumentId[] = [];

  for (let i = 0; i < noteCount; i++) {
    const chosen = palette[Math.floor(Math.random() * palette.length)];
    assignments.push(chosen);
  }

  return assignments;
}

// ─── Synthesizers ────────────────────────────────────────────────────────────

/** Piano: hammer transient + detuned unison strings + decaying harmonics */
function synthPiano(
  freq: number,
  durationSec: number,
  sampleRate: number,
  velocity: number
): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  const detune2 = 1.002, detune3 = 0.998, B = 0.0002;
  const harmonics = [
    { mult: 1, amp: 1.0,  decay: 2.2 },
    { mult: 2, amp: 0.6,  decay: 3.5 },
    { mult: 3, amp: 0.35, decay: 5.0 },
    { mult: 4, amp: 0.2,  decay: 7.0 },
    { mult: 5, amp: 0.1,  decay: 9.0 },
    { mult: 6, amp: 0.05, decay: 12.0 },
  ];
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const hammer = Math.exp(-t * 120) * Math.sin(2 * Math.PI * 800 * t) * 0.12;
    let s = 0;
    for (const h of harmonics) {
      const fh = h.mult * freq * Math.sqrt(1 + B * h.mult * h.mult);
      const a = Math.exp(-h.decay * t);
      s += h.amp * a * (
        Math.sin(2 * Math.PI * fh * t) * 0.4 +
        Math.sin(2 * Math.PI * fh * detune2 * t) * 0.3 +
        Math.sin(2 * Math.PI * fh * detune3 * t) * 0.3
      );
    }
    const atk = Math.min(1, t / 0.003);
    const rel = t > durationSec - 0.03 ? (durationSec - t) / 0.03 : 1;
    out[i] = (hammer + s * 0.6) * atk * Math.max(0, rel) * velocity;
  }
  return out;
}

/** Guitar: plucked string via Karplus-Strong + body resonance */
function synthGuitar(
  freq: number,
  durationSec: number,
  sampleRate: number,
  velocity: number
): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  const delay = Math.max(4, Math.round(sampleRate / freq));
  const buf = new Float32Array(delay);
  for (let i = 0; i < delay; i++) buf[i] = (Math.random() * 2 - 1) * velocity;
  let writeIdx = 0;
  const damp = 0.495 + 0.005 * Math.min(1, freq / 880);
  for (let i = 0; i < n; i++) {
    const readIdx = (writeIdx + 1) % delay;
    const samp = damp * (buf[writeIdx] + buf[readIdx]);
    buf[writeIdx] = samp;
    writeIdx = (writeIdx + 1) % delay;
    const t = i / sampleRate;
    const env = Math.exp(-t * 2.5);
    out[i] = samp * env;
  }
  return out;
}

/**
 * Violin: rich, long sustained tone with ambient cathedral-style reverb / echo.
 * Each node rings out with smooth slow bow sustain and warm reflective echo decay.
 */
function synthViolin(
  freq: number,
  durationSec = 0.65, // Longer sustained duration
  sampleRate = SAMPLE_RATE,
  velocity = 0.85
): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const dry = new Float32Array(n);

  const harmonics = [
    { mult: 1, amp: 1.0 },
    { mult: 2, amp: 0.58 },
    { mult: 3, amp: 0.35 },
    { mult: 4, amp: 0.22 },
    { mult: 5, amp: 0.14 },
    { mult: 6, amp: 0.08 },
    { mult: 7, amp: 0.04 },
  ];

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;

    // Gentle natural vibrato
    const vibFadeIn = Math.min(1, Math.max(0, (t - 0.06) / 0.12));
    const vibrato = 1 + 0.005 * vibFadeIn * Math.sin(2 * Math.PI * 5.1 * t);

    // Warm bowing attack & sustained body
    const bowAtk = Math.min(1, t / 0.05);
    const releaseTime = 0.18;
    const release = t > durationSec - releaseTime ? (durationSec - t) / releaseTime : 1;

    let tone = 0;
    for (const h of harmonics) {
      const harmFreq = h.mult * freq * vibrato;
      tone += h.amp * Math.sin(2 * Math.PI * harmFreq * t);
    }

    dry[i] = tone * bowAtk * Math.max(0, release) * velocity * 0.42;
  }

  // Multi-tap reverb echo line for long atmospheric violin sustain
  const out = new Float32Array(n);
  const tap1 = Math.floor(0.045 * sampleRate);
  const tap2 = Math.floor(0.092 * sampleRate);
  const tap3 = Math.floor(0.145 * sampleRate);

  for (let i = 0; i < n; i++) {
    let s = dry[i];
    if (i >= tap1) s += dry[i - tap1] * 0.38;
    if (i >= tap2) s += dry[i - tap2] * 0.24;
    if (i >= tap3) s += dry[i - tap3] * 0.14;
    out[i] = s;
  }

  return out;
}

/**
 * Flute: Beautiful concert acoustic flute.
 * Produces a velvety, wooden-round tone with soft harmonic overblowing (2nd & 3rd harmonics),
 * subtle breath air chiff on onset, and expressive warm vibrato that gives it a soothing melodic presence.
 */
function synthFlute(
  freq: number,
  durationSec = 0.50,
  sampleRate = SAMPLE_RATE,
  velocity = 0.85
): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;

    // Smooth breath onset: initial air chiff on note attack
    const chiff = Math.sin(2 * Math.PI * (freq * 3.1) * t) * Math.exp(-t * 80) * 0.12;

    // Organic flute vibrato (5.2 Hz rate, gently fading in after attack)
    const vibFade = Math.min(1, Math.max(0, (t - 0.08) / 0.15));
    const vibrato = 1 + 0.006 * vibFade * Math.sin(2 * Math.PI * 5.2 * t);
    const f = freq * vibrato;

    // Natural flute harmonic resonance: dominant pure fundamental + soft 2nd and 3rd harmonics
    const fundamental = Math.sin(2 * Math.PI * f * t);
    const h2 = Math.sin(2 * Math.PI * 2 * f * t) * 0.22;
    const h3 = Math.sin(2 * Math.PI * 3 * f * t) * 0.08;

    // Attack envelope and gentle release
    const attack = Math.min(1, t / 0.045);
    const releaseTime = 0.08;
    const release = t > durationSec - releaseTime ? (durationSec - t) / releaseTime : 1;

    out[i] = (chiff + (fundamental + h2 + h3) * 0.85) * attack * Math.max(0, release) * velocity * 0.68;
  }
  return out;
}

/**
 * Drum: Variety drum kit across key ranges!
 * - Low notes (C4, D4): Deep sub Kick Drum with punchy transient drop
 * - Mid notes (E4, F4, G4): Crispy Snare & Tom with shell ring
 * - High notes (A4, B4, C5, D5): Metallic Splash Cymbal / Hi-Hat sizzle
 */
function synthDrum(
  freq: number,
  durationSec = 0.42,
  sampleRate = SAMPLE_RATE,
  velocity = 0.85
): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);

  if (freq < 330) {
    // ── SOLID PUNCHY KICK DRUM ──
    // Solid mid-punch (sweeping 260Hz down to 95Hz) so it punches clearly on phone speakers,
    // plus a beater impact click (1.8kHz transient) for immediate percussive punch.
    const startFreq = 260;
    const bodyFreq = 95;
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      // Fast pitch sweep delivers a physical thump on small drivers
      const pitch = bodyFreq + (startFreq - bodyFreq) * Math.exp(-t * 55);
      // Hard beater click transient
      const beaterClick = Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 220) * 0.45;
      // Resonant punchy body tone with 2nd harmonic warmth
      const body =
        (Math.sin(2 * Math.PI * pitch * t) * 0.75 +
         Math.sin(2 * Math.PI * pitch * 2 * t) * 0.25) * Math.exp(-t * 11.0);
      out[i] = (beaterClick + body) * velocity * 0.95;
    }
  } else if (freq < 450) {
    // ── SNARE & TOM ──
    const tomFreq = freq * 0.5;
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 28) * 0.55;
      const shell = Math.sin(2 * Math.PI * tomFreq * Math.exp(-t * 18) * t) * Math.exp(-t * 12) * 0.55;
      out[i] = (noise + shell) * velocity * 0.85;
    }
  } else {
    // ── SPLASH CYMBAL / HI-HAT ──
    // Inharmonic metallic noise burst with sizzle decay
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const metalNoise = (Math.random() * 2 - 1);
      const splashChime =
        (Math.sin(2 * Math.PI * 4200 * t) +
         Math.sin(2 * Math.PI * 6300 * t) +
         Math.sin(2 * Math.PI * 8700 * t)) * 0.15;
      const sizzle = (metalNoise * 0.6 + splashChime) * Math.exp(-t * 9.5);
      out[i] = sizzle * velocity * 0.75;
    }
  }

  return out;
}

/** Trumpet: bright brass warmth */
function synthTrumpet(
  freq: number,
  durationSec: number,
  sampleRate: number,
  velocity: number
): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  const harmonics = [
    { mult: 1, amp: 0.6 },
    { mult: 2, amp: 1.0 },
    { mult: 3, amp: 0.75 },
    { mult: 4, amp: 0.5 },
    { mult: 5, amp: 0.3 },
    { mult: 6, amp: 0.15 },
  ];
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const brassAtk = Math.min(1, t / 0.025);
    const rel = t > durationSec - 0.03 ? (durationSec - t) / 0.03 : 1;
    let s = 0;
    for (const h of harmonics) {
      s += h.amp * Math.sin(2 * Math.PI * h.mult * freq * t);
    }
    out[i] = s * brassAtk * Math.max(0, rel) * velocity * 0.45;
  }
  return out;
}

/** Harp: plucked, bright with rich chime decay */
function synthHarp(
  freq: number,
  durationSec: number,
  sampleRate: number,
  velocity: number
): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  const harmonics = [
    { mult: 1, amp: 1.0, decay: 1.8 },
    { mult: 2, amp: 0.5, decay: 2.8 },
    { mult: 3, amp: 0.2, decay: 4.0 },
    { mult: 4, amp: 0.1, decay: 6.0 },
  ];
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let s = 0;
    for (const h of harmonics) {
      s += h.amp * Math.exp(-h.decay * t) * Math.sin(2 * Math.PI * h.mult * freq * t);
    }
    out[i] = s * velocity * 0.7;
  }
  return out;
}

/** Xylophone: pleasant wooden mallet chime */
function synthXylophone(
  freq: number,
  durationSec: number,
  sampleRate: number,
  velocity: number
): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  const harmonics = [
    { mult: 1, amp: 1.0, decay: 8.0 },
    { mult: 2.756, amp: 0.4, decay: 14.0 },
    { mult: 5.404, amp: 0.2, decay: 22.0 },
  ];
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let s = 0;
    for (const h of harmonics) {
      s += h.amp * Math.exp(-h.decay * t) * Math.sin(2 * Math.PI * h.mult * freq * t);
    }
    out[i] = s * velocity * 0.75;
  }
  return out;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Render a single note with the given instrument.
 */
export function renderNote(
  freq: number,
  instrument: SingleInstrumentId,
  durationSec = 0.45,
  sampleRate = SAMPLE_RATE,
  velocity = 0.85
): Float32Array {
  switch (instrument) {
    case 'guitar':    return synthGuitar(freq, durationSec, sampleRate, velocity);
    case 'violin':    return synthViolin(freq, 0.65, sampleRate, velocity);
    case 'flute':     return synthFlute(freq, durationSec, sampleRate, velocity);
    case 'drum':      return synthDrum(freq, durationSec, sampleRate, velocity);
    case 'trumpet':   return synthTrumpet(freq, durationSec, sampleRate, velocity);
    case 'harp':      return synthHarp(freq, durationSec, sampleRate, velocity);
    case 'xylophone': return synthXylophone(freq, durationSec, sampleRate, velocity);
    case 'piano':
    default:          return synthPiano(freq, durationSec, sampleRate, velocity);
  }
}

/**
 * Render a full melody where each node can specify its own instrument.
 */
export function renderTuneWithStepInstruments(
  profile: number[],
  stepInstruments: SingleInstrumentId[],
  sampleRate = SAMPLE_RATE,
  stepDuration = 0.24,
  noteDuration = 0.45
): Float32Array {
  const numSteps = profile.length;
  if (numSteps === 0) return new Float32Array(0);

  const totalDuration = (numSteps - 1) * stepDuration + noteDuration + 0.3; // extra tail for violin reverb
  const totalSamples = Math.ceil(totalDuration * sampleRate);
  const buffer = new Float32Array(totalSamples);

  for (let step = 0; step < numSteps; step++) {
    const key = valueToPianoKey(profile[step]);
    const freq = key.freq;
    const inst = stepInstruments[step % stepInstruments.length] || 'piano';
    const dur = inst === 'violin' ? 0.65 : noteDuration;
    const noteBuffer = renderNote(freq, inst, dur, sampleRate, 0.75);
    const startSample = Math.floor(step * stepDuration * sampleRate);

    for (let i = 0; i < noteBuffer.length; i++) {
      const outIdx = startSample + i;
      if (outIdx < totalSamples) buffer[outIdx] += noteBuffer[i];
    }
  }

  // Normalize
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) {
    const a = Math.abs(buffer[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0.95) {
    const scale = 0.9 / peak;
    for (let i = 0; i < totalSamples; i++) buffer[i] *= scale;
  }

  return buffer;
}
