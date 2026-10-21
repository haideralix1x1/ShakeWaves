export const ANALYZE_RATE = 22050;
export const ANALYZE_SECONDS = 2;
export const ANALYZE_FRAMES = ANALYZE_RATE * ANALYZE_SECONDS;

/**
 * Single-cycle waveform display and evaluation across the editor.
 */
export const CYCLES_PER_CLIP = 1;

export function normalizeProfile(profile: number[]): number[] {
  const max = Math.max(1e-6, ...profile.map(Math.abs));
  return profile.map((v) => v / max);
}

/**
 * Builds a single-cycle wave table of `tableSize` samples from `profile`
 * (a set of control-point values) using clamped Catmull-Rom interpolation.
 * Each control point directly controls its local segment of the wave without
 * altering distant points on the left, middle, or right.
 */
export function profileToCycle(profile: number[], tableSize: number): Float32Array {
  const n = profile.length;
  const table = new Float32Array(tableSize);
  const get = (i: number) => {
    if (i < 0) return profile[0];
    if (i >= n) return profile[n - 1];
    return profile[i];
  };
  for (let i = 0; i < tableSize; i++) {
    const pos = (i / (tableSize - 1)) * (n - 1);
    const idx = Math.floor(pos);
    const t = pos - idx;
    const p0 = get(idx - 1);
    const p1 = get(idx);
    const p2 = get(idx + 1);
    const p3 = get(idx + 2);
    const t2 = t * t;
    const t3 = t2 * t;
    table[i] =
      0.5 *
      (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (p3 - p0 + 3 * p1 - 3 * p2) * t3);
  }
  return table;
}

export function sampleCycle(cycle: Float32Array, phase: number): number {
  const size = cycle.length;
  let p = phase % 1;
  if (p < 0) p += 1;
  const pos = p * size;
  const i0 = Math.floor(pos) % size;
  const i1 = (i0 + 1) % size;
  const t = pos - Math.floor(pos);
  return cycle[i0] * (1 - t) + cycle[i1] * t;
}

/**
 * The evaluation waveform for a profile: the single cycle repeated
 * `cycles` times across the whole clip (default 1 cycle).
 */
export function buildEvaluationWave(cycle: Float32Array, cycles = CYCLES_PER_CLIP): Float32Array {
  const out = new Float32Array(ANALYZE_FRAMES);
  for (let i = 0; i < ANALYZE_FRAMES; i++) {
    out[i] = sampleCycle(cycle, (i / ANALYZE_FRAMES) * cycles);
  }
  return out;
}
