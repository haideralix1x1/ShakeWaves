import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import {
  INSTRUMENTS,
  InstrumentId,
  SINGLE_INSTRUMENTS,
  SingleInstrumentId,
} from '../audio/instruments';
import { PIANO_KEYS, valueToPianoKey } from '../audio/render';
import { playUiTap } from '../audio/sfx';
import { mono, theme } from './theme';

interface Props {
  profile: number[];
  timestamps?: number[];
  selectedStep: number;
  onSelectStep: (step: number) => void;
  onNoteChange: (step: number, value: number, timestampSec?: number) => void;
  onTimestampsChange?: (timestamps: number[]) => void;
  instrument: InstrumentId;
  stepInstruments?: SingleInstrumentId[];
  targetStepInstruments?: SingleInstrumentId[];
  activePlaying?: 'target' | 'player' | null;
  onStepInstrumentChange?: (step: number, inst: SingleInstrumentId, timestampSec?: number) => void;
  onPlayNote: (value: number, nodeIndex?: number, inst?: SingleInstrumentId) => void;
  onAutoPlay?: () => void;
  onStopPlayback?: () => void;
  onResetCycle?: () => void;
  color?: string;
  playbackStep?: number | null;
}

// Drum pad definitions mapping directly to PIANO_KEYS pitches
const DRUM_PADS = [
  { label: 'SUB KICK',    sub: 'Sub Thump',    emoji: '🥁', value: -1.0,   note: 'C4' },
  { label: 'PUNCH KICK',  sub: 'Hard Beater',  emoji: '🥊', value: -0.75,  note: 'D4' },
  { label: 'CRISP SNARE', sub: 'Crisp Rim',    emoji: '🎯', value: 0.0,    note: 'G4' },
  { label: 'FAT SNARE',   sub: 'Heavy Shell',  emoji: '💥', value: -0.5,   note: 'E4' },
  { label: 'SIDE STICK',  sub: 'Wooden Click', emoji: '🥢', value: -0.125, note: 'F#4' },
  { label: '808 CLAP',    sub: 'Stereo Slap',  emoji: '👏', value: 0.25,   note: 'A4' },
  { label: 'CLOSED HAT',  sub: 'Tight Hat',    emoji: '🎩', value: 0.5,    note: 'B4' },
  { label: 'OPEN HAT',    sub: 'Sizzle Wash',  emoji: '✨', value: 0.875,  note: 'C#5' },
  { label: 'PEDAL HAT',   sub: 'Foot Chic',    emoji: '👞', value: 0.125,  note: 'G#4' },
  { label: 'LOW TOM',     sub: 'Deep Shell',   emoji: '🪘', value: -0.25,  note: 'F4' },
  { label: 'MID TOM',     sub: 'Warm Tom',     emoji: '🪘', value: 0.375,  note: 'A#4' },
  { label: 'HIGH TOM',    sub: 'Bright Tom',   emoji: '🪘', value: 0.625,  note: 'C5' },
  { label: 'SPLASH',      sub: 'Shimmer Cym',  emoji: '💫', value: 0.75,   note: 'C5' },
  { label: 'CRASH',       sub: 'Loud Crash',   emoji: '⚡', value: 1.0,    note: 'D5' },
  { label: 'RIDE BELL',   sub: 'Ping Bell',    emoji: '🛎️', value: 1.25,   note: 'E5' },
  { label: 'COWBELL',     sub: '808 Bell',     emoji: '🔔', value: 1.5,    note: 'F5' },
];

export function InstrumentKeyboardView({
  profile,
  timestamps,
  selectedStep,
  onSelectStep,
  onNoteChange,
  onTimestampsChange,
  instrument,
  stepInstruments,
  targetStepInstruments,
  activePlaying,
  onStepInstrumentChange,
  onPlayNote,
  onAutoPlay,
  onStopPlayback,
  onResetCycle,
  color = theme.player,
  playbackStep = null,
}: Props) {
  // Active instrument for currently selected step (in Mix Mode, each step has its own instrument)
  const isMix = instrument === 'mix';
  const totalSteps = profile.length;
  const [recordStep, setRecordStep] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [lastPressedVal, setLastPressedVal] = useState<number | null>(null);
  const [lastPressedInst, setLastPressedInst] = useState<SingleInstrumentId | null>(null);

  const recordingStartRef = useRef<number>(0);
  const recordedTimestampsRef = useRef<number[]>([]);

  const isComplete = recordStep >= totalSteps;

  const currentStepInst: SingleInstrumentId = isMix
    ? (stepInstruments?.[selectedStep] || 'piano')
    : (instrument as SingleInstrumentId);

  const currentInstMeta = INSTRUMENTS.find((i) => i.id === currentStepInst)!;

  // Active note and instrument during live playback (for sequence highlighting: MINE ONLY)
  const isMinePlaying = activePlaying === 'player' && playbackStep !== null && playbackStep !== undefined;
  const playbackNoteVal = isMinePlaying ? profile[playbackStep] : null;
  const playingMixInstId = (isMix && isMinePlaying)
    ? (stepInstruments?.[playbackStep] || null)
    : null;

  const toggleRecording = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Haptics optional
    }
    playUiTap();

    if (activePlaying === 'player') {
      onStopPlayback?.();
    }

    setIsRecording((prev) => {
      const next = !prev;
      if (next) {
        setRecordStep(0);
        onSelectStep(0);
        recordingStartRef.current = 0; // Wait for first note tap to begin timer
        recordedTimestampsRef.current = [];
      }
      return next;
    });
  }, [activePlaying, onSelectStep, onStopPlayback]);

  const handleKeyPress = useCallback((val: number) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics optional
    }

    // Always highlight the button the user is actually pressing!
    setLastPressedVal(val);

    // If currently playing audio, stop it
    if (activePlaying === 'player') {
      onStopPlayback?.();
    }

    // TEST MODE ONLY: if recording is OFF, freely play the sound without modifying sequence!
    if (!isRecording) {
      onPlayNote(val, selectedStep, currentStepInst);
      return;
    }

    // RECORDING MODE:
    let targetStep = recordStep;
    if (targetStep >= totalSteps) {
      targetStep = 0;
      recordingStartRef.current = 0;
      recordedTimestampsRef.current = [];
    }

    // Calculate real-time timestamp for rhythm matching
    let timestampSec = 0;
    if (recordingStartRef.current === 0) {
      recordingStartRef.current = Date.now();
      timestampSec = 0;
    } else {
      timestampSec = (Date.now() - recordingStartRef.current) / 1000;
    }
    recordedTimestampsRef.current[targetStep] = timestampSec;

    // 1. Record note and timestamp for target step
    onNoteChange(targetStep, val, timestampSec);
    onSelectStep(targetStep);

    // 2. Play note for target step with the current instrument
    onPlayNote(val, targetStep, currentStepInst);

    const nextStep = targetStep + 1;
    setRecordStep(nextStep);

    // 3. When target task length is reached, stop recording immediately and trigger playback of "Mine"
    if (nextStep >= totalSteps) {
      setIsRecording(false);
      const finishedTimestamps = [...recordedTimestampsRef.current];
      onTimestampsChange?.(finishedTimestamps);
      setTimeout(() => {
        onAutoPlay?.();
      }, 280);
    }
  }, [
    activePlaying,
    currentStepInst,
    isRecording,
    onAutoPlay,
    onNoteChange,
    onPlayNote,
    onSelectStep,
    onStopPlayback,
    onTimestampsChange,
    recordStep,
    selectedStep,
    totalSteps,
  ]);

  const handleStepSlotPress = useCallback((idx: number) => {
    try {
      Haptics.selectionAsync();
    } catch {
      // Haptics optional
    }
    if (activePlaying === 'player') {
      onStopPlayback?.();
    }
    setRecordStep(idx);
    onSelectStep(idx);
    const stepVal = profile[idx] ?? 0;
    const stepInst = isMix ? (stepInstruments?.[idx] || 'piano') : (instrument as SingleInstrumentId);
    onPlayNote(stepVal, idx, stepInst);
    setLastPressedVal(stepVal);
    if (isMix && stepInstruments?.[idx]) {
      setLastPressedInst(stepInstruments[idx]);
    }
  }, [activePlaying, instrument, isMix, onPlayNote, onSelectStep, onStopPlayback, profile, stepInstruments]);

  const handleMixInstrumentPress = useCallback((instId: SingleInstrumentId) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics optional
    }

    // Always highlight the instrument button the user is actually pressing!
    setLastPressedInst(instId);

    // If currently playing audio, stop it
    if (activePlaying === 'player') {
      onStopPlayback?.();
    }

    // TEST MODE ONLY: if recording is OFF, freely preview instrument sound without recording!
    if (!isRecording) {
      const noteVal = profile[selectedStep] ?? 0;
      onPlayNote(noteVal, selectedStep, instId);
      return;
    }

    // RECORDING MODE:
    let targetStep = recordStep;
    if (targetStep >= totalSteps) {
      targetStep = 0;
      recordingStartRef.current = 0;
      recordedTimestampsRef.current = [];
    }

    // Calculate real-time timestamp for rhythm matching
    let timestampSec = 0;
    if (recordingStartRef.current === 0) {
      recordingStartRef.current = Date.now();
      timestampSec = 0;
    } else {
      timestampSec = (Date.now() - recordingStartRef.current) / 1000;
    }
    recordedTimestampsRef.current[targetStep] = timestampSec;

    // 1. Record instrument and timestamp for target step
    onStepInstrumentChange?.(targetStep, instId, timestampSec);
    onSelectStep(targetStep);

    // 2. Play note for target step with the selected instrument
    const noteVal = profile[targetStep] ?? 0;
    onPlayNote(noteVal, targetStep, instId);

    const nextStep = targetStep + 1;
    setRecordStep(nextStep);

    // 3. When target task length is reached, stop recording immediately and trigger playback of "Mine"
    if (nextStep >= totalSteps) {
      setIsRecording(false);
      const finishedTimestamps = [...recordedTimestampsRef.current];
      onTimestampsChange?.(finishedTimestamps);
      setTimeout(() => {
        onAutoPlay?.();
      }, 280);
    }
  }, [
    activePlaying,
    isRecording,
    onAutoPlay,
    onPlayNote,
    onSelectStep,
    onStepInstrumentChange,
    onStopPlayback,
    onTimestampsChange,
    profile,
    recordStep,
    selectedStep,
    totalSteps,
  ]);

  const handleResetCycle = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Haptics optional
    }
    playUiTap();
    setRecordStep(0);
    onSelectStep(0);
    setIsRecording(false);
    setLastPressedVal(null);
    setLastPressedInst(null);
    recordingStartRef.current = 0;
    recordedTimestampsRef.current = [];
    onResetCycle?.();
  }, [onResetCycle, onSelectStep]);

  return (
    <View style={styles.container}>
      {isMix ? (
        <View style={styles.mixWrap}>
          {/* ── Cycle Progress Bar ── */}
          <View style={styles.mixCycleBar}>
            <View style={styles.mixCycleHeader}>
              <View style={styles.mixCycleInfo}>
                <Text style={styles.mixCycleTitle} numberOfLines={1}>
                  {isMinePlaying
                    ? '▶ PLAYING SEQUENCE'
                    : isRecording
                    ? `● RECORDING: STEP ${recordStep + 1} OF ${totalSteps}`
                    : isComplete
                    ? '✓ CYCLE COMPLETE'
                    : 'TEST MODE (REC OFF)'}
                </Text>
                <Text style={styles.mixCycleSub} numberOfLines={1}>
                  {isMinePlaying
                    ? 'Playing melody · Tap to test sounds'
                    : isRecording
                    ? `Tap instrument to record step #${recordStep + 1}`
                    : isComplete
                    ? 'Test sounds freely · Tap ● REC to re-record'
                    : 'Test sounds freely · Tap ● REC to record'}
                </Text>
              </View>

              <View style={styles.mixCycleActions}>
                <Pressable
                  style={[styles.mixRecBtn, isRecording && styles.mixRecBtnActive]}
                  onPress={toggleRecording}
                  hitSlop={8}>
                  <Text style={[styles.mixRecBtnText, isRecording && styles.mixRecBtnTextActive]}>
                    {isRecording ? '● REC ON' : '⏺ REC'}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.mixResetBtn}
                  onPress={handleResetCycle}
                  hitSlop={8}>
                  <Text style={styles.mixResetBtnText}>↺ RESET</Text>
                </Pressable>
              </View>
            </View>

            {/* Step slots showing recorded instruments (all in row without scrolling, icons only) */}
            <View style={styles.mixSlotsRow}>
              {Array.from({ length: totalSteps }).map((_, idx) => {
                const isRecorded = idx < recordStep;
                const isCurrentStep = idx === recordStep && isRecording && !isComplete;
                const isPlayingThis = isMinePlaying && playbackStep === idx;
                const assignedInst = isRecorded ? stepInstruments?.[idx] : null;
                const instMeta = assignedInst ? INSTRUMENTS.find((i) => i.id === assignedInst) : null;

                return (
                  <Pressable
                    key={idx}
                    onPress={() => handleStepSlotPress(idx)}
                    style={[
                      styles.mixSlot,
                      isRecorded && {
                        borderColor: instMeta?.color || theme.player,
                        backgroundColor: `${instMeta?.color || theme.player}20`,
                      },
                      isCurrentStep && styles.mixSlotCurrent,
                      isPlayingThis && styles.mixSlotPlaying,
                    ]}>
                    <Text
                      style={[
                        styles.mixSlotText,
                        isPlayingThis && styles.mixSlotPlayingText,
                        isRecorded && styles.mixSlotEmoji,
                        isRecorded && { color: instMeta?.color || theme.player },
                      ]}>
                      {isPlayingThis && !isRecorded
                        ? '▶'
                        : isRecorded
                        ? (instMeta?.emoji || '✓')
                        : `#${idx + 1}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Big Instrument Buttons Grid ── */}
          <View style={styles.mixGrid}>
            {SINGLE_INSTRUMENTS.map((instId) => {
              const meta = INSTRUMENTS.find((i) => i.id === instId)!;
              const isPlayingNow = playingMixInstId === instId;
              const isPressed = lastPressedInst === instId;

              return (
                <Pressable
                  key={instId}
                  style={[
                    styles.mixCard,
                    { borderColor: theme.border },
                    isPressed && {
                      borderColor: meta.color,
                      backgroundColor: `${meta.color}25`,
                      borderWidth: 2,
                    },
                    isPlayingNow && {
                      borderColor: '#00f5d4',
                      backgroundColor: `${meta.color}50`,
                      transform: [{ scale: 1.05 }],
                      borderWidth: 2.5,
                      shadowColor: '#00f5d4',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.9,
                      shadowRadius: 12,
                      elevation: 10,
                      zIndex: 10,
                    },
                  ]}
                  onPress={() => handleMixInstrumentPress(instId)}>
                  <Text style={styles.mixCardEmoji}>{meta.emoji}</Text>
                  <Text
                    style={[
                      styles.mixCardLabel,
                      isPressed && { color: meta.color, fontWeight: '900' },
                      isPlayingNow && { color: '#00f5d4', fontWeight: '900' },
                    ]}>
                    {meta.label.toUpperCase()}
                  </Text>
                  <View
                    style={[
                      styles.mixCardDot,
                      { backgroundColor: meta.color },
                      isPressed && { transform: [{ scale: 1.4 }] },
                      isPlayingNow && { backgroundColor: '#00f5d4', transform: [{ scale: 1.4 }] },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={styles.mixWrap}>
          {/* ── Cycle Progress Bar (Single Instrument Modes) ── */}
          <View style={styles.mixCycleBar}>
            <View style={styles.mixCycleHeader}>
              <View style={styles.mixCycleInfo}>
                <Text style={styles.mixCycleTitle} numberOfLines={1}>
                  {isMinePlaying
                    ? '▶ PLAYING SEQUENCE'
                    : isRecording
                    ? `● RECORDING: STEP ${recordStep + 1} OF ${totalSteps}`
                    : isComplete
                    ? '✓ CYCLE COMPLETE'
                    : 'TEST MODE (REC OFF)'}
                </Text>
                <Text style={styles.mixCycleSub} numberOfLines={1}>
                  {isMinePlaying
                    ? 'Playing melody · Tap to test sounds'
                    : isRecording
                    ? currentStepInst === 'drum'
                      ? `Tap drum pad for step #${recordStep + 1}`
                      : currentStepInst === 'guitar'
                      ? `Tap string for step #${recordStep + 1}`
                      : currentStepInst === 'xylophone'
                      ? `Tap bar for step #${recordStep + 1}`
                      : `Tap note key for step #${recordStep + 1}`
                    : isComplete
                    ? 'Test sounds freely · Tap ● REC to re-record'
                    : 'Test sounds freely · Tap ● REC to record'}
                </Text>
              </View>

              <View style={styles.mixCycleActions}>
                <Pressable
                  style={[styles.mixRecBtn, isRecording && styles.mixRecBtnActive]}
                  onPress={toggleRecording}
                  hitSlop={8}>
                  <Text style={[styles.mixRecBtnText, isRecording && styles.mixRecBtnTextActive]}>
                    {isRecording ? '● REC ON' : '⏺ REC'}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.mixResetBtn}
                  onPress={handleResetCycle}
                  hitSlop={8}>
                  <Text style={styles.mixResetBtnText}>↺ RESET</Text>
                </Pressable>
              </View>
            </View>

            {/* Step slots showing recorded notes/pads (in row without scrolling) */}
            <View style={styles.mixSlotsRow}>
              {profile.map((val, idx) => {
                const isRecorded = idx < recordStep;
                const isCurrentStep = idx === recordStep && isRecording && !isComplete;
                const isPlayingThisStep = isMinePlaying && playbackStep === idx;
                const stepMeta = currentInstMeta;
                const noteInfo = valueToPianoKey(val);

                let noteLabel = noteInfo.note;
                let drumEmoji: string | null = null;
                if (currentStepInst === 'drum') {
                  const drumMatch = DRUM_PADS.find((d) => Math.abs(d.value - val) < 0.15);
                  if (drumMatch) {
                    noteLabel = drumMatch.label;
                    drumEmoji = drumMatch.emoji;
                  }
                }

                return (
                  <Pressable
                    key={`step-${idx}`}
                    onPress={() => handleStepSlotPress(idx)}
                    style={[
                      styles.mixSlot,
                      isRecorded && {
                        borderColor: stepMeta.color,
                        backgroundColor: `${stepMeta.color}20`,
                      },
                      isCurrentStep && styles.mixSlotCurrent,
                      isPlayingThisStep && styles.mixSlotPlaying,
                    ]}>
                    <Text
                      style={[
                        styles.mixSlotText,
                        isPlayingThisStep && styles.mixSlotPlayingText,
                        isRecorded && drumEmoji ? styles.mixSlotEmoji : styles.stepSlotNoteText,
                        isRecorded && { color: stepMeta.color },
                      ]}
                      numberOfLines={1}>
                      {isPlayingThisStep && !isRecorded
                        ? '▶'
                        : isRecorded
                        ? (drumEmoji || noteLabel)
                        : `#${idx + 1}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Single Instrument Detailed Key Surface ── */}
          <View style={styles.keyboardSurface}>
            {currentStepInst === 'piano' && (
              <PianoKeyboard
                activeValue={lastPressedVal}
                playbackValue={playbackNoteVal}
                onPressKey={handleKeyPress}
                accentColor={currentInstMeta.color}
              />
            )}

            {currentStepInst === 'drum' && (
              <DrumPads
                activeValue={lastPressedVal}
                playbackValue={playbackNoteVal}
                onPressPad={handleKeyPress}
                accentColor={currentInstMeta.color}
              />
            )}

            {currentStepInst === 'guitar' && (
              <GuitarFretboard
                activeValue={lastPressedVal}
                playbackValue={playbackNoteVal}
                onPressString={handleKeyPress}
                accentColor={currentInstMeta.color}
              />
            )}

            {currentStepInst === 'xylophone' && (
              <XylophoneBars
                activeValue={lastPressedVal}
                playbackValue={playbackNoteVal}
                onPressBar={handleKeyPress}
                accentColor={currentInstMeta.color}
              />
            )}

            {currentStepInst !== 'piano' &&
              currentStepInst !== 'drum' &&
              currentStepInst !== 'guitar' &&
              currentStepInst !== 'xylophone' && (
                <MelodicPads
                  activeValue={lastPressedVal}
                  playbackValue={playbackNoteVal}
                  onPressKey={handleKeyPress}
                  accentColor={currentInstMeta.color}
                  instrument={currentInstMeta}
                />
              )}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── 1. Piano Keyboard Surface ───────────────────────────────────────────────

function PianoKeyboard({
  activeValue,
  playbackValue,
  onPressKey,
  accentColor,
}: {
  activeValue: number | null;
  playbackValue?: number | null;
  onPressKey: (val: number) => void;
  accentColor: string;
}) {
  const scrollRef = useRef<any>(null);
  const WHITE_KEY_WIDTH = 46;
  const BLACK_KEY_WIDTH = 28;

  const { whiteKeys, blackKeys } = useMemo(() => {
    const whites: (typeof PIANO_KEYS[number] & { whiteIndex: number })[] = [];
    const blacks: (typeof PIANO_KEYS[number] & { whiteIndex: number })[] = [];
    let wCount = 0;
    for (const k of PIANO_KEYS) {
      if (k.isBlack) {
        blacks.push({ ...k, whiteIndex: wCount - 1 });
      } else {
        whites.push({ ...k, whiteIndex: wCount });
        wCount++;
      }
    }
    return { whiteKeys: whites, blackKeys: blacks };
  }, []);

  return (
    <View style={styles.pianoWrap}>
      <View style={styles.scrollHeader}>
        <Text style={styles.surfaceHint}>
          TAP KEYS FOR INSTANT PLAYBACK · 37 PIANO KEYS
        </Text>
        <Text style={styles.scrollBadge}>‹ SCROLL ‹ ›</Text>
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={true}
        contentContainerStyle={[styles.pianoScrollContent, { width: whiteKeys.length * WHITE_KEY_WIDTH + 16 }]}>
        <View style={styles.pianoKeysContainer}>
          {/* White keys row */}
          <View style={styles.whiteKeysRow}>
            {whiteKeys.map((k) => {
              const isActive = activeValue !== null && activeValue !== undefined && Math.abs(k.value - activeValue) < 0.08;
              const isPlayingThisKey = playbackValue !== null && playbackValue !== undefined && Math.abs(k.value - playbackValue) < 0.08;
              return (
                <Pressable
                  key={k.note}
                  style={[
                    styles.pianoKey,
                    { width: WHITE_KEY_WIDTH },
                    isActive && {
                      backgroundColor: `${accentColor}40`,
                      borderColor: accentColor,
                      borderBottomWidth: 5,
                      borderBottomColor: accentColor,
                    },
                    isPlayingThisKey && {
                      backgroundColor: '#00f5d4',
                      borderColor: '#ffffff',
                      borderBottomWidth: 6,
                      borderBottomColor: '#00f5d4',
                      transform: [{ scale: 1.05 }],
                      zIndex: 10,
                    },
                  ]}
                  onPressIn={() => onPressKey(k.value)}>
                  <Text
                    style={[
                      styles.pianoKeyNote,
                      isActive && { color: accentColor, fontWeight: '900' },
                      isPlayingThisKey && { color: '#000000', fontWeight: '900' },
                    ]}>
                    {k.note}
                  </Text>
                  <Text
                    style={[
                      styles.pianoKeyFreq,
                      isPlayingThisKey && { color: '#000000', fontWeight: '800' },
                    ]}>
                    {Math.round(k.freq)}Hz
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Black keys overlaid on top */}
          <View style={styles.blackKeysOverlay} pointerEvents="box-none">
            {blackKeys.map((k) => {
              const isActive = activeValue !== null && activeValue !== undefined && Math.abs(k.value - activeValue) < 0.08;
              const isPlayingThisKey = playbackValue !== null && playbackValue !== undefined && Math.abs(k.value - playbackValue) < 0.08;
              const leftPos = (k.whiteIndex + 0.65) * WHITE_KEY_WIDTH;
              return (
                <Pressable
                  key={k.note}
                  style={[
                    styles.blackKey,
                    { left: leftPos, width: BLACK_KEY_WIDTH },
                    isActive && {
                      backgroundColor: accentColor,
                      borderColor: '#ffffff',
                    },
                    isPlayingThisKey && {
                      backgroundColor: '#00f5d4',
                      borderColor: '#ffffff',
                      transform: [{ scale: 1.08 }],
                      zIndex: 20,
                    },
                  ]}
                  onPressIn={() => onPressKey(k.value)}>
                  <Text style={styles.blackKeyText}>{k.note.replace(/[0-9]/g, '')}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── 2. Drum MPC Pads Surface ────────────────────────────────────────────────

function DrumPads({
  activeValue,
  playbackValue,
  onPressPad,
  accentColor,
}: {
  activeValue: number | null;
  playbackValue?: number | null;
  onPressPad: (val: number) => void;
  accentColor: string;
}) {
  const drumScrollRef = useRef<any>(null);
  const row1 = DRUM_PADS.slice(0, 8);
  const row2 = DRUM_PADS.slice(8);

  const renderPad = (pad: typeof DRUM_PADS[number]) => {
    const isActive = activeValue !== null && activeValue !== undefined && Math.abs(pad.value - activeValue) < 0.08;
    const isPlayingThisPad = playbackValue !== null && playbackValue !== undefined && Math.abs(pad.value - playbackValue) < 0.08;
    return (
      <Pressable
        key={pad.label}
        style={[
          styles.drumPad,
          isActive && {
            borderColor: accentColor,
            backgroundColor: `${accentColor}30`,
          },
          isPlayingThisPad && {
            borderColor: '#00f5d4',
            backgroundColor: 'rgba(0, 245, 212, 0.45)',
            transform: [{ scale: 1.08 }],
            borderWidth: 2.5,
            zIndex: 10,
          },
        ]}
        onPressIn={() => onPressPad(pad.value)}>
        <Text style={styles.drumPadEmoji}>{pad.emoji}</Text>
        <Text
          style={[
            styles.drumPadLabel,
            isActive && { color: accentColor, fontWeight: '900' },
            isPlayingThisPad && { color: '#00f5d4', fontWeight: '900' },
          ]}
          numberOfLines={1}>
          {pad.label}
        </Text>
        <Text style={styles.drumPadSub} numberOfLines={1}>{pad.sub}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.drumWrap}>
      <View style={styles.scrollHeader}>
        <Text style={styles.surfaceHint}>
          TAP A DRUM PAD TO TRIGGER PERCUSSION
        </Text>
        <Text style={styles.scrollBadge}>‹ SCROLL ‹ ›</Text>
      </View>
      <ScrollView
        ref={drumScrollRef}
        key="game-drum-scroll"
        horizontal
        showsHorizontalScrollIndicator={true}
        contentOffset={{ x: 0, y: 0 }}
        contentContainerStyle={styles.drumScrollContent}>
        <View style={styles.drumTwoRowsContainer}>
          <View style={styles.drumRow}>{row1.map(renderPad)}</View>
          <View style={styles.drumRow}>{row2.map(renderPad)}</View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── 3. Guitar Fretboard Strings ─────────────────────────────────────────────

function GuitarFretboard({
  activeValue,
  playbackValue,
  onPressString,
  accentColor,
}: {
  activeValue: number | null;
  playbackValue?: number | null;
  onPressString: (val: number) => void;
  accentColor: string;
}) {
  const naturalKeys = useMemo(() => PIANO_KEYS.filter((k) => !k.isBlack), []);

  return (
    <View style={styles.guitarWrap}>
      <View style={styles.scrollHeader}>
        <Text style={styles.surfaceHint}>
          TAP AN ACOUSTIC STRING / FRET TO TEST OR RECORD
        </Text>
        <Text style={styles.scrollBadge}>‹ SCROLL ‹ ›</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={true}
        contentContainerStyle={styles.guitarScrollContent}>
        <View style={styles.guitarFretsRow}>
          {naturalKeys.map((k, i) => {
            const isActive = activeValue !== null && activeValue !== undefined && Math.abs(k.value - activeValue) < 0.08;
            const isPlayingThisFret = playbackValue !== null && playbackValue !== undefined && Math.abs(k.value - playbackValue) < 0.08;
            const stringGirth = Math.max(1.5, 4.5 - (i % 6) * 0.5);
            return (
              <Pressable
                key={k.note}
                style={[
                  styles.guitarFretColumn,
                  isActive && {
                    backgroundColor: `${accentColor}25`,
                    borderColor: accentColor,
                  },
                  isPlayingThisFret && {
                    backgroundColor: 'rgba(0, 245, 212, 0.35)',
                    borderColor: '#00f5d4',
                    borderWidth: 2,
                    transform: [{ scale: 1.04 }],
                    zIndex: 10,
                  },
                ]}
                onPressIn={() => onPressString(k.value)}>
                <Text
                  style={[
                    styles.guitarNoteText,
                    isActive && { color: accentColor, fontWeight: '800' },
                    isPlayingThisFret && { color: '#00f5d4', fontWeight: '900' },
                  ]}>
                  {k.note}
                </Text>

                {/* Vertical guitar string track with metallic glow */}
                <View style={styles.guitarWireTrackVertical}>
                  <View
                    style={[
                      styles.guitarWireVertical,
                      { width: stringGirth },
                      isActive && { backgroundColor: accentColor, shadowColor: accentColor, shadowOpacity: 1, shadowRadius: 4 },
                      isPlayingThisFret && { backgroundColor: '#00f5d4', shadowColor: '#00f5d4', shadowOpacity: 1, shadowRadius: 6 },
                    ]}
                  />
                </View>

                <Text
                  style={[
                    styles.guitarFreqText,
                    isPlayingThisFret && { color: '#00f5d4', fontWeight: '800' },
                  ]}>
                  {Math.round(k.freq)}Hz
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── 4. Xylophone Resonant Chime Bars ────────────────────────────────────────

function XylophoneBars({
  activeValue,
  playbackValue,
  onPressBar,
  accentColor,
}: {
  activeValue: number | null;
  playbackValue?: number | null;
  onPressBar: (val: number) => void;
  accentColor: string;
}) {
  const naturalKeys = useMemo(() => PIANO_KEYS.filter((k) => !k.isBlack), []);

  return (
    <View style={styles.xyloWrap}>
      <View style={styles.scrollHeader}>
        <Text style={styles.surfaceHint}>
          TAP A RESONANT CHIME BAR TO TEST OR RECORD
        </Text>
        <Text style={styles.scrollBadge}>‹ SCROLL ‹ ›</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={true}
        contentContainerStyle={styles.xyloScrollContent}>
        <View style={styles.xyloBarsRow}>
          {naturalKeys.map((k, i) => {
            const isActive = activeValue !== null && activeValue !== undefined && Math.abs(k.value - activeValue) < 0.08;
            const isPlayingThisBar = playbackValue !== null && playbackValue !== undefined && Math.abs(k.value - playbackValue) < 0.08;
            const barHeight = Math.max(68, 142 - (i % 12) * 6);
            return (
              <Pressable
                key={k.note}
                style={[
                  styles.xyloBar,
                  { height: barHeight },
                  isActive && {
                    backgroundColor: `${accentColor}40`,
                    borderColor: accentColor,
                  },
                  isPlayingThisBar && {
                    backgroundColor: 'rgba(0, 245, 212, 0.55)',
                    borderColor: '#00f5d4',
                    borderWidth: 2,
                    transform: [{ scale: 1.08 }],
                    zIndex: 10,
                  },
                ]}
                onPressIn={() => onPressBar(k.value)}>
                <View style={[styles.xyloPin, isPlayingThisBar && { backgroundColor: '#00f5d4' }]} />
                <Text
                  style={[
                    styles.xyloNote,
                    isActive && { color: accentColor, fontWeight: '900' },
                    isPlayingThisBar && { color: '#000000', fontWeight: '900' },
                  ]}>
                  {k.note}
                </Text>
                <View style={[styles.xyloPin, isPlayingThisBar && { backgroundColor: '#00f5d4' }]} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── 5. Universal Melodic Touch Pads (Accordion, Synth Lead, Trumpet, Harp) ───

function MelodicPads({
  activeValue,
  playbackValue,
  onPressKey,
  accentColor,
  instrument,
}: {
  activeValue: number | null;
  playbackValue?: number | null;
  onPressKey: (val: number) => void;
  accentColor: string;
  instrument: { label: string; emoji: string };
}) {
  const naturalKeys = useMemo(() => PIANO_KEYS.filter((k) => !k.isBlack), []);

  return (
    <View style={styles.melodicWrap}>
      <View style={styles.scrollHeader}>
        <Text style={styles.surfaceHint}>
          TAP {instrument.label.toUpperCase()} KEYS TO PLAY OR RECORD
        </Text>
        <Text style={styles.scrollBadge}>‹ SCROLL ‹ ›</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={true}
        contentContainerStyle={styles.melodicScrollContent}>
        <View style={styles.melodicRow}>
          {naturalKeys.map((k) => {
            const isActive = activeValue !== null && activeValue !== undefined && Math.abs(k.value - activeValue) < 0.08;
            const isPlayingThisPad = playbackValue !== null && playbackValue !== undefined && Math.abs(k.value - playbackValue) < 0.08;
            return (
              <Pressable
                key={k.note}
                style={[
                  styles.melodicPad,
                  isActive && {
                    borderColor: accentColor,
                    backgroundColor: `${accentColor}30`,
                  },
                  isPlayingThisPad && {
                    borderColor: '#00f5d4',
                    backgroundColor: 'rgba(0, 245, 212, 0.45)',
                    transform: [{ scale: 1.08 }],
                    borderWidth: 2.5,
                    zIndex: 10,
                  },
                ]}
                onPressIn={() => onPressKey(k.value)}>
                <Text style={styles.melodicEmoji}>{instrument.emoji}</Text>
                <Text
                  style={[
                    styles.melodicNote,
                    isActive && { color: accentColor, fontWeight: '900' },
                    isPlayingThisPad && { color: '#00f5d4', fontWeight: '900' },
                  ]}>
                  {k.note}
                </Text>
                <Text
                  style={[
                    styles.melodicFreq,
                    isPlayingThisPad && { color: '#00f5d4', fontWeight: '800' },
                  ]}>
                  {Math.round(k.freq)}Hz
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    width: '100%',
    padding: 2,
  },

  // Cycle bar & step slots (used in both Mix and Single Instrument modes)
  mixWrap: {
    gap: 8,
  },
  mixCycleBar: {
    borderWidth: 1.5,
    borderColor: 'rgba(0, 245, 212, 0.35)',
    borderRadius: 12,
    backgroundColor: 'rgba(0, 245, 212, 0.04)',
    padding: 8,
    gap: 6,
    overflow: 'hidden',
  },
  mixCycleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
    width: '100%',
  },
  mixCycleInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  mixCycleTitle: {
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: '800',
    color: '#00f5d4',
  },
  mixCycleSub: {
    fontFamily: mono,
    fontSize: 8,
    color: theme.textDim,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  mixCycleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  mixRecBtn: {
    borderWidth: 1.5,
    borderColor: 'rgba(255, 68, 68, 0.45)',
    backgroundColor: 'rgba(255, 68, 68, 0.08)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mixRecBtnActive: {
    borderColor: '#ff3333',
    backgroundColor: 'rgba(255, 51, 51, 0.28)',
    shadowColor: '#ff3333',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  mixRecBtnText: {
    fontFamily: mono,
    fontSize: 9,
    color: 'rgba(255, 120, 120, 0.85)',
    letterSpacing: 1,
    fontWeight: '700',
  },
  mixRecBtnTextActive: {
    color: '#ff4444',
    fontWeight: '900',
  },
  mixResetBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 127, 0.4)',
    backgroundColor: 'rgba(255, 0, 127, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 0,
    alignSelf: 'center',
  },
  mixResetBtnText: {
    fontFamily: mono,
    fontSize: 9,
    color: '#ff007f',
    letterSpacing: 1,
    fontWeight: '700',
  },
  mixSlotsRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    width: '100%',
    paddingVertical: 2,
  },
  mixSlot: {
    flex: 1,
    minWidth: 0,
    height: 38,
    borderWidth: 1.5,
    borderColor: theme.border,
    borderRadius: 8,
    backgroundColor: theme.panel,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  mixSlotCurrent: {
    borderColor: '#00f5d4',
    borderWidth: 2,
    backgroundColor: 'rgba(0, 245, 212, 0.12)',
    transform: [{ scale: 1.04 }],
  },
  mixSlotPlaying: {
    borderColor: '#00f5d4',
    borderWidth: 2.5,
    backgroundColor: 'rgba(0, 245, 212, 0.4)',
    transform: [{ scale: 1.08 }],
    zIndex: 10,
  },
  mixSlotText: {
    fontFamily: mono,
    fontSize: 10,
    color: theme.textDim,
    fontWeight: '700',
    textAlign: 'center',
  },
  mixSlotEmoji: {
    fontSize: 16,
  },
  stepSlotNoteText: {
    fontFamily: mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  mixSlotPlayingText: {
    color: '#00f5d4',
    fontWeight: '900',
    fontSize: 12,
  },

  // Big Instrument Cards Grid
  mixGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    width: '100%',
  },
  mixCard: {
    width: '48%',
    height: 48,
    borderWidth: 1.5,
    borderColor: theme.border,
    borderRadius: 10,
    backgroundColor: theme.panel,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 8,
  },
  mixCardEmoji: {
    fontSize: 20,
  },
  mixCardLabel: {
    fontFamily: mono,
    fontSize: 10.5,
    color: theme.text,
    letterSpacing: 0.8,
    fontWeight: '700',
    flex: 1,
  },
  mixCardDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },

  // 3. Surface wrap
  keyboardSurface: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.015)',
    padding: 10,
  },
  surfaceHint: {
    fontFamily: mono,
    fontSize: 9,
    color: theme.textDim,
    letterSpacing: 1.2,
    flex: 1,
  },
  scrollHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  scrollBadge: {
    fontFamily: mono,
    fontSize: 8.5,
    color: '#00f5d4',
    letterSpacing: 1,
    fontWeight: '800',
    backgroundColor: 'rgba(0, 245, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 212, 0.3)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },

  // Piano keys
  pianoWrap: {
    alignItems: 'center',
    width: '100%',
  },
  pianoScrollContent: {
    paddingVertical: 4,
  },
  pianoKeysContainer: {
    position: 'relative',
    height: 145,
  },
  whiteKeysRow: {
    flexDirection: 'row',
    height: 142,
  },
  pianoKey: {
    height: 140,
    backgroundColor: '#0f1829',
    borderWidth: 1,
    borderColor: '#1e2e4b',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
    borderBottomWidth: 3,
    borderBottomColor: '#2a3f65',
    marginRight: 2,
  },
  pianoKeyNote: {
    fontFamily: mono,
    fontSize: 10.5,
    color: theme.text,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  pianoKeyFreq: {
    fontFamily: mono,
    fontSize: 7,
    color: theme.textDim,
    marginTop: 2,
  },
  blackKeysOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 88,
  },
  blackKey: {
    position: 'absolute',
    height: 86,
    backgroundColor: '#050a14',
    borderWidth: 1,
    borderColor: '#334155',
    borderBottomWidth: 3,
    borderBottomColor: '#1e293b',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
    zIndex: 15,
  },
  blackKeyText: {
    fontFamily: mono,
    fontSize: 7.5,
    color: '#94a3b8',
    fontWeight: '800',
  },

  // Drum pads
  drumWrap: {
    width: '100%',
  },
  drumScrollContent: {
    paddingVertical: 4,
  },
  drumTwoRowsContainer: {
    gap: 8,
  },
  drumRow: {
    flexDirection: 'row',
    gap: 8,
  },
  drumPad: {
    width: 82,
    height: 66,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    backgroundColor: theme.panel,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  drumPadEmoji: {
    fontSize: 16,
    marginBottom: 1,
  },
  drumPadLabel: {
    fontFamily: mono,
    fontSize: 8.5,
    color: theme.text,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  drumPadSub: {
    fontFamily: mono,
    fontSize: 6.5,
    color: theme.textDim,
    marginTop: 1,
  },

  // Guitar fretboard
  guitarWrap: {
    width: '100%',
  },
  guitarScrollContent: {
    paddingVertical: 4,
  },
  guitarFretsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    height: 140,
  },
  guitarFretColumn: {
    width: 54,
    height: 135,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(28, 42, 69, 0.6)',
    borderRadius: 8,
    backgroundColor: 'rgba(11, 18, 32, 0.75)',
  },
  guitarNoteText: {
    fontFamily: mono,
    fontSize: 10.5,
    color: theme.text,
    fontWeight: '800',
  },
  guitarWireTrackVertical: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: 12,
  },
  guitarWireVertical: {
    height: '100%',
    backgroundColor: '#ffd16690',
    borderRadius: 1,
  },
  guitarFreqText: {
    fontFamily: mono,
    fontSize: 7.5,
    color: theme.textDim,
    textAlign: 'center',
  },

  // Xylophone bars
  xyloWrap: {
    width: '100%',
  },
  xyloScrollContent: {
    paddingVertical: 4,
  },
  xyloBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    height: 148,
    paddingBottom: 4,
  },
  xyloBar: {
    width: 44,
    borderWidth: 1,
    borderColor: '#1e2e4b',
    borderRadius: 6,
    backgroundColor: '#0f1c30',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  xyloPin: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#38bdf880',
  },
  xyloNote: {
    fontFamily: mono,
    fontSize: 9.5,
    color: theme.text,
    fontWeight: '700',
  },

  // Melodic pads (Flute, Trumpet, Violin, Harp)
  melodicWrap: {
    width: '100%',
  },
  melodicScrollContent: {
    paddingVertical: 4,
  },
  melodicRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    height: 90,
  },
  melodicPad: {
    width: 62,
    height: 80,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    backgroundColor: theme.panel,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  melodicEmoji: {
    fontSize: 18,
    marginBottom: 2,
  },
  melodicNote: {
    fontFamily: mono,
    fontSize: 10.5,
    color: theme.text,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  melodicFreq: {
    fontFamily: mono,
    fontSize: 7.5,
    color: theme.textDim,
    marginTop: 2,
  },
});
