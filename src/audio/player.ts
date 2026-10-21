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

const nativePlayers = new Map<number, AudioPlayer>();

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
 * Playback mechanism is chosen per platform.
 */
export function loadClip(samples: Float32Array, uriFactory: (s: Float32Array) => string): number {
  const id = nextId++;
  const clip: Clip = { samples, nativeId: null };
  if (Platform.OS !== 'web') {
    clip.nativeId = id;
    const uri = uriFactory(samples);
    clip.uri = uri;
    nativePlayers.set(id, createAudioPlayer({ uri }));
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
  const player = clip.nativeId !== null ? nativePlayers.get(clip.nativeId) : undefined;
  if (!player) return;
  try {
    player.loop = loop;
    const res = player.seekTo(0);
    if (res && typeof (res as Promise<void>).then === 'function') {
      (res as Promise<void>).then(() => player.play()).catch(() => player.play());
      return;
    }
  } catch {
    // player may still be loading; play() will start from 0
  }
  player.play();
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
  if (!clip?.nativeId) return;
  const player = nativePlayers.get(clip.nativeId);
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
  if (Platform.OS === 'web') {
    if (webClipId === id) stopWeb();
    return;
  }
  if (!clip?.nativeId) return;
  const player = nativePlayers.get(clip.nativeId);
  nativePlayers.delete(clip.nativeId);
  try {
    player?.remove();
  } catch {
    // ignore
  }
  if (clip.uri && clip.uri.startsWith('file://')) {
    try {
      new File(clip.uri).delete();
    } catch {
      // ignore
    }
  }
}

export function isClipPlaying(id: number): boolean {
  if (Platform.OS === 'web') return webClipId === id;
  const clip = clips.get(id);
  if (!clip?.nativeId) return false;
  return !!nativePlayers.get(clip.nativeId)?.playing;
}
