import { useCallback, useEffect, useRef, useState } from 'react';

import { loadClip, playClip, releaseClip, stopClip } from '../audio/player';
import {
  generateCuratedMixForLevel,
  InstrumentId,
  renderNote,
  renderTuneWithStepInstruments,
  SingleInstrumentId,
} from '../audio/instruments';
import { valueToPianoKey } from '../audio/render';

import { bufferToAudioUri } from '../audio/storage';
import { profileToCycle } from '../audio/wave';
import { generateLevel, startProfile, type Level } from './levels';
import { scoreLevel, type ScoreResult } from './scoring';

const PREVIEW_CURVE_POINTS = 256;

export type PlaybackSpeed = 0.5 | 1.0 | 1.5;

function shapingCurve(profile: number[]): number[] {
  const curve = profileToCycle(profile, PREVIEW_CURVE_POINTS);
  return Array.from(curve);
}

export interface Session {
  level: Level;
  profile: number[];
  result: ScoreResult | null;
  selectedPoint: number;
  busy: boolean;
  targetData: number[];
  playerData: number[];
  instrument: InstrumentId;
  targetNodeInstruments: SingleInstrumentId[];
  playerNodeInstruments: SingleInstrumentId[];
  speed: PlaybackSpeed;
  isLooping: boolean;
  activePlaying: 'target' | 'player' | null;
  setSpeed: (spd: PlaybackSpeed) => void;
  setIsLooping: (val: boolean | ((prev: boolean) => boolean)) => void;
  setPlayerNodeInstrument: (nodeIndex: number, inst: SingleInstrumentId) => void;
  playInstrumentPreview: (inst: SingleInstrumentId) => void;
  setSelectedPoint: (i: number) => void;
  updatePoint: (i: number, v: number) => void;
  playNote: (v: number, nodeIndex?: number, instOverride?: SingleInstrumentId) => void;
  submit: () => void;
  retrySame: () => void;
  next: () => void;
  clear: () => void;
  restart: () => void;
  previewTarget: () => void;
  previewPlayer: () => void;
  stopPlayback: () => void;
  playPianoNote: (v: number) => void;
}

export function useGameSession(gameInstrument: InstrumentId = 'piano', startingStreak = 0): Session {
  const [level, setLevel] = useState<Level>(() => generateLevel(startingStreak));
  const [profile, setProfile] = useState<number[]>(() => startProfile(generateLevel(startingStreak).pointCount));
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [selectedPoint, setSelectedPoint] = useState(0);
  const [busy, setBusy] = useState(false);

  // Speed and Loop controls
  const [speed, setSpeed] = useState<PlaybackSpeed>(1.0);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [activePlaying, setActivePlaying] = useState<'target' | 'player' | null>(null);

  const getStepDuration = useCallback((spd: PlaybackSpeed) => {
    switch (spd) {
      case 0.5: return 0.38;
      case 1.5: return 0.16;
      case 1.0:
      default:  return 0.24;
    }
  }, []);

  const [targetNodeInstruments, setTargetNodeInstruments] = useState<SingleInstrumentId[]>(() => {
    if (gameInstrument === 'mix') {
      return generateCuratedMixForLevel(startingStreak, 9);
    }
    return new Array(9).fill(gameInstrument as SingleInstrumentId);
  });

  const [playerNodeInstruments, setPlayerNodeInstruments] = useState<SingleInstrumentId[]>(() => {
    if (gameInstrument === 'mix') {
      return generateCuratedMixForLevel(startingStreak, 9);
    }
    return new Array(9).fill(gameInstrument as SingleInstrumentId);
  });

  const targetClip = useRef<number | null>(null);
  const playerClip = useRef<number | null>(null);
  const singleNoteClips = useRef<Map<string, number>>(new Map());
  const playingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPlayingState = useCallback(() => {
    if (playingTimer.current) clearTimeout(playingTimer.current);
    setActivePlaying(null);
  }, []);

  const playNote = useCallback((v: number, nodeIndex?: number, instOverride?: SingleInstrumentId) => {
    const key = valueToPianoKey(v);
    const activeInst = instOverride || (
      (gameInstrument === 'mix' && nodeIndex !== undefined)
        ? playerNodeInstruments[nodeIndex]
        : (gameInstrument === 'mix' ? 'piano' : (gameInstrument as SingleInstrumentId))
    );

    const cacheKey = `${activeInst}_${key.note}`;
    let clipId = singleNoteClips.current.get(cacheKey);
    if (clipId === undefined) {
      const samples = renderNote(key.freq, activeInst, 0.45);
      clipId = loadClip(samples, bufferToAudioUri);
      singleNoteClips.current.set(cacheKey, clipId);
    }
    playClip(clipId, false);
  }, [gameInstrument, playerNodeInstruments]);

  // Preview an instrument sound directly when tapped in Mix Mode picker
  const playInstrumentPreview = useCallback((inst: SingleInstrumentId) => {
    // Play a pleasant reference pitch (C4 or current selected node pitch)
    const val = profile[selectedPoint] ?? 0;
    const key = valueToPianoKey(val);
    const cacheKey = `${inst}_${key.note}`;
    let clipId = singleNoteClips.current.get(cacheKey);
    if (clipId === undefined) {
      const samples = renderNote(key.freq, inst, 0.45);
      clipId = loadClip(samples, bufferToAudioUri);
      singleNoteClips.current.set(cacheKey, clipId);
    }
    playClip(clipId, false);
  }, [profile, selectedPoint]);

  const releasePlayerClip = useCallback(() => {
    if (playerClip.current !== null) {
      releaseClip(playerClip.current);
      playerClip.current = null;
    }
  }, []);

  const setPlayerNodeInstrument = useCallback((nodeIndex: number, inst: SingleInstrumentId) => {
    setPlayerNodeInstruments((prev) => {
      const next = [...prev];
      next[nodeIndex] = inst;
      return next;
    });
  }, []);

  // Reload target clip when level, speed, or instruments change
  useEffect(() => {
    if (targetClip.current !== null) releaseClip(targetClip.current);
    const stepDur = getStepDuration(speed);
    targetClip.current = loadClip(
      renderTuneWithStepInstruments(level.targetProfile, targetNodeInstruments, undefined, stepDur),
      bufferToAudioUri
    );
  }, [level, speed, targetNodeInstruments, getStepDuration]);

  // Cleanup on unmount (stops all audio immediately when leaving the screen)
  useEffect(() => {
    const clipsMap = singleNoteClips.current;
    return () => {
      if (targetClip.current !== null) {
        stopClip(targetClip.current);
        releaseClip(targetClip.current);
      }
      if (playerClip.current !== null) {
        stopClip(playerClip.current);
        releaseClip(playerClip.current);
      }
      clipsMap.forEach((id) => {
        stopClip(id);
        releaseClip(id);
      });
      clipsMap.clear();
      if (playingTimer.current) clearTimeout(playingTimer.current);
    };
  }, []);

  const targetData = level.targetWaveform;
  const playerData = shapingCurve(profile);

  const updatePoint = useCallback((i: number, v: number) => {
    setProfile((prev) => {
      const next = prev.slice();
      next[i] = v;
      return next;
    });
    setSelectedPoint(i);
  }, []);

  const clear = useCallback(() => {
    setProfile(startProfile(level.pointCount));
    setResult(null);
    setSelectedPoint(0);
    clearPlayingState();
  }, [level.pointCount, clearPlayingState]);

  const stopPlayback = useCallback(() => {
    if (targetClip.current !== null) stopClip(targetClip.current);
    if (playerClip.current !== null) stopClip(playerClip.current);
    clearPlayingState();
  }, [clearPlayingState]);

  const loadLevel = useCallback(
    (lv: Level) => {
      stopPlayback();
      releasePlayerClip();
      setLevel(lv);
      setProfile(startProfile(lv.pointCount));
      setResult(null);
      setSelectedPoint(0);

      if (gameInstrument === 'mix') {
        const mix = generateCuratedMixForLevel(lv.streak, lv.pointCount);
        setTargetNodeInstruments(mix);
        setPlayerNodeInstruments(mix);
      } else {
        const uniform = new Array(lv.pointCount).fill(gameInstrument as SingleInstrumentId);
        setTargetNodeInstruments(uniform);
        setPlayerNodeInstruments(uniform);
      }
    },
    [gameInstrument, releasePlayerClip, stopPlayback]
  );

  const previewTarget = useCallback(() => {
    if (activePlaying === 'target') {
      stopPlayback();
      return;
    }

    stopPlayback();
    if (targetClip.current !== null) {
      setActivePlaying('target');
      playClip(targetClip.current, isLooping);

      if (!isLooping) {
        const approxDurationMs = (level.targetProfile.length * getStepDuration(speed) + 0.6) * 1000;
        playingTimer.current = setTimeout(() => {
          setActivePlaying((curr) => (curr === 'target' ? null : curr));
        }, approxDurationMs);
      }
    }
  }, [activePlaying, isLooping, level.targetProfile.length, speed, getStepDuration, stopPlayback]);

  const previewPlayer = useCallback(() => {
    if (activePlaying === 'player') {
      stopPlayback();
      return;
    }

    stopPlayback();
    releasePlayerClip();
    const stepDur = getStepDuration(speed);
    playerClip.current = loadClip(
      renderTuneWithStepInstruments(profile, playerNodeInstruments, undefined, stepDur),
      bufferToAudioUri
    );
    setActivePlaying('player');
    playClip(playerClip.current, isLooping);

    if (!isLooping) {
      const approxDurationMs = (profile.length * stepDur + 0.6) * 1000;
      playingTimer.current = setTimeout(() => {
        setActivePlaying((curr) => (curr === 'player' ? null : curr));
      }, approxDurationMs);
    }
  }, [activePlaying, profile, playerNodeInstruments, speed, isLooping, getStepDuration, releasePlayerClip, stopPlayback]);

  const submit = useCallback(() => {
    if (busy) return;
    stopPlayback();
    setBusy(true);
    try {
      const scored = scoreLevel(level, profile);
      setResult(scored);
      releasePlayerClip();
      playerClip.current = loadClip(
        renderTuneWithStepInstruments(profile, playerNodeInstruments, undefined, getStepDuration(speed)),
        bufferToAudioUri
      );
    } finally {
      setBusy(false);
    }
  }, [busy, level, profile, playerNodeInstruments, speed, getStepDuration, releasePlayerClip, stopPlayback]);

  const retrySame = useCallback(() => {
    stopPlayback();
    setProfile(startProfile(level.pointCount));
    setResult(null);
    setSelectedPoint(0);
  }, [level.pointCount, stopPlayback]);

  const next = useCallback(() => {
    stopPlayback();
    loadLevel(generateLevel(level.streak + 1));
  }, [level.streak, loadLevel, stopPlayback]);

  const restart = useCallback(() => {
    stopPlayback();
    loadLevel(generateLevel(0));
  }, [loadLevel, stopPlayback]);

  return {
    level,
    profile,
    result,
    selectedPoint,
    busy,
    targetData,
    playerData,
    instrument: gameInstrument,
    targetNodeInstruments,
    playerNodeInstruments,
    speed,
    isLooping,
    activePlaying,
    setSpeed,
    setIsLooping,
    setPlayerNodeInstrument,
    playInstrumentPreview,
    setSelectedPoint,
    updatePoint,
    playNote,
    playPianoNote: playNote,
    submit,
    retrySame,
    next,
    clear,
    restart,
    previewTarget,
    previewPlayer,
    stopPlayback,
  };
}
