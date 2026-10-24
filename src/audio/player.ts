import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File } from 'expo-file-system';

import { SAMPLE_RATE } from './wav';

let configured = false;

export async function configureAudio(): Promise<void> {
  if (configured) return;
  configured = true;
  if (Platform.OS === 'web') {
    resumeWebAudio();
    return;
  }
  try {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
  } catch {
    // ignore on platforms without audio mode support
  }
}

/* ------------------------------- Web Audio ------------------------------- */

let webCtx: AudioContext | null = null;
let webSource: AudioBufferSourceNode | null = null;

function resumeWebAudio(): void {
  if (Platform.OS !== 'web') return;
  const Ctor =
    (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  if (!webCtx) webCtx = new Ctor();
  if (webCtx.state === 'suspended') webCtx.resume().catch(() => undefined);
}

function toAudioBuffer(ctx: AudioContext, samples: Float32Array): AudioBuffer {
  const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
  try {
    buffer.getChannelData(0).set(samples);
  } catch {
    buffer.copyToChannel(new Float32Array(samples), 0);
  }
  return buffer;
}

/* ------------------------------ Native (expo-audio) ------------------------------ */

// Max 8 concurrent note players for polyphony (piano chords, glissando, drum hits)
const NOTE_POOL_SIZE = 8;
const notePlayerPool: AudioPlayer[] = [];
let notePoolIndex = 0;
const notePlayerUris = new Map<AudioPlayer, string>();

// Max 2 players for longer melody previews / loops (Target, Mine, Timeline)
const PREVIEW_POOL_SIZE = 2;
const previewPlayerPool: AudioPlayer[] = [];
let previewPoolIndex = 0;
const previewPlayerUris = new Map<AudioPlayer, string>();

// Maps active clip ID to the player currently playing it
const clipPlayerMap = new Map<number, AudioPlayer>();

/* --------------------------------- Registry --------------------------------- */

interface Clip {
  samples: Float32Array;
  nativeId: number | null;
  uri?: string;
}

const clips = new Map<number, Clip>();
let nextId = 1;
let webClipId: number | null = null;

/**
 * Registers a raw PCM clip and returns an id used by play/stop/release.
 * On native, writes the audio file but does NOT allocate a native ExoPlayer
 * until playback is requested, keeping native AudioTrack count strictly bounded.
 */
export function loadClip(samples: Float32Array, uriFactory: (s: Float32Array) => string): number {
  const id = nextId++;
  const clip: Clip = { samples, nativeId: id };
  if (Platform.OS !== 'web') {
    clip.uri = uriFactory(samples);
  }
  clips.set(id, clip);
  return id;
}

export function playClip(id: number, loop = false, onEnd?: () => void): void {
  const clip = clips.get(id);
  if (!clip) return;
  if (Platform.OS === 'web') {
    playWeb(clip.samples, id, loop, onEnd);
    return;
  }
  if (!clip.uri) return;

  try {
    let player: AudioPlayer;

    if (loop || onEnd) {
      // Use preview player pool for loops / long arrangements
      if (previewPlayerPool.length < PREVIEW_POOL_SIZE) {
        player = createAudioPlayer({ uri: clip.uri });
        previewPlayerUris.set(player, clip.uri);
        previewPlayerPool.push(player);
      } else {
        player = previewPlayerPool[previewPoolIndex];
        previewPoolIndex = (previewPoolIndex + 1) % PREVIEW_POOL_SIZE;
        if (previewPlayerUris.get(player) !== clip.uri) {
          previewPlayerUris.set(player, clip.uri);
          player.replace({ uri: clip.uri });
        }
      }
    } else {
      // Use bounded note player pool for rapid instrument notes / glissando
      if (notePlayerPool.length < NOTE_POOL_SIZE) {
        player = createAudioPlayer({ uri: clip.uri });
        notePlayerUris.set(player, clip.uri);
        notePlayerPool.push(player);
      } else {
        player = notePlayerPool[notePoolIndex];
        notePoolIndex = (notePoolIndex + 1) % NOTE_POOL_SIZE;
        if (notePlayerUris.get(player) !== clip.uri) {
          notePlayerUris.set(player, clip.uri);
          player.replace({ uri: clip.uri });
        }
      }
    }

    clipPlayerMap.set(id, player);
    player.loop = loop;

    if (onEnd) {
      let sub: any = null;
      const onStatus = (status: any) => {
        if (status?.didJustFinish) {
          sub?.remove?.();
          onEnd();
        }
      };
      sub = player.addListener('playbackStatusUpdate', onStatus);
    }

    player.seekTo(0);
    player.play();
  } catch {
    // ignore native play errors
  }
}

function playWeb(samples: Float32Array, id: number, loop = false, onEnd?: () => void): void {
  resumeWebAudio();
  if (!webCtx) return;
  const ctx = webCtx;
  const startSource = () => {
    try {
      if (webSource) {
        webSource.onended = null;
        webSource.stop();
      }
    } catch {
      // ignore
    }
    const source = ctx.createBufferSource();
    source.buffer = toAudioBuffer(ctx, samples);
    source.loop = loop;
    source.connect(ctx.destination);
    source.onended = () => {
      if (webClipId === id) webClipId = null;
      if (!loop) onEnd?.();
    };
    webClipId = id;
    webSource = source;
    try {
      source.start(0);
    } catch {
      source.start();
    }
  };
  if (ctx.state === 'suspended') {
    ctx.resume().then(startSource).catch(() => {
      startSource();
    });
  } else {
    startSource();
  }
}

export function stopClip(id: number): void {
  const clip = clips.get(id);
  if (Platform.OS === 'web') {
    if (webClipId === id) stopWeb();
    return;
  }
  if (!clip) return;
  const player = clipPlayerMap.get(id);
  if (!player) return;
  try {
    player.loop = false;
    player.pause();
    player.seekTo(0);
  } catch {
    // ignore
  }
}

function stopWeb(): void {
  try {
    webSource?.stop();
  } catch {
    // ignore
  }
  webSource = null;
  webClipId = null;
}

export function releaseClip(id: number): void {
  const clip = clips.get(id);
  clips.delete(id);
  clipPlayerMap.delete(id);
  if (Platform.OS === 'web') {
    if (webClipId === id) stopWeb();
    return;
  }
  if (clip?.uri && clip.uri.startsWith('file://')) {
    try {
      new File(clip.uri).delete();
    } catch {
      // ignore
    }
  }
}

export function isClipPlaying(id: number): boolean {
  if (Platform.OS === 'web') return webClipId === id;
  const player = clipPlayerMap.get(id);
  return !!player?.playing;
}
