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
import { generateLevel, startProfile, tutorialLevel, type Level } from './levels';
import { scoreLevel, type ScoreResult } from './scoring';

const PREVIEW_CURVE_POINTS = 256;

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
  setPlayerNodeInstrument: (nodeIndex: number, inst: SingleInstrumentId) => void;
  setSelectedPoint: (i: number) => void;
  updatePoint: (i: number, v: number) => void;
  playNote: (v: number, nodeIndex?: number) => void;
  submit: () => void;
  retrySame: () => void;
  next: () => void;
  clear: () => void;
  restart: () => void;
  previewTarget: () => void;
  previewPlayer: () => void;
  playPianoNote: (v: number) => void;
}

export function useGameSession(gameInstrument: InstrumentId = 'piano'): Session {
  const [level, setLevel] = useState<Level>(() => tutorialLevel());
  const [profile, setProfile] = useState<number[]>(() => startProfile(tutorialLevel().pointCount));
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [selectedPoint, setSelectedPoint] = useState(0);
  const [busy, setBusy] = useState(false);

  // In Mix Mode, each level has a curated harmonic blend for target melody
  const [targetNodeInstruments, setTargetNodeInstruments] = useState<SingleInstrumentId[]>(() => {
    if (gameInstrument === 'mix') {
      return generateCuratedMixForLevel(tutorialLevel().index, tutorialLevel().pointCount);
    }
    return new Array(tutorialLevel().pointCount).fill(gameInstrument as SingleInstrumentId);
  });

  // Player starts with a default selection for their nodes
  const [playerNodeInstruments, setPlayerNodeInstruments] = useState<SingleInstrumentId[]>(() => {
    if (gameInstrument === 'mix') {
      return generateCuratedMixForLevel(tutorialLevel().index, tutorialLevel().pointCount);
    }
    return new Array(tutorialLevel().pointCount).fill(gameInstrument as SingleInstrumentId);
  });

  const targetClip = useRef<number | null>(null);
  const playerClip = useRef<number | null>(null);
  const singleNoteClips = useRef<Map<string, number>>(new Map());

  // Helper to play a single note for a specific node
  const playNote = useCallback((v: number, nodeIndex?: number) => {
    const key = valueToPianoKey(v);
    const activeInst = (gameInstrument === 'mix' && nodeIndex !== undefined)
      ? playerNodeInstruments[nodeIndex]
      : (gameInstrument === 'mix' ? 'piano' : (gameInstrument as SingleInstrumentId));

    const cacheKey = `${activeInst}_${key.note}`;
    let clipId = singleNoteClips.current.get(cacheKey);
    if (clipId === undefined) {
      const samples = renderNote(key.freq, activeInst, 0.4);
      clipId = loadClip(samples, bufferToAudioUri);
      singleNoteClips.current.set(cacheKey, clipId);
    }
    playClip(clipId);
  }, [gameInstrument, playerNodeInstruments]);

  const releasePlayerClip = useCallback(() => {
    if (playerClip.current !== null) {
      releaseClip(playerClip.current);
      playerClip.current = null;
    }
  }, []);

  // Set individual node instrument in Mix Mode
  const setPlayerNodeInstrument = useCallback((nodeIndex: number, inst: SingleInstrumentId) => {
    setPlayerNodeInstruments((prev) => {
      const next = [...prev];
      next[nodeIndex] = inst;
      return next;
    });
  }, []);

  // Update target audio clip when level or target instruments change
  useEffect(() => {
    if (targetClip.current !== null) releaseClip(targetClip.current);
    targetClip.current = loadClip(
      renderTuneWithStepInstruments(level.targetProfile, targetNodeInstruments),
      bufferToAudioUri
    );
  }, [level, targetNodeInstruments]);

  useEffect(() => {
    const clipsMap = singleNoteClips.current;
    return () => {
      if (targetClip.current !== null) releaseClip(targetClip.current);
      if (playerClip.current !== null) releaseClip(playerClip.current);
      clipsMap.forEach((id) => releaseClip(id));
      clipsMap.clear();
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
  }, [level.pointCount]);

  const loadLevel = useCallback(
    (lv: Level) => {
      releasePlayerClip();
      setLevel(lv);
      setProfile(startProfile(lv.pointCount));
      setResult(null);
      setSelectedPoint(0);

      if (gameInstrument === 'mix') {
        const mix = generateCuratedMixForLevel(lv.index, lv.pointCount);
        setTargetNodeInstruments(mix);
        setPlayerNodeInstruments(mix);
      } else {
        const uniform = new Array(lv.pointCount).fill(gameInstrument as SingleInstrumentId);
        setTargetNodeInstruments(uniform);
        setPlayerNodeInstruments(uniform);
      }
    },
    [gameInstrument, releasePlayerClip]
  );

  const previewTarget = useCallback(() => {
    if (playerClip.current !== null) stopClip(playerClip.current);
    if (targetClip.current !== null) playClip(targetClip.current);
  }, []);

  const previewPlayer = useCallback(() => {
    if (playerClip.current !== null) stopClip(playerClip.current);
    releasePlayerClip();
    playerClip.current = loadClip(
      renderTuneWithStepInstruments(profile, playerNodeInstruments),
      bufferToAudioUri
    );
    playClip(playerClip.current);
  }, [profile, playerNodeInstruments, releasePlayerClip]);

  const submit = useCallback(() => {
    if (busy) return;
    setBusy(true);
    try {
      const scored = scoreLevel(level, profile);
      setResult(scored);
      if (playerClip.current !== null) stopClip(playerClip.current);
      releasePlayerClip();
      playerClip.current = loadClip(
        renderTuneWithStepInstruments(profile, playerNodeInstruments),
        bufferToAudioUri
      );
    } finally {
      setBusy(false);
    }
  }, [busy, level, profile, playerNodeInstruments, releasePlayerClip]);

  const retrySame = useCallback(() => {
    setProfile(startProfile(level.pointCount));
    setResult(null);
    setSelectedPoint(0);
  }, [level.pointCount]);

  const next = useCallback(() => {
    loadLevel(generateLevel(level.index + 1));
  }, [level.index, loadLevel]);

  const restart = useCallback(() => {
    loadLevel(tutorialLevel());
  }, [loadLevel]);

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
    setPlayerNodeInstrument,
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
  };
}
