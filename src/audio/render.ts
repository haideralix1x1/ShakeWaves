import { ANALYZE_FRAMES, sampleCycle } from './wave';
import { SAMPLE_RATE } from './wav';

const CLIP_SECONDS = 2;

function envelope(i: number, total: number): number {
  const attack = total * 0.02;
  const release = total * 0.25;
  if (i < attack) return i / attack;
  if (i > total - release) return (total - i) / release;
  return 1;
}

export const AUDIO_BASE_FREQUENCY = 220;

export interface PianoKeyInfo {
  note: string;
  freq: number;
  value: number;
  isBlack?: boolean;
}

export const PIANO_KEYS: readonly PianoKeyInfo[] = [
  // Octave 3 (Low Bass)
  { note: 'C3',  freq: 130.81, value: -2.75 },
  { note: 'C#3', freq: 138.59, value: -2.625, isBlack: true },
  { note: 'D3',  freq: 146.83, value: -2.5 },
  { note: 'D#3', freq: 155.56, value: -2.375, isBlack: true },
  { note: 'E3',  freq: 164.81, value: -2.25 },
  { note: 'F3',  freq: 174.61, value: -2.0 },
  { note: 'F#3', freq: 185.00, value: -1.875, isBlack: true },
  { note: 'G3',  freq: 196.00, value: -1.75 },
  { note: 'G#3', freq: 207.65, value: -1.625, isBlack: true },
  { note: 'A3',  freq: 220.00, value: -1.5 },
  { note: 'A#3', freq: 233.08, value: -1.375, isBlack: true },
  { note: 'B3',  freq: 246.94, value: -1.25 },

  // Octave 4 (Standard Middle Octave)
  { note: 'C4',  freq: 261.63, value: -1.0 },
  { note: 'C#4', freq: 277.18, value: -0.875, isBlack: true },
  { note: 'D4',  freq: 293.66, value: -0.75 },
  { note: 'D#4', freq: 311.13, value: -0.625, isBlack: true },
  { note: 'E4',  freq: 329.63, value: -0.5 },
  { note: 'F4',  freq: 349.23, value: -0.25 },
  { note: 'F#4', freq: 369.99, value: -0.125, isBlack: true },
  { note: 'G4',  freq: 392.00, value: 0.0 },
  { note: 'G#4', freq: 415.30, value: 0.125, isBlack: true },
  { note: 'A4',  freq: 440.00, value: 0.25 },
  { note: 'A#4', freq: 466.16, value: 0.375, isBlack: true },
  { note: 'B4',  freq: 493.88, value: 0.5 },

  // Octave 5 (Treble)
  { note: 'C5',  freq: 523.25, value: 0.75 },
  { note: 'C#5', freq: 554.37, value: 0.875, isBlack: true },
  { note: 'D5',  freq: 587.33, value: 1.0 },
  { note: 'D#5', freq: 622.25, value: 1.125, isBlack: true },
  { note: 'E5',  freq: 659.25, value: 1.25 },
  { note: 'F5',  freq: 698.46, value: 1.5 },
  { note: 'F#5', freq: 739.99, value: 1.625, isBlack: true },
  { note: 'G5',  freq: 783.99, value: 1.75 },
  { note: 'G#5', freq: 830.61, value: 1.875, isBlack: true },
  { note: 'A5',  freq: 880.00, value: 2.0 },
  { note: 'A#5', freq: 932.33, value: 2.125, isBlack: true },
  { note: 'B5',  freq: 987.77, value: 2.25 },

  // Octave 6 (High Brilliance)
  { note: 'C6',  freq: 1046.50, value: 2.5 },
] as const;

export function valueToPianoKey(val: number): PianoKeyInfo {
  const minVal = PIANO_KEYS[0].value;
  const maxVal = PIANO_KEYS[PIANO_KEYS.length - 1].value;
  const clamped = Math.max(minVal, Math.min(maxVal, val));
  let best: PianoKeyInfo = PIANO_KEYS[0];
  let bestDiff = Infinity;
  for (let i = 0; i < PIANO_KEYS.length; i++) {
    const k = PIANO_KEYS[i];
    const diff = Math.abs(k.value - clamped);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = k;
    }
  }
  return best;
}

export function snapToPianoValue(val: number): number {
  return valueToPianoKey(val).value;
}

/**
 * Synthesizes an authentic acoustic piano note using physical acoustics:
 * hammer transient impact + fundamental + unison string detuning + decaying harmonics.
 */
export function renderPianoNote(
  freq: number,
  durationSec = 0.38,
  sampleRate = SAMPLE_RATE,
  velocity = 0.85
): Float32Array {
  const totalSamples = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(totalSamples);

  const detune1 = 1.0;
  const detune2 = 1.002;
  const detune3 = 0.998;
  const B = 0.0002;

  const harmonics = [
    { mult: 1, amp: 1.0, decayRate: 2.2 },
    { mult: 2, amp: 0.6, decayRate: 3.5 },
    { mult: 3, amp: 0.35, decayRate: 5.0 },
    { mult: 4, amp: 0.2, decayRate: 7.0 },
    { mult: 5, amp: 0.1, decayRate: 9.0 },
    { mult: 6, amp: 0.05, decayRate: 12.0 },
  ];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const hammer = Math.exp(-t * 120) * Math.sin(2 * Math.PI * 800 * t) * 0.12;

    let stringSound = 0;
    for (let h = 0; h < harmonics.length; h++) {
      const harm = harmonics[h];
      const fHarm = harm.mult * freq * Math.sqrt(1 + B * harm.mult * harm.mult);
      const ampDecay = Math.exp(-harm.decayRate * t);
      const tone =
        Math.sin(2 * Math.PI * fHarm * detune1 * t) * 0.4 +
        Math.sin(2 * Math.PI * fHarm * detune2 * t) * 0.3 +
        Math.sin(2 * Math.PI * fHarm * detune3 * t) * 0.3;
      stringSound += harm.amp * ampDecay * tone;
    }

    const attack = Math.min(1, t / 0.003);
    const releaseTime = 0.03;
    const release = t > durationSec - releaseTime ? (durationSec - t) / releaseTime : 1;

    out[i] = (hammer + stringSound * 0.6) * attack * Math.max(0, release) * velocity;
  }
  return out;
}

/**
 * Sequentially renders the full 9-note piano tune from the node profile values.
 * Each node represents one sequential step in the melody.
 */
export function renderTune(
  profile: number[],
  sampleRate = SAMPLE_RATE,
  stepDuration = 0.23,
  noteDuration = 0.4
): Float32Array {
  const numSteps = profile.length;
  if (numSteps === 0) return new Float32Array(0);

  const totalDuration = (numSteps - 1) * stepDuration + noteDuration;
  const totalSamples = Math.ceil(totalDuration * sampleRate);
  const buffer = new Float32Array(totalSamples);

  const detune1 = 1.0;
  const detune2 = 1.002;
  const detune3 = 0.998;
  const B = 0.0002;

  const harmonics = [
    { mult: 1, amp: 1.0, decayRate: 2.2 },
    { mult: 2, amp: 0.6, decayRate: 3.5 },
    { mult: 3, amp: 0.35, decayRate: 5.0 },
    { mult: 4, amp: 0.2, decayRate: 7.0 },
    { mult: 5, amp: 0.1, decayRate: 9.0 },
  ];

  for (let step = 0; step < numSteps; step++) {
    const key = valueToPianoKey(profile[step]);
    const freq = key.freq;
    const startSample = Math.floor(step * stepDuration * sampleRate);
    const noteSamples = Math.floor(noteDuration * sampleRate);

    for (let i = 0; i < noteSamples; i++) {
      const t = i / sampleRate;
      const hammer = Math.exp(-t * 120) * Math.sin(2 * Math.PI * 800 * t) * 0.12;

      let stringSound = 0;
      for (let h = 0; h < harmonics.length; h++) {
        const harm = harmonics[h];
        const fHarm = harm.mult * freq * Math.sqrt(1 + B * harm.mult * harm.mult);
        const ampDecay = Math.exp(-harm.decayRate * t);
        const tone =
          Math.sin(2 * Math.PI * fHarm * detune1 * t) * 0.4 +
          Math.sin(2 * Math.PI * fHarm * detune2 * t) * 0.3 +
          Math.sin(2 * Math.PI * fHarm * detune3 * t) * 0.3;
        stringSound += harm.amp * ampDecay * tone;
      }

      const attack = Math.min(1, t / 0.003);
      const releaseTime = 0.04;
      const release = t > noteDuration - releaseTime ? (noteDuration - t) / releaseTime : 1;
      const sampleVal = (hammer + stringSound * 0.6) * attack * Math.max(0, release) * 0.75;

      const outIdx = startSample + i;
      if (outIdx < totalSamples) {
        buffer[outIdx] += sampleVal;
      }
    }
  }

  // Normalize if peak exceeds 0.95
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) {
    const a = Math.abs(buffer[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0.95) {
    const scale = 0.9 / peak;
    for (let i = 0; i < totalSamples; i++) {
      buffer[i] *= scale;
    }
  }

  return buffer;
}

/**
 * Renders an audible playable clip from a single-cycle table at AUDIO_BASE_FREQUENCY (220 Hz).
 * Applies attack/release envelope to prevent audio pops/clicks.
 */
export function renderClip(
  cycle: Float32Array,
  sampleRate = SAMPLE_RATE,
  frequency = AUDIO_BASE_FREQUENCY
): Float32Array {
  const total = Math.floor(CLIP_SECONDS * sampleRate);
  const out = new Float32Array(total);
  const phaseStep = frequency / sampleRate;
  for (let i = 0; i < total; i++) {
    const phase = i * phaseStep;
    out[i] = sampleCycle(cycle, phase) * envelope(i, total) * 0.85;
  }
  return out;
}

/**
 * Renders a speed-up "reveal" comparison: target clip then player clip,
 * with a short gap, so the ear can compare them back to back.
 */
export function renderComparisonAmp(
  targetCycle: Float32Array,
  playerCycle: Float32Array,
  sampleRate = SAMPLE_RATE
): Float32Array {
  const segment = renderClip(targetCycle, sampleRate);
  const gap = new Float32Array(Math.floor(0.12 * sampleRate));
  const second = renderClip(playerCycle, sampleRate);
  const out = new Float32Array(segment.length * 2 + gap.length);
  out.set(segment, 0);
  out.set(gap, segment.length);
  out.set(second, segment.length + gap.length);
  const total = out.length;
  for (let i = 0; i < total; i++) out[i] *= envelope(i, total);
  return out;
}

export { ANALYZE_FRAMES };
