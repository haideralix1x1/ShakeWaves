import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { SingleInstrumentId, renderNote } from './instruments';
import { SAMPLE_RATE, encodeWavPcm16 } from './wav';
import { loadClip, playClip } from './player';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface PracticeNoteEvent {
  id: string;
  inst: SingleInstrumentId;
  note: string;
  freq: number;
  timestampSec: number; // offset in seconds from recording start
  durationSec: number;
  velocity?: number;
}

export interface SavedLoopClip {
  id: string;
  name: string;
  instrument: SingleInstrumentId;
  durationSec: number;
  events: PracticeNoteEvent[];
  color: string;
  emoji: string;
  samples: Float32Array;
  audioUri?: string;
  clipId?: number;
}

export interface TimelineClipPlacement {
  id: string; // unique placement id
  loopId: string; // references SavedLoopClip.id
  trackId: string;
  startSec: number; // timeline start position in seconds (0.0 .. 60.0)
}

export interface LayerTrack {
  id: string;
  name: string;
  instrumentType: string;
  color: string;
  emoji: string;
  muted: boolean;
  solo: boolean;
  volume: number; // 0.0 .. 1.0
}

// ─── Chromatic & Piano Note Utilities ───────────────────────────────────────

export interface PianoKeyData {
  note: string;
  octave: number;
  midi: number;
  freq: number;
  isBlack: boolean;
  whiteIndex: number; // index among white keys for positioning
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Generates keys for a given octave range.
 * Defaults to 2 octaves starting at baseOctave (e.g. Octave 4: C4 to B5 + C6).
 */
export function getPianoKeys(baseOctave = 4, numOctaves = 2): PianoKeyData[] {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const keys: PianoKeyData[] = [];
  let whiteCount = 0;

  for (let oct = 0; oct < numOctaves; oct++) {
    const currentOctave = baseOctave + oct;
    for (let i = 0; i < 12; i++) {
      const midi = (currentOctave + 1) * 12 + i;
      const isBlack = noteNames[i].includes('#');
      keys.push({
        note: `${noteNames[i]}${currentOctave}`,
        octave: currentOctave,
        midi,
        freq: midiToFreq(midi),
        isBlack,
        whiteIndex: isBlack ? whiteCount - 1 : whiteCount++,
      });
    }
  }

  // Add final tonic C
  const finalOctave = baseOctave + numOctaves;
  const finalMidi = (finalOctave + 1) * 12;
  keys.push({
    note: `C${finalOctave}`,
    octave: finalOctave,
    midi: finalMidi,
    freq: midiToFreq(finalMidi),
    isBlack: false,
    whiteIndex: whiteCount++,
  });

  return keys;
}

// ─── Drum Pad Definitions & Synthesis ───────────────────────────────────────

export interface DrumPadData {
  id: string;
  label: string;
  sub: string;
  emoji: string;
  color: string;
  type:
    | 'kick'
    | 'high_kick'
    | 'clap'
    | 'snare'
    | 'fat_snare'
    | 'sidestick'
    | 'low_tom'
    | 'mid_tom'
    | 'high_tom'
    | 'hihat'
    | 'open_hihat'
    | 'pedal_hihat'
    | 'splash'
    | 'crash'
    | 'ride'
    | 'cowbell';
  freq: number;
}

export const PRACTICE_DRUM_PADS: DrumPadData[] = [
  { id: 'kick',        label: 'SUB KICK',    sub: 'Deep 808 Sub',  emoji: '🥁', color: '#ef4444', type: 'kick',        freq: 55 },
  { id: 'high_kick',   label: 'PUNCH KICK',  sub: 'Hard Acoustic', emoji: '🥊', color: '#f97316', type: 'high_kick',   freq: 110 },
  { id: 'snare',       label: 'CRISP SNARE', sub: 'Rimshot Snap',  emoji: '🎯', color: '#10b981', type: 'snare',       freq: 240 },
  { id: 'fat_snare',   label: 'FAT SNARE',   sub: 'Heavy Body',    emoji: '💥', color: '#14b8a6', type: 'fat_snare',   freq: 180 },
  { id: 'sidestick',   label: 'SIDE STICK',  sub: 'Wooden Click',  emoji: '🥢', color: '#84cc16', type: 'sidestick',   freq: 1800 },
  { id: 'clap',        label: '808 CLAP',    sub: 'Layered Slap',  emoji: '👏', color: '#eab308', type: 'clap',        freq: 1200 },
  { id: 'hihat',       label: 'CLOSED HAT',  sub: 'Tight Metal',   emoji: '🎩', color: '#8b5cf6', type: 'hihat',       freq: 8500 },
  { id: 'open_hihat',  label: 'OPEN HAT',    sub: 'Sizzle Wash',   emoji: '✨', color: '#a855f7', type: 'open_hihat',  freq: 9200 },
  { id: 'pedal_hihat', label: 'PEDAL HAT',   sub: 'Foot Chic',     emoji: '👞', color: '#6366f1', type: 'pedal_hihat', freq: 7500 },
  { id: 'low_tom',     label: 'LOW TOM',     sub: 'Deep Shell',    emoji: '🪘', color: '#06b6d4', type: 'low_tom',     freq: 120 },
  { id: 'mid_tom',     label: 'MID TOM',     sub: 'Warm Shell',    emoji: '🪘', color: '#0284c7', type: 'mid_tom',     freq: 155 },
  { id: 'high_tom',    label: 'HIGH TOM',    sub: 'Bright Shell',  emoji: '🪘', color: '#3b82f6', type: 'high_tom',    freq: 195 },
  { id: 'crash',       label: 'CRASH',       sub: 'Explosive Cym', emoji: '⚡', color: '#f43f5e', type: 'crash',       freq: 4600 },
  { id: 'ride',        label: 'RIDE BELL',   sub: 'Metallic Ping', emoji: '🛎️', color: '#ec4899', type: 'ride',        freq: 3200 },
  { id: 'splash',      label: 'SPLASH',      sub: 'Shimmer Cym',   emoji: '💫', color: '#d946ef', type: 'splash',      freq: 6200 },
  { id: 'cowbell',     label: 'COWBELL',     sub: '808 Percussion',emoji: '🔔', color: '#fbbf24', type: 'cowbell',     freq: 840 },
];

/** Hand clap: 3 rapid burst transients + filtered noise tail */
function synthClap(durationSec = 0.38, sampleRate = SAMPLE_RATE, velocity = 0.85): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  const burstTimes = [0, 0.011, 0.023]; // 3 quick bursts

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let s = 0;
    // Early bursts
    for (const bt of burstTimes) {
      if (t >= bt && t < bt + 0.018) {
        const dt = t - bt;
        const noise = (Math.random() * 2 - 1);
        s += noise * Math.exp(-dt * 260) * 0.45;
      }
    }
    // Main clap body noise
    if (t >= 0.02) {
      const dt = t - 0.02;
      const noise = (Math.random() * 2 - 1);
      const bandFilter = Math.sin(2 * Math.PI * 1250 * t);
      s += noise * bandFilter * Math.exp(-dt * 32) * 0.75;
    }
    out[i] = s * velocity;
  }
  return out;
}

/** Punchy high kick: fast pitch sweep from 220Hz down to 80Hz + hard click */
function synthHighKick(durationSec = 0.35, sampleRate = SAMPLE_RATE, velocity = 0.85): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const click = Math.sin(2 * Math.PI * 2200 * t) * Math.exp(-t * 260) * 0.5;
    const pitch = 78 + (220 - 78) * Math.exp(-t * 60);
    const body = Math.sin(2 * Math.PI * pitch * t) * Math.exp(-t * 14) * 0.85;
    out[i] = (click + body) * velocity;
  }
  return out;
}

/** Deep sub kick: massive low 55Hz punch */
function synthSubKick(durationSec = 0.45, sampleRate = SAMPLE_RATE, velocity = 0.9): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const click = Math.sin(2 * Math.PI * 1500 * t) * Math.exp(-t * 300) * 0.4;
    const pitch = 55 + 130 * Math.exp(-t * 45);
    const sub = (Math.sin(2 * Math.PI * pitch * t) * 0.8 + Math.sin(2 * Math.PI * pitch * 2 * t) * 0.2) * Math.exp(-t * 8.5);
    out[i] = (click + sub) * velocity;
  }
  return out;
}

/** Crisp Snare */
function synthSnare(durationSec = 0.38, sampleRate = SAMPLE_RATE, velocity = 0.85): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const shell = Math.sin(2 * Math.PI * 190 * Math.exp(-t * 15) * t) * Math.exp(-t * 18) * 0.45;
    const noise = (Math.random() * 2 - 1) * Math.exp(-t * 28) * 0.65;
    out[i] = (shell + noise) * velocity;
  }
  return out;
}

/** Resonant Tom */
function synthTom(freq: number, durationSec = 0.42, sampleRate = SAMPLE_RATE, velocity = 0.85): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const pitch = freq * (1 + 0.6 * Math.exp(-t * 22));
    const tone = Math.sin(2 * Math.PI * pitch * t) * Math.exp(-t * 9);
    const impact = (Math.random() * 2 - 1) * Math.exp(-t * 140) * 0.25;
    out[i] = (tone + impact) * velocity;
  }
  return out;
}

/** Tight Hi-Hat */
function synthHiHat(durationSec = 0.12, sampleRate = SAMPLE_RATE, velocity = 0.75): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const noise = (Math.random() * 2 - 1);
    const sizzle = (Math.sin(2 * Math.PI * 7800 * t) + Math.sin(2 * Math.PI * 10500 * t)) * 0.25;
    out[i] = (noise * 0.75 + sizzle) * Math.exp(-t * 65) * velocity;
  }
  return out;
}

/** Splash / Crash */
function synthCymbal(isCrash = false, sampleRate = SAMPLE_RATE, velocity = 0.8): Float32Array {
  const dur = isCrash ? 0.85 : 0.45;
  const n = Math.floor(dur * sampleRate);
  const out = new Float32Array(n);
  const decayRate = isCrash ? 5.2 : 9.5;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const metal = (Math.random() * 2 - 1) * 0.75 +
      (Math.sin(2 * Math.PI * 3400 * t) + Math.sin(2 * Math.PI * 5600 * t) + Math.sin(2 * Math.PI * 8200 * t)) * 0.25;
    out[i] = metal * Math.exp(-t * decayRate) * velocity;
  }
  return out;
}

/** Heavy fat snare */
function synthFatSnare(durationSec = 0.45, sampleRate = SAMPLE_RATE, velocity = 0.9): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const tone = Math.sin(2 * Math.PI * 175 * Math.exp(-t * 12) * t) * Math.exp(-t * 12) * 0.55;
    const bodyNoise = (Math.random() * 2 - 1) * Math.exp(-t * 20) * 0.7;
    out[i] = (tone + bodyNoise) * velocity;
  }
  return out;
}

/** Wooden side-stick rim click */
function synthSideStick(durationSec = 0.18, sampleRate = SAMPLE_RATE, velocity = 0.85): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const click = Math.sin(2 * Math.PI * 1850 * t) * Math.exp(-t * 160) * 0.7;
    const resonantWood = Math.sin(2 * Math.PI * 820 * t) * Math.exp(-t * 55) * 0.4;
    out[i] = (click + resonantWood) * velocity;
  }
  return out;
}

/** Open Sizzling Hi-Hat */
function synthOpenHiHat(durationSec = 0.42, sampleRate = SAMPLE_RATE, velocity = 0.8): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const noise = (Math.random() * 2 - 1);
    const sizzle = (Math.sin(2 * Math.PI * 7200 * t) + Math.sin(2 * Math.PI * 9800 * t)) * 0.3;
    out[i] = (noise * 0.7 + sizzle) * Math.exp(-t * 14) * velocity;
  }
  return out;
}

/** Ride cymbal bell ping */
function synthRide(durationSec = 0.75, sampleRate = SAMPLE_RATE, velocity = 0.8): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const bell1 = Math.sin(2 * Math.PI * 3150 * t) * 0.45;
    const bell2 = Math.sin(2 * Math.PI * 5200 * t) * 0.35;
    const shimmer = (Math.random() * 2 - 1) * 0.25;
    out[i] = (bell1 + bell2 + shimmer) * Math.exp(-t * 6.5) * velocity;
  }
  return out;
}

/** 808 Cowbell */
function synthCowbell(durationSec = 0.32, sampleRate = SAMPLE_RATE, velocity = 0.85): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const f1 = Math.sin(2 * Math.PI * 587 * t) > 0 ? 1 : -1;
    const f2 = Math.sin(2 * Math.PI * 845 * t) > 0 ? 1 : -1;
    const squareMix = (f1 + f2) * 0.35;
    const bandTone = Math.sin(2 * Math.PI * 715 * t) * 0.45;
    out[i] = (squareMix + bandTone) * Math.exp(-t * 22) * velocity;
  }
  return out;
}

export function renderDrumPadSound(type: DrumPadData['type'], sampleRate = SAMPLE_RATE): Float32Array {
  switch (type) {
    case 'kick':        return synthSubKick(0.45, sampleRate);
    case 'high_kick':   return synthHighKick(0.35, sampleRate);
    case 'clap':        return synthClap(0.38, sampleRate);
    case 'snare':       return synthSnare(0.38, sampleRate);
    case 'fat_snare':   return synthFatSnare(0.42, sampleRate);
    case 'sidestick':   return synthSideStick(0.18, sampleRate);
    case 'low_tom':     return synthTom(120, 0.45, sampleRate);
    case 'mid_tom':     return synthTom(155, 0.42, sampleRate);
    case 'high_tom':    return synthTom(195, 0.40, sampleRate);
    case 'hihat':       return synthHiHat(0.12, sampleRate);
    case 'open_hihat':  return synthOpenHiHat(0.42, sampleRate);
    case 'pedal_hihat': return synthHiHat(0.08, sampleRate, 0.65);
    case 'splash':      return synthCymbal(false, sampleRate);
    case 'crash':       return synthCymbal(true, sampleRate);
    case 'ride':        return synthRide(0.75, sampleRate);
    case 'cowbell':     return synthCowbell(0.32, sampleRate);
    default:            return synthSubKick(0.45, sampleRate);
  }
}

// ─── Playback & Note Rendering ──────────────────────────────────────────────

/**
 * Plays a drum pad sound instantly.
 */
export function playDrumPad(pad: DrumPadData): void {
  const samples = renderDrumPadSound(pad.type);
  const clipId = loadClip(samples, (s) => {
    // For native cache write
    try {
      if (Paths?.cache) {
        const bytes = encodeWavPcm16([s]);
        const file = new File(Paths.cache, `drum_${pad.id}_${Date.now()}.wav`);
        file.create({ overwrite: true });
        file.writeSync(bytes);
        return file.uri;
      }
    } catch {
      // fallback
    }
    return '';
  });
  playClip(clipId, false);
}

/**
 * Plays any melodic instrument note instantly.
 */
export function playMelodicNote(freq: number, instrument: SingleInstrumentId, durationSec = 0.45): void {
  const samples = renderNote(freq, instrument, durationSec);
  const clipId = loadClip(samples, (s) => {
    try {
      if (Paths?.cache) {
        const bytes = encodeWavPcm16([s]);
        const file = new File(Paths.cache, `note_${instrument}_${Date.now()}.wav`);
        file.create({ overwrite: true });
        file.writeSync(bytes);
        return file.uri;
      }
    } catch {
      // fallback
    }
    return '';
  });
  playClip(clipId, false);
}

// ─── Sequence & Loop Rendering ──────────────────────────────────────────────

/**
 * Renders a list of recorded note events into a single continuous Float32Array PCM buffer.
 */
export function renderPracticeEvents(
  events: PracticeNoteEvent[],
  totalDurationSec: number,
  sampleRate = SAMPLE_RATE
): Float32Array {
  const effectiveDur = Math.max(1.0, Math.min(60.0, totalDurationSec));
  const totalSamples = Math.ceil(effectiveDur * sampleRate);
  const buffer = new Float32Array(totalSamples);

  for (const ev of events) {
    let noteSamples: Float32Array;
    if (ev.inst === 'drum') {
      const pad = PRACTICE_DRUM_PADS.find((p) => p.id === ev.note || p.freq === ev.freq);
      noteSamples = pad ? renderDrumPadSound(pad.type, sampleRate) : renderNote(ev.freq, 'drum', ev.durationSec, sampleRate);
    } else {
      noteSamples = renderNote(ev.freq, ev.inst, ev.durationSec, sampleRate);
    }

    const startSample = Math.floor(ev.timestampSec * sampleRate);
    for (let i = 0; i < noteSamples.length; i++) {
      const idx = startSample + i;
      if (idx < totalSamples) {
        buffer[idx] += noteSamples[i];
      }
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

/**
 * Mixes all placed loop clips across all tracks on the 60-second timeline.
 */
export function renderTimelineMix(
  tracks: LayerTrack[],
  placements: TimelineClipPlacement[],
  savedLoops: SavedLoopClip[],
  totalDurationSec = 60.0,
  sampleRate = SAMPLE_RATE
): Float32Array {
  const totalSamples = Math.ceil(totalDurationSec * sampleRate);
  const masterBuffer = new Float32Array(totalSamples);

  const loopMap = new Map<string, SavedLoopClip>();
  for (const loop of savedLoops) {
    loopMap.set(loop.id, loop);
  }

  const trackMap = new Map<string, LayerTrack>();
  for (const tr of tracks) {
    trackMap.set(tr.id, tr);
  }

  const hasSolo = tracks.some((t) => t.solo);

  for (const pl of placements) {
    const tr = trackMap.get(pl.trackId);
    if (!tr) continue;
    if (tr.muted) continue;
    if (hasSolo && !tr.solo) continue;

    const loop = loopMap.get(pl.loopId);
    if (!loop || !loop.samples) continue;

    const startSample = Math.floor(pl.startSec * sampleRate);
    const volume = tr.volume;

    for (let i = 0; i < loop.samples.length; i++) {
      const idx = startSample + i;
      if (idx < totalSamples) {
        masterBuffer[idx] += loop.samples[i] * volume;
      }
    }
  }

  // Normalize
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) {
    const a = Math.abs(masterBuffer[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0.95) {
    const scale = 0.9 / peak;
    for (let i = 0; i < totalSamples; i++) masterBuffer[i] *= scale;
  }

  return masterBuffer;
}

// ─── File Export / Saving System ────────────────────────────────────────────

/**
 * Encodes samples to WAV and provides native sharing / web file download.
 */
export async function exportWavFile(
  samples: Float32Array,
  filename = 'ShakeWaves_Practice_Track.wav'
): Promise<{ success: boolean; uri?: string; message: string }> {
  try {
    const bytes = encodeWavPcm16([samples]);

    if (Platform.OS === 'web') {
      // Browser download
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { success: true, uri: url, message: `Downloaded "${filename}" successfully!` };
    }

    // Native (iOS / Android)
    const targetDir = Paths.document || Paths.cache;
    if (!targetDir) {
      return { success: false, message: 'File storage path unavailable.' };
    }

    const file = new File(targetDir, filename);
    file.create({ overwrite: true });
    file.writeSync(bytes);

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'audio/wav',
        dialogTitle: `Save or Share ${filename}`,
        UTI: 'com.microsoft.waveform-audio',
      });
      return { success: true, uri: file.uri, message: `File ready to save: ${filename}` };
    } else {
      return { success: true, uri: file.uri, message: `Saved locally to ${file.uri}` };
    }
  } catch (err: unknown) {
    console.error('Export failed:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Unknown export error.',
    };
  }
}
