import { SingleInstrumentId } from '../audio/instruments';
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
  rhythmScore: number;
  notesOrInstScore: number;
  instrumentsMatched?: number;
  totalInstruments?: number;
  notesMatched?: number;
  totalNotes?: number;
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
export function waveformMatch(a: Float32Array, b: Float32Array): number {
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

/**
 * Rhythm Evaluation (0 to 50 points):
 * 50% of the total score is strictly based on the player's rhythm match.
 * Compares:
 * 1. Proportional inter-onset intervals (tempo-independent rhythm phrasing): 75%
 * 2. Overall tempo pace consistency: 25%
 */
export function calculateRhythmScore(
  playerTimestamps?: number[],
  targetTimestamps?: number[]
): number {
  if (!playerTimestamps || playerTimestamps.length < 2) {
    return 50; // default full marks if evenly paced / standard
  }

  const n = playerTimestamps.length;
  const targets = (targetTimestamps && targetTimestamps.length === n)
    ? targetTimestamps
    : Array.from({ length: n }, (_, i) => i * 0.24);

  const playerIntervals: number[] = [];
  const targetIntervals: number[] = [];
  let playerTotalTime = 0;
  let targetTotalTime = 0;

  for (let i = 0; i < n - 1; i++) {
    const pInt = Math.max(0.01, (playerTimestamps[i + 1] ?? 0) - (playerTimestamps[i] ?? 0));
    const tInt = Math.max(0.01, (targets[i + 1] ?? 0) - (targets[i] ?? 0));
    playerIntervals.push(pInt);
    targetIntervals.push(tInt);
    playerTotalTime += pInt;
    targetTotalTime += tInt;
  }

  if (playerTotalTime <= 0.05 || targetTotalTime <= 0.05) {
    return 25;
  }

  // 1. Proportional interval rhythm shape (tempo-invariant)
  let propDiffSum = 0;
  for (let i = 0; i < playerIntervals.length; i++) {
    const pProp = playerIntervals[i] / playerTotalTime;
    const tProp = targetIntervals[i] / targetTotalTime;
    propDiffSum += Math.abs(pProp - tProp);
  }
  // Tolerant normalization: micro-timing jitter does not unduly penalize human performance
  const intervalScore = Math.max(0, 1 - propDiffSum / 1.4);

  // 2. Tempo pace factor
  const tempoRatio = playerTotalTime / targetTotalTime;
  const tempoScore = tempoRatio > 0
    ? Math.max(0, Math.min(tempoRatio, 1 / tempoRatio))
    : 0;

  const combinedRhythmRatio = 0.75 * intervalScore + 0.25 * tempoScore;
  const rhythmScore = Math.min(50, Math.max(0, Math.round(combinedRhythmRatio * 50 * 10) / 10));
  return rhythmScore;
}

export function scoreLevel(
  level: Level,
  playerProfile: number[],
  playerTimestamps?: number[],
  stepDuration = 0.24
): ScoreResult {
  const playerCycle = profileToCycle(playerProfile, CYCLE_TABLE);
  const playerEvaluation = buildEvaluationWave(playerCycle, level.cycles);
  const targetEvaluation = buildEvaluationWave(level.targetCycle, level.cycles);

  let noteScoreSum = 0;
  let exactMatches = 0;
  const n = Math.min(level.targetProfile.length, playerProfile.length);
  for (let i = 0; i < n; i++) {
    const diff = Math.abs(level.targetProfile[i] - playerProfile[i]);
    if (diff < 0.05) {
      noteScoreSum += 1.0;
      exactMatches += 1;
    } else if (diff <= 0.26) {
      noteScoreSum += 0.7;
    } else if (diff <= 0.51) {
      noteScoreSum += 0.4;
    }
  }
  const noteMatchRatio = n > 0 ? noteScoreSum / n : 0;
  // Notes match counts for up to 50 points
  const notesOrInstScore = Math.min(50, Math.max(0, Math.round(noteMatchRatio * 50 * 10) / 10));

  // Target timestamps: evenly spaced by stepDuration
  const targetTimestamps = Array.from({ length: n }, (_, i) => i * stepDuration);
  // Rhythm match counts for up to 50 points
  const rhythmScore = calculateRhythmScore(playerTimestamps, targetTimestamps);

  // Total percent is the sum of rhythm (50%) and notes (50%)
  const percent = Math.min(100, Math.round((rhythmScore + notesOrInstScore) * 10) / 10);
  const grade = gradeFor(percent);

  return {
    percent,
    grade,
    match: percent >= 40,
    playerCycle,
    targetEvaluation,
    playerEvaluation,
    playerProfile: playerProfile.slice(),
    rhythmScore,
    notesOrInstScore,
    notesMatched: exactMatches,
    totalNotes: n,
  };
}

/**
 * Mix Mode Scoring:
 * 50% for rhythm match, 50% for instrument sequence match.
 */
export function scoreMixLevel(
  targetInstruments: SingleInstrumentId[],
  playerInstruments: SingleInstrumentId[],
  level: Level,
  playerTimestamps?: number[],
  stepDuration = 0.24
): ScoreResult {
  const n = Math.min(targetInstruments.length, playerInstruments.length);
  let matched = 0;
  for (let i = 0; i < n; i++) {
    if (targetInstruments[i] === playerInstruments[i]) {
      matched += 1;
    }
  }

  const instMatchRatio = n > 0 ? matched / n : 0;
  // Instrument match counts for up to 50 points
  const notesOrInstScore = Math.min(50, Math.max(0, Math.round(instMatchRatio * 50 * 10) / 10));

  // Target timestamps: evenly spaced by stepDuration
  const targetTimestamps = Array.from({ length: n }, (_, i) => i * stepDuration);
  // Rhythm match counts for up to 50 points
  const rhythmScore = calculateRhythmScore(playerTimestamps, targetTimestamps);

  // Total percent is the sum of rhythm (50%) and instruments (50%)
  const percent = Math.min(100, Math.round((rhythmScore + notesOrInstScore) * 10) / 10);
  const grade = gradeFor(percent);
  const playerCycle = profileToCycle(level.targetProfile, CYCLE_TABLE);
  const playerEvaluation = buildEvaluationWave(playerCycle, level.cycles);
  const targetEvaluation = buildEvaluationWave(level.targetCycle, level.cycles);

  return {
    percent,
    grade,
    match: percent >= 40,
    playerCycle,
    targetEvaluation,
    playerEvaluation,
    playerProfile: level.targetProfile.slice(),
    rhythmScore,
    notesOrInstScore,
    instrumentsMatched: matched,
    totalInstruments: n,
  };
}
