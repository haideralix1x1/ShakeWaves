import { File, Paths } from 'expo-file-system';

import { encodeWavPcm16 } from './wav';

/**
 * Converts audio buffer to base64 data URI (fallback).
 */
export function bufferToDataUri(mono: Float32Array): string {
  const bytes = encodeWavPcm16([mono]);
  let binary = '';
  const chunk = 0x800;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk))
    );
  }
  let base64 = '';
  if (typeof btoa === 'function') {
    base64 = btoa(binary);
  } else {
    const B = (globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } })
      .Buffer;
    if (B) base64 = B.from(binary, 'binary').toString('base64');
  }
  return `data:audio/wav;base64,${base64}`;
}

/**
 * Creates a playable audio URI on native. Writes WAV bytes to cacheDirectory
 * for fast, reliable native ExoPlayer / AVPlayer playback, falling back to data URI.
 */
export function bufferToAudioUri(mono: Float32Array): string {
  try {
    if (Paths?.cache) {
      const bytes = encodeWavPcm16([mono]);
      const file = new File(
        Paths.cache,
        `sw_clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.wav`
      );
      file.create({ overwrite: true });
      file.writeSync(bytes);
      return file.uri;
    }
  } catch (err) {
    console.warn('Native cache write failed, falling back to data URI', err);
  }
  return bufferToDataUri(mono);
}
