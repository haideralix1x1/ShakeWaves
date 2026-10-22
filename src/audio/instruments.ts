import { SAMPLE_RATE } from './wav';
import { valueToPianoKey } from './render';

// ─── Instrument types ────────────────────────────────────────────────────────

export type SingleInstrumentId =
  | 'piano'
  | 'guitar'
  | 'accordion'
  | 'synth'
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
  'accordion',
  'synth',
  'drum',
  'trumpet',
  'harp',
  'xylophone',
];

export const INSTRUMENTS: Instrument[] = [
  { id: 'piano',     label: 'Piano',      emoji: '🎹', color: '#ff3df0' },
  { id: 'guitar',    label: 'Guitar',     emoji: '🎸', color: '#ffd166' },
  { id: 'accordion', label: 'Accordion',  emoji: '🪗', color: '#ff9e00' },
  { id: 'synth',     label: 'Synth Lead', emoji: '🎛️', color: '#00e5ff' },
  { id: 'drum',      label: 'Drum',       emoji: '🥁', color: '#e11d48' },
  { id: 'trumpet',   label: 'Trumpet',    emoji: '🎺', color: '#fbbf24' },
  { id: 'harp',      label: 'Harp',       emoji: '🪕', color: '#34d399' },
  { id: 'xylophone', label: 'Xylophone',  emoji: '🔔', color: '#38bdf8' },
  { id: 'mix',       label: 'Mix Mode',   emoji: '🔀', color: '#00f5d4' },
];

/**
 * For a given level in Mix Mode, pick a curated, pleasant combination
 * of 2 to 4 instruments (not necessarily all 8) so the melody sounds cohesive.
 */
export function generateCuratedMixForLevel(streakIndex: number, noteCount = 9): SingleInstrumentId[] {
  const harmonicPalettes: SingleInstrumentId[][] = [
    ['piano', 'accordion', 'harp'],           // European acoustic elegance & strings
    ['guitar', 'synth', 'harp'],              // Warm acoustic & retro neon lead
    ['drum', 'piano', 'accordion'],           // Rhythmic European melodic chamber
    ['synth', 'xylophone', 'piano'],          // Playful cyber neon & acoustic
    ['harp', 'drum', 'accordion'],            // Rhythmic European folk & harp
    ['piano', 'guitar', 'synth'],             // Contemporary synthwave pop trio
    ['trumpet', 'piano', 'drum'],             // Punchy brass & beats
    ['guitar', 'synth', 'accordion', 'drum'], // Full eclectic ensemble
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
 * Accordion: European acoustic reed sound.
 * Features free-reed vibratory harmonics with dual-reed (musette) beating detune,
 * warm acoustic bellow swells, and characteristic European cafe/folk resonance.
 */
function synthAccordion(
  freq: number,
  durationSec = 0.52,
  sampleRate = SAMPLE_RATE,
  velocity = 0.85
): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);

  // Free-reed harmonic profile (prominent odd harmonics with warm even presence)
  const reedHarmonics = [
    { mult: 1, amp: 1.0 },
    { mult: 2, amp: 0.65 },
    { mult: 3, amp: 0.52 },
    { mult: 4, amp: 0.30 },
    { mult: 5, amp: 0.22 },
    { mult: 6, amp: 0.12 },
    { mult: 7, amp: 0.08 },
  ];

  // Musette detuning: two reeds vibrating slightly apart (2.4 Hz beat) creates authentic accordion shimmer
  const beatHz = 2.4;
  const detuneRatio = (freq + beatHz) / freq;

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;

    // Bellows pressure onset and release
    const attack = Math.min(1, t / 0.035);
    const releaseTime = 0.06;
    const release = t > durationSec - releaseTime ? (durationSec - t) / releaseTime : 1;
    const bellows = attack * Math.max(0, release);

    let reed1 = 0;
    let reed2 = 0;
    for (const h of reedHarmonics) {
      const f1 = h.mult * freq;
      const f2 = h.mult * freq * detuneRatio;
      reed1 += h.amp * Math.sin(2 * Math.PI * f1 * t);
      reed2 += h.amp * Math.sin(2 * Math.PI * f2 * t);
    }

    // Blend primary reed and musette secondary reed (European accordion tremolo)
    const combined = reed1 * 0.55 + reed2 * 0.45;
    // Slight reed saturation warmth
    const saturated = Math.tanh(combined * 1.2);

    out[i] = saturated * bellows * velocity * 0.48;
  }
  return out;
}

/**
 * Synth Lead: Punchy retro neon synthesizer lead.
 * Dual detuned analog oscillators (saw + pulse wave) with resonant low-pass filter sweep envelope
 * and subtle analog drive for that punchy cyberpunk / synthwave lead sound.
 */
function synthLead(
  freq: number,
  durationSec = 0.48,
  sampleRate = SAMPLE_RATE,
  velocity = 0.85
): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);

  // Subtle analog oscillator drift / detuning (fat dual oscillator sound)
  const detune = 1.006;
  let phase1 = 0;
  let phase2 = 0;
  let filterState = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;

    phase1 += freq / sampleRate;
    if (phase1 >= 1) phase1 -= 1;

    phase2 += (freq * detune) / sampleRate;
    if (phase2 >= 1) phase2 -= 1;

    // Oscillator 1: Sawtooth wave
    const saw = 2 * phase1 - 1;
    // Oscillator 2: Pulse wave with 40% duty cycle
    const pulse = phase2 < 0.4 ? 1 : -1;

    const rawOsc = saw * 0.6 + pulse * 0.4;

    // Dynamic resonant filter cutoff sweep: opens up bright on attack, decays to warm body
    const filterEnv = Math.exp(-t * 8.0);
    const cutoffNorm = Math.min(0.85, 0.18 + 0.65 * filterEnv);

    // 1-pole lowpass filter simulation
    filterState += cutoffNorm * (rawOsc - filterState);

    // Snappy attack & musical decay envelope
    const attack = Math.min(1, t / 0.012);
    const releaseTime = 0.08;
    const release = t > durationSec - releaseTime ? (durationSec - t) / releaseTime : 1;
    const ampEnv = attack * Math.max(0, release) * Math.exp(-t * 0.8);

    // Analog drive saturation
    const driven = Math.tanh(filterState * 1.5);
    out[i] = driven * ampEnv * velocity * 0.55;
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
    case 'accordion': return synthAccordion(freq, 0.52, sampleRate, velocity);
    case 'synth':     return synthLead(freq, 0.48, sampleRate, velocity);
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

  const totalDuration = (numSteps - 1) * stepDuration + noteDuration + 0.3;
  const totalSamples = Math.ceil(totalDuration * sampleRate);
  const buffer = new Float32Array(totalSamples);

  for (let step = 0; step < numSteps; step++) {
    const key = valueToPianoKey(profile[step]);
    const freq = key.freq;
    const inst = stepInstruments[step % stepInstruments.length] || 'piano';
    const dur = inst === 'accordion' ? 0.52 : (inst === 'synth' ? 0.48 : noteDuration);
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
