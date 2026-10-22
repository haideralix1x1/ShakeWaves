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
import { scoreLevel, scoreMixLevel, type ScoreResult } from './scoring';

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
  playbackStepIndex: number | null;
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
  previewPlayer: (force?: boolean) => void;
  stopPlayback: () => void;
  playPianoNote: (v: number) => void;
}

interface InitialGameState {
  level: Level;
  profile: number[];
  targetNodeInstruments: SingleInstrumentId[];
  playerNodeInstruments: SingleInstrumentId[];
}

function createInitialGameState(gameInstrument: InstrumentId, startingStreak: number): InitialGameState {
  const level = generateLevel(startingStreak);
  const profile = gameInstrument === 'mix' ? level.targetProfile.slice() : startProfile(level.pointCount);
  const targetNodeInstruments = gameInstrument === 'mix'
    ? generateCuratedMixForLevel(startingStreak, level.pointCount)
    : new Array(level.pointCount).fill(gameInstrument as SingleInstrumentId);
  const playerNodeInstruments = gameInstrument === 'mix'
    ? new Array(level.pointCount).fill('piano')
    : new Array(level.pointCount).fill(gameInstrument as SingleInstrumentId);

  return {
    level,
    profile,
    targetNodeInstruments,
    playerNodeInstruments,
  };
}

export function useGameSession(gameInstrument: InstrumentId = 'piano', startingStreak = 0): Session {
  const [initialState] = useState(() => createInitialGameState(gameInstrument, startingStreak));

  const [level, setLevel] = useState<Level>(initialState.level);
  const [profile, setProfile] = useState<number[]>(initialState.profile);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [selectedPoint, setSelectedPoint] = useState(0);
  const [busy, setBusy] = useState(false);

  // Speed and Loop controls
  const [speed, setSpeed] = useState<PlaybackSpeed>(1.0);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [activePlaying, setActivePlaying] = useState<'target' | 'player' | null>(null);
  const [playbackStepIndex, setPlaybackStepIndex] = useState<number | null>(null);

  const getStepDuration = useCallback((spd: PlaybackSpeed) => {
    switch (spd) {
      case 0.5: return 0.38;
      case 1.5: return 0.16;
      case 1.0:
      default:  return 0.24;
    }
  }, []);

  const [targetNodeInstruments, setTargetNodeInstruments] = useState<SingleInstrumentId[]>(
    initialState.targetNodeInstruments
  );
  const [playerNodeInstruments, setPlayerNodeInstruments] = useState<SingleInstrumentId[]>(
    initialState.playerNodeInstruments
  );
  const playerNodeInstrumentsRef = useRef<SingleInstrumentId[]>(initialState.playerNodeInstruments);

  const targetClip = useRef<number | null>(null);
  const playerClip = useRef<number | null>(null);
  const singleNoteClips = useRef<Map<string, number>>(new Map());
  const playingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPlayingState = useCallback(() => {
    if (playingTimer.current) clearTimeout(playingTimer.current);
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setActivePlaying(null);
    setPlaybackStepIndex(null);
  }, []);

  const playNote = useCallback((v: number, nodeIndex?: number, instOverride?: SingleInstrumentId) => {
    // In mix mode, always use the exact pitch from level.targetProfile for that node
    const effectiveVal = (gameInstrument === 'mix' && nodeIndex !== undefined && nodeIndex < level.targetProfile.length)
      ? level.targetProfile[nodeIndex]
      : v;
    const key = valueToPianoKey(effectiveVal);
    const activeInst = instOverride || (
      (gameInstrument === 'mix' && nodeIndex !== undefined)
        ? playerNodeInstruments[nodeIndex]
        : (gameInstrument === 'mix' ? 'piano' : (gameInstrument as SingleInstrumentId))
    );

    const dur = activeInst === 'accordion' ? 0.52 : (activeInst === 'synth' ? 0.48 : 0.45);
    const cacheKey = `${activeInst}_${key.note}`;
    let clipId = singleNoteClips.current.get(cacheKey);
    if (clipId === undefined) {
      const samples = renderNote(key.freq, activeInst, dur, undefined, 0.75);
      clipId = loadClip(samples, bufferToAudioUri);
      singleNoteClips.current.set(cacheKey, clipId);
    }
    playClip(clipId, false);
  }, [gameInstrument, level.targetProfile, playerNodeInstruments]);

  // Preview an instrument sound directly when tapped in Mix Mode picker
  const playInstrumentPreview = useCallback((inst: SingleInstrumentId) => {
    const val = (gameInstrument === 'mix' && selectedPoint < level.targetProfile.length)
      ? level.targetProfile[selectedPoint]
      : (profile[selectedPoint] ?? 0);
    const key = valueToPianoKey(val);
    const dur = inst === 'accordion' ? 0.52 : (inst === 'synth' ? 0.48 : 0.45);
    const cacheKey = `${inst}_${key.note}`;
    let clipId = singleNoteClips.current.get(cacheKey);
    if (clipId === undefined) {
      const samples = renderNote(key.freq, inst, dur, undefined, 0.75);
      clipId = loadClip(samples, bufferToAudioUri);
      singleNoteClips.current.set(cacheKey, clipId);
    }
    playClip(clipId, false);
  }, [gameInstrument, level.targetProfile, profile, selectedPoint]);

  const releasePlayerClip = useCallback(() => {
    if (playerClip.current !== null) {
      releaseClip(playerClip.current);
      playerClip.current = null;
    }
  }, []);

  const setPlayerNodeInstrument = useCallback((nodeIndex: number, inst: SingleInstrumentId) => {
    playerNodeInstrumentsRef.current[nodeIndex] = inst;
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
    if (gameInstrument === 'mix') {
      setProfile(level.targetProfile.slice());
      const defaultInsts = new Array(level.pointCount).fill('piano');
      playerNodeInstrumentsRef.current = defaultInsts;
      setPlayerNodeInstruments(defaultInsts);
    } else {
      setProfile(startProfile(level.pointCount));
    }
    setResult(null);
    setSelectedPoint(0);
    clearPlayingState();
  }, [gameInstrument, level.pointCount, level.targetProfile, clearPlayingState]);

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
      setResult(null);
      setSelectedPoint(0);

      if (gameInstrument === 'mix') {
        setProfile(lv.targetProfile.slice());
        const mix = generateCuratedMixForLevel(lv.streak, lv.pointCount);
        setTargetNodeInstruments(mix);
        const initialPlayerInsts = new Array(lv.pointCount).fill('piano');
        playerNodeInstrumentsRef.current = initialPlayerInsts;
        setPlayerNodeInstruments(initialPlayerInsts);
      } else {
        setProfile(startProfile(lv.pointCount));
        const uniform = new Array(lv.pointCount).fill(gameInstrument as SingleInstrumentId);
        setTargetNodeInstruments(uniform);
        playerNodeInstrumentsRef.current = uniform;
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

  const previewPlayer = useCallback((force = false) => {
    if (!force && activePlaying === 'player') {
      stopPlayback();
      return;
    }

    stopPlayback();
    releasePlayerClip();
    const stepDur = getStepDuration(speed);
    const melodyProfile = gameInstrument === 'mix' ? level.targetProfile : profile;
    const instruments = gameInstrument === 'mix' ? playerNodeInstrumentsRef.current : playerNodeInstruments;
    playerClip.current = loadClip(
      renderTuneWithStepInstruments(melodyProfile, instruments, undefined, stepDur),
      bufferToAudioUri
    );
    setActivePlaying('player');
    playClip(playerClip.current, isLooping);

    // Live step highlight ticker for sequence buttons & waveform nodes
    if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    const stepMs = stepDur * 1000;
    const totalSteps = melodyProfile.length;
    setPlaybackStepIndex(0);
    const startTime = Date.now();

    playbackTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const step = Math.floor(elapsed / stepMs);
      if (step < totalSteps) {
        setPlaybackStepIndex(step);
      } else {
        if (isLooping) {
          setPlaybackStepIndex(step % totalSteps);
        } else {
          if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
          playbackTimerRef.current = null;
          setPlaybackStepIndex(null);
        }
      }
    }, 25);

    if (!isLooping) {
      const approxDurationMs = (melodyProfile.length * stepDur + 0.6) * 1000;
      playingTimer.current = setTimeout(() => {
        setActivePlaying((curr) => (curr === 'player' ? null : curr));
        setPlaybackStepIndex(null);
      }, approxDurationMs);
    }
  }, [activePlaying, gameInstrument, level.targetProfile, profile, playerNodeInstruments, speed, isLooping, getStepDuration, releasePlayerClip, stopPlayback]);

  const submit = useCallback(() => {
    if (busy) return;
    stopPlayback();
    setBusy(true);
    try {
      const scored = gameInstrument === 'mix'
        ? scoreMixLevel(targetNodeInstruments, playerNodeInstruments, level)
        : scoreLevel(level, profile);
      setResult(scored);
      releasePlayerClip();
      const melodyProfile = gameInstrument === 'mix' ? level.targetProfile : profile;
      playerClip.current = loadClip(
        renderTuneWithStepInstruments(melodyProfile, playerNodeInstruments, undefined, getStepDuration(speed)),
        bufferToAudioUri
      );
    } finally {
      setBusy(false);
    }
  }, [busy, gameInstrument, targetNodeInstruments, level, profile, playerNodeInstruments, speed, getStepDuration, releasePlayerClip, stopPlayback]);

  const retrySame = useCallback(() => {
    stopPlayback();
    if (gameInstrument === 'mix') {
      setProfile(level.targetProfile.slice());
      setPlayerNodeInstruments(new Array(level.pointCount).fill('piano'));
    } else {
      setProfile(startProfile(level.pointCount));
    }
    setResult(null);
    setSelectedPoint(0);
  }, [gameInstrument, level.pointCount, level.targetProfile, stopPlayback]);

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
    playbackStepIndex,
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
