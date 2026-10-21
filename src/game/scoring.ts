import { buildEvaluationWave, profileToCycle } from '../audio/wave';
import type { Level } from './levels';

export type Grade = 'S' | 'A' | 'B' | 'C' | 'F';

 export interface ScoreResult {
  percent: number;
  grade: Grade;
  match: boolean;
  playerCycle: Float32Array;
  targetEvaluation: Float32Array;
  playerEvaluation: Float32Array;
  playerProfile: number[];
}

const CYCLE_TABLE = 512;

export function gradeFor(percent: number): Grade {
  if (percent >= 95) return 'S';
  if (percent >= 80) return 'A';
  if (percent >= 60) return 'B';
  if (percent >= 40) return 'C';
  return 'F';
}

export function gradeColor(grade: Grade): string {
  switch (grade) {
    case 'S':
      return '#00f5d4';
    case 'A':
      return '#38e07b';
    case 'B':
      return '#ffd166';
    case 'C':
      return '#ff9f45';
    case 'F':
      return '#ff4d6d';
  }
}

/**
 * Shape comparison between two equal-length waveforms. Both are normalized to
 * their own peak, so this measures how closely the player reproduced the
 * target's *form* (the interesting skill: shaping the line). A flat line, a
 * wrongly-shaped wave, or a phase/timing error all lose points.
 * Returns a 0-100 percentage.
 */
function waveformMatch(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);

  let peakA = 1e-6;
  let peakB = 1e-6;
  for (let i = 0; i < n; i++) {
    peakA = Math.max(peakA, Math.abs(a[i]));
    peakB = Math.max(peakB, Math.abs(b[i]));
  }

  const na = new Float32Array(n);
  const nb = new Float32Array(n);
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i++) {
    na[i] = a[i] / peakA;
    nb[i] = b[i] / peakB;
    meanA += na[i];
    meanB += nb[i];
  }
  meanA /= n;
  meanB /= n;

  let mae = 0;
  let varA = 0;
  let varB = 0;
  let cov = 0;
  for (let i = 0; i < n; i++) {
    mae += Math.abs(na[i] - nb[i]);
    const da = na[i] - meanA;
    const db = nb[i] - meanB;
    varA += da * da;
    varB += db * db;
    cov += da * db;
  }
  mae /= n;

  // Correlation is 0 when either signal is constant (e.g. a flat line), so a
  // flat player wave scores low against any shaped target.
  const correlation = varA > 1e-9 && varB > 1e-9 ? cov / (Math.sqrt(varA) * Math.sqrt(varB)) : 0;
  const corrScore = Math.max(0, correlation);

  const maeScore = Math.max(0, 1 - 2 * mae);
  const combined = 0.6 * corrScore + 0.4 * maeScore;
  return Math.max(0, Math.min(100, combined * 100));
}

export function scoreLevel(level: Level, playerProfile: number[]): ScoreResult {
  const playerCycle = profileToCycle(playerProfile, CYCLE_TABLE);
  const playerEvaluation = buildEvaluationWave(playerCycle, level.cycles);
  const targetEvaluation = buildEvaluationWave(level.targetCycle, level.cycles);

  let noteScoreSum = 0;
  const n = Math.min(level.targetProfile.length, playerProfile.length);
  for (let i = 0; i < n; i++) {
    const diff = Math.abs(level.targetProfile[i] - playerProfile[i]);
    if (diff < 0.05) {
      noteScoreSum += 1.0;
    } else if (diff <= 0.26) {
      noteScoreSum += 0.7;
    } else if (diff <= 0.51) {
      noteScoreSum += 0.4;
    }
  }
  const noteScore = (noteScoreSum / n) * 100;
  const waveScore = waveformMatch(targetEvaluation, playerEvaluation);
  const combined = 0.65 * noteScore + 0.35 * waveScore;
  const percent = Math.round(combined * 10) / 10;
  const grade = gradeFor(percent);

  return {
    percent,
    grade,
    match: percent >= 40,
    playerCycle,
    targetEvaluation,
    playerEvaluation,
    playerProfile: playerProfile.slice(),
  };
}
