import * as Haptics from 'expo-haptics';

import { loadClip, playClip } from './player';
import { bufferToAudioUri } from './storage';
import { SAMPLE_RATE } from './wav';
import { renderNote, type InstrumentId, type SingleInstrumentId } from './instruments';
import { getSelectedInstrument } from '../game/InstrumentContext';

// Cached clip IDs for instant zero-latency playback
const instrumentTapClips = new Map<InstrumentId, number>();
let winFanfareClipId: number | null = null;
let failClipId: number | null = null;
let streakDingClipId: number | null = null;

/**
 * Synthesizes a triumphant victory fanfare chord arpeggio.
 * C5 -> E5 -> G5 -> C6 with shimmering chime harmonics.
 */
function synthWinFanfare(): Float32Array {
  const durationSec = 0.85;
  const n = Math.floor(durationSec * SAMPLE_RATE);
  const out = new Float32Array(n);

  const notes = [
    { freq: 523.25, start: 0.00, dur: 0.22, amp: 0.65 }, // C5
    { freq: 659.25, start: 0.10, dur: 0.22, amp: 0.70 }, // E5
    { freq: 783.99, start: 0.20, dur: 0.24, amp: 0.75 }, // G5
    { freq: 1046.50, start: 0.32, dur: 0.50, amp: 0.90 }, // C6 (sustained finale)
    { freq: 1318.51, start: 0.36, dur: 0.45, amp: 0.45 }, // E6 harmonic sparkle
  ];

  for (const note of notes) {
    const startIdx = Math.floor(note.start * SAMPLE_RATE);
    const noteLen = Math.floor(note.dur * SAMPLE_RATE);
    for (let i = 0; i < noteLen; i++) {
      const idx = startIdx + i;
      if (idx >= n) break;
      const t = i / SAMPLE_RATE;
      const fundamental = Math.sin(2 * Math.PI * note.freq * t);
      const chime = Math.sin(2 * Math.PI * (note.freq * 2.01) * t) * 0.35;
      const sparkle = Math.sin(2 * Math.PI * (note.freq * 3.98) * t) * 0.15;
      const env = Math.exp(-t * 6.5);
      out[idx] += (fundamental + chime + sparkle) * env * note.amp * 0.32;
    }
  }

  // Soft peak limiter
  let max = 0;
  for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(out[i]));
  if (max > 0.92) {
    const scale = 0.92 / max;
    for (let i = 0; i < n; i++) out[i] *= scale;
  }

  return out;
}

/**
 * Synthesizes a subtle descending failure sound.
 */
function synthFail(): Float32Array {
  const durationSec = 0.48;
  const n = Math.floor(durationSec * SAMPLE_RATE);
  const out = new Float32Array(n);

  const notes = [
    { freq: 311.13, start: 0.00, dur: 0.18 }, // Eb4
    { freq: 293.66, start: 0.12, dur: 0.18 }, // D4
    { freq: 233.08, start: 0.24, dur: 0.24 }, // Bb3
  ];

  for (const note of notes) {
    const startIdx = Math.floor(note.start * SAMPLE_RATE);
    const noteLen = Math.floor(note.dur * SAMPLE_RATE);
    for (let i = 0; i < noteLen; i++) {
      const idx = startIdx + i;
      if (idx >= n) break;
      const t = i / SAMPLE_RATE;
      const wave = Math.sin(2 * Math.PI * note.freq * t) + Math.sin(2 * Math.PI * (note.freq * 0.5) * t) * 0.4;
      const env = Math.exp(-t * 9.0);
      out[idx] += wave * env * 0.35;
    }
  }
  return out;
}

/**
 * Synthesizes an achievement / streak ding sound.
 */
function synthStreakDing(): Float32Array {
  const durationSec = 0.55;
  const n = Math.floor(durationSec * SAMPLE_RATE);
  const out = new Float32Array(n);

  const f1 = 1318.51; // E6
  const f2 = 1567.98; // G6

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const bell1 = Math.sin(2 * Math.PI * f1 * t);
    const bell2 = Math.sin(2 * Math.PI * f2 * t) * 0.8;
    const ring = Math.sin(2 * Math.PI * (f1 * 2.76) * t) * 0.2;
    const env = Math.exp(-t * 7.5);
    out[i] = (bell1 + bell2 + ring) * env * 0.4;
  }
  return out;
}

function getInstrumentTapClip(inst: InstrumentId): number {
  const cached = instrumentTapClips.get(inst);
  if (cached !== undefined) return cached;

  let buffer: Float32Array;
  if (inst === 'mix') {
    const dur = 0.22;
    const n = Math.floor(dur * SAMPLE_RATE);
    buffer = new Float32Array(n);
    const p1 = renderNote(523.25, 'piano', 0.16, SAMPLE_RATE, 0.75);
    const p2 = renderNote(783.99, 'synth', 0.16, SAMPLE_RATE, 0.65);
    const offset = Math.floor(0.04 * SAMPLE_RATE);
    for (let i = 0; i < p1.length && i < n; i++) buffer[i] += p1[i];
    for (let i = 0; i < p2.length && i + offset < n; i++) buffer[i + offset] += p2[i];
  } else {
    const freq = inst === 'guitar' ? 440.0 : inst === 'harp' ? 587.33 : 523.25;
    const dur = inst === 'drum' ? 0.15 : inst === 'guitar' ? 0.22 : 0.20;
    buffer = renderNote(freq, inst as SingleInstrumentId, dur, SAMPLE_RATE, 0.85);
  }

  const clipId = loadClip(buffer, bufferToAudioUri);
  instrumentTapClips.set(inst, clipId);
  return clipId;
}

/* ------------------------------- Public SFX API ------------------------------- */

/**
 * Plays a signature UI tap staccato note tuned to the selected instrument + subtle haptic feedback.
 */
export function playUiTap(inst?: InstrumentId): void {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // optional
  }
  try {
    const targetInst = inst || getSelectedInstrument();
    const clipId = getInstrumentTapClip(targetInst);
    playClip(clipId, false);
  } catch (err) {
    console.warn('UI tap SFX error:', err);
  }
}

/**
 * Plays a glorious victory fanfare chord + celebratory haptics!
 */
export function playWinFanfare(): void {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // optional
  }
  try {
    if (winFanfareClipId === null) {
      winFanfareClipId = loadClip(synthWinFanfare(), bufferToAudioUri);
    }
    playClip(winFanfareClipId, false);
  } catch (err) {
    console.warn('Win fanfare SFX error:', err);
  }
}

/**
 * Plays a soft fail sound + error haptics.
 */
export function playFailSound(): void {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // optional
  }
  try {
    if (failClipId === null) {
      failClipId = loadClip(synthFail(), bufferToAudioUri);
    }
    playClip(failClipId, false);
  } catch (err) {
    console.warn('Fail SFX error:', err);
  }
}

/**
 * Plays an achievement ding sound.
 */
export function playStreakDing(): void {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch {
    // optional
  }
  try {
    if (streakDingClipId === null) {
      streakDingClipId = loadClip(synthStreakDing(), bufferToAudioUri);
    }
    playClip(streakDingClipId, false);
  } catch (err) {
    console.warn('Streak ding SFX error:', err);
  }
}
