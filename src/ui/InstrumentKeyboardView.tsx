import { useState } from 'react';
import {
  Pressable,
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
  selectedStep: number;
  onSelectStep: (step: number) => void;
  onNoteChange: (step: number, value: number) => void;
  instrument: InstrumentId;
  stepInstruments?: SingleInstrumentId[];
  targetStepInstruments?: SingleInstrumentId[];
  activePlaying?: 'target' | 'player' | null;
  onStepInstrumentChange?: (step: number, inst: SingleInstrumentId) => void;
  onPlayNote: (value: number, nodeIndex?: number, inst?: SingleInstrumentId) => void;
  onAutoPlay?: () => void;
  onResetCycle?: () => void;
  color?: string;
  playbackStep?: number | null;
}

// Drum pad definitions mapping directly to PIANO_KEYS pitches
const DRUM_PADS = [
  { label: 'KICK',    sub: 'Sub Thump',    emoji: '🥁', value: -1.0,  note: 'C4' },
  { label: 'PUNCH',   sub: 'Hard Beater',  emoji: '🥊', value: -0.75, note: 'D4' },
  { label: 'LOW TOM', sub: 'Deep Shell',   emoji: '🪘', value: -0.5,  note: 'E4' },
  { label: 'MID TOM', sub: 'Resonant Tom', emoji: '🪘', value: -0.25, note: 'F4' },
  { label: 'SNARE',   sub: 'Crisp Rim',    emoji: '🎯', value: 0.0,   note: 'G4' },
  { label: 'HI-HAT',  sub: 'Tight Hat',    emoji: '🎩', value: 0.5,   note: 'B4' },
  { label: 'SPLASH',  sub: 'Shimmer Cym',  emoji: '💥', value: 0.75,  note: 'C5' },
  { label: 'CRASH',   sub: 'Loud Crash',   emoji: '⚡', value: 1.0,   note: 'D5' },
];

export function InstrumentKeyboardView({
  profile,
  selectedStep,
  onSelectStep,
  onNoteChange,
  instrument,
  stepInstruments,
  targetStepInstruments,
  activePlaying,
  onStepInstrumentChange,
  onPlayNote,
  onAutoPlay,
  onResetCycle,
  color = theme.player,
  playbackStep = null,
}: Props) {
  // Active instrument for currently selected step (in Mix Mode, each step has its own instrument)
  const isMix = instrument === 'mix';
  const totalSteps = profile.length;
  const [prevProfileLength, setPrevProfileLength] = useState(profile.length);
  const [recordStep, setRecordStep] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [lastPressedVal, setLastPressedVal] = useState<number | null>(null);
  const [lastPressedInst, setLastPressedInst] = useState<SingleInstrumentId | null>(null);

  if (profile.length !== prevProfileLength) {
    setPrevProfileLength(profile.length);
    setRecordStep(0);
    setIsRecording(false);
    setLastPressedVal(null);
    setLastPressedInst(null);
  }

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

  const toggleRecording = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Haptics optional
    }
    playUiTap();

    if (activePlaying) {
      onResetCycle?.();
    }

    setIsRecording((prev) => {
      const next = !prev;
      if (next && recordStep >= totalSteps) {
        setRecordStep(0);
        onSelectStep(0);
      }
      return next;
    });
  };

  const handleKeyPress = (val: number) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics optional
    }

    // Always highlight the button the user is actually pressing!
    setLastPressedVal(val);

    // If currently playing audio, stop it
    if (activePlaying) {
      onResetCycle?.();
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
    }

    // 1. Record note for target step
    onNoteChange(targetStep, val);
    onSelectStep(targetStep);

    // 2. Play note for target step with the current instrument
    onPlayNote(val, targetStep, currentStepInst);

    const nextStep = targetStep + 1;
    setRecordStep(nextStep);

    // 3. If cycle completed, automatically trigger playback of "Mine" and return to test mode
    if (nextStep >= totalSteps) {
      setIsRecording(false);
      setTimeout(() => {
        onAutoPlay?.();
      }, 280);
    }
  };

  const handleStepSlotPress = (idx: number) => {
    try {
      Haptics.selectionAsync();
    } catch {
      // Haptics optional
    }
    if (activePlaying) {
      onResetCycle?.();
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
  };

  const handleMixInstrumentPress = (instId: SingleInstrumentId) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics optional
    }

    // Always highlight the instrument button the user is actually pressing!
    setLastPressedInst(instId);

    // If currently playing audio, stop it
    if (activePlaying) {
      onResetCycle?.();
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
    }

    // 1. Record instrument for target step
    onStepInstrumentChange?.(targetStep, instId);
    onSelectStep(targetStep);

    // 2. Play note for target step with the selected instrument
    const noteVal = profile[targetStep] ?? 0;
    onPlayNote(noteVal, targetStep, instId);

    const nextStep = targetStep + 1;
    setRecordStep(nextStep);

    // 3. If cycle completed, automatically trigger playback of "Mine" and return to test mode
    if (nextStep >= totalSteps) {
      setIsRecording(false);
      setTimeout(() => {
        onAutoPlay?.();
      }, 280);
    }
  };

  const handleResetCycle = () => {
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
    onResetCycle?.();
  };

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
  return (
    <View style={styles.pianoWrap}>
      <Text style={styles.surfaceHint}>
        TAP A PIANO KEY TO TEST OR RECORD PITCH
      </Text>
      <View style={styles.pianoKeysRow}>
        {PIANO_KEYS.map((k) => {
          const isActive = activeValue !== null && activeValue !== undefined && Math.abs(k.value - activeValue) < 0.12;
          const isPlayingThisKey = playbackValue !== null && playbackValue !== undefined && Math.abs(k.value - playbackValue) < 0.12;
          return (
            <Pressable
              key={k.note}
              style={[
                styles.pianoKey,
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
                  transform: [{ scale: 1.06 }],
                  zIndex: 10,
                },
              ]}
              onPress={() => onPressKey(k.value)}>
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
  return (
    <View style={styles.drumWrap}>
      <Text style={styles.surfaceHint}>
        TAP A DRUM PAD TO TEST OR RECORD PERCUSSION
      </Text>
      <View style={styles.drumGrid}>
        {DRUM_PADS.map((pad) => {
          const isActive = activeValue !== null && activeValue !== undefined && Math.abs(pad.value - activeValue) < 0.12;
          const isPlayingThisPad = playbackValue !== null && playbackValue !== undefined && Math.abs(pad.value - playbackValue) < 0.12;
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
              onPress={() => onPressPad(pad.value)}>
              <Text style={styles.drumPadEmoji}>{pad.emoji}</Text>
              <Text
                style={[
                  styles.drumPadLabel,
                  isActive && { color: accentColor, fontWeight: '900' },
                  isPlayingThisPad && { color: '#00f5d4', fontWeight: '900' },
                ]}>
                {pad.label}
              </Text>
              <Text style={styles.drumPadSub}>{pad.sub}</Text>
            </Pressable>
          );
        })}
      </View>
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
  return (
    <View style={styles.guitarWrap}>
      <Text style={styles.surfaceHint}>
        TAP AN ACOUSTIC STRING TO TEST OR RECORD NOTE
      </Text>
      <View style={styles.guitarStringsList}>
        {PIANO_KEYS.map((k, i) => {
          const isActive = activeValue !== null && activeValue !== undefined && Math.abs(k.value - activeValue) < 0.12;
          const isPlayingThisFret = playbackValue !== null && playbackValue !== undefined && Math.abs(k.value - playbackValue) < 0.12;
          const stringGirth = Math.max(1.5, 4.5 - i * 0.35);
          return (
            <Pressable
              key={k.note}
              style={[
                styles.guitarStringRow,
                isActive && {
                  backgroundColor: `${accentColor}25`,
                  borderColor: accentColor,
                },
                isPlayingThisFret && {
                  backgroundColor: 'rgba(0, 245, 212, 0.35)',
                  borderColor: '#00f5d4',
                  borderWidth: 2,
                  transform: [{ scale: 1.03 }],
                  zIndex: 10,
                },
              ]}
              onPress={() => onPressString(k.value)}>
              <Text
                style={[
                  styles.guitarNoteText,
                  isActive && { color: accentColor, fontWeight: '800' },
                  isPlayingThisFret && { color: '#00f5d4', fontWeight: '900' },
                ]}>
                {k.note}
              </Text>

              {/* Graphical guitar string with metallic glow */}
              <View style={styles.guitarWireTrack}>
                <View
                  style={[
                    styles.guitarWire,
                    { height: stringGirth },
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
  return (
    <View style={styles.xyloWrap}>
      <Text style={styles.surfaceHint}>
        TAP A RESONANT CHIME BAR TO TEST OR RECORD NOTE
      </Text>
      <View style={styles.xyloBarsRow}>
        {PIANO_KEYS.map((k, i) => {
          const isActive = activeValue !== null && activeValue !== undefined && Math.abs(k.value - activeValue) < 0.12;
          const isPlayingThisBar = playbackValue !== null && playbackValue !== undefined && Math.abs(k.value - playbackValue) < 0.12;
          // Lower pitch = longer bar (130px), Higher pitch = shorter bar (75px)
          const barHeight = 135 - i * 7;
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
              onPress={() => onPressBar(k.value)}>
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
  return (
    <View style={styles.melodicWrap}>
      <Text style={styles.surfaceHint}>
        TAP {instrument.label.toUpperCase()} KEYS TO TEST OR RECORD PITCH
      </Text>
      <View style={styles.melodicGrid}>
        {PIANO_KEYS.map((k) => {
          const isActive = activeValue !== null && activeValue !== undefined && Math.abs(k.value - activeValue) < 0.12;
          const isPlayingThisPad = playbackValue !== null && playbackValue !== undefined && Math.abs(k.value - playbackValue) < 0.12;
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
              onPress={() => onPressKey(k.value)}>
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
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: 10,
  },

  // Piano keys
  pianoWrap: {
    alignItems: 'center',
  },
  pianoKeysRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    width: '100%',
  },
  pianoKey: {
    flex: 1,
    height: 140,
    backgroundColor: '#0f1829',
    borderWidth: 1,
    borderColor: '#1e2e4b',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 10,
    borderBottomWidth: 3,
    borderBottomColor: '#2a3f65',
  },
  pianoKeyNote: {
    fontFamily: mono,
    fontSize: 11,
    color: theme.text,
    fontWeight: '700',
    letterSpacing: 1,
  },
  pianoKeyFreq: {
    fontFamily: mono,
    fontSize: 7.5,
    color: theme.textDim,
    marginTop: 3,
  },

  // Drum pads
  drumWrap: {},
  drumGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  drumPad: {
    width: '23%',
    height: 72,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    backgroundColor: theme.panel,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  drumPadEmoji: {
    fontSize: 18,
    marginBottom: 2,
  },
  drumPadLabel: {
    fontFamily: mono,
    fontSize: 9,
    color: theme.text,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
  },
  drumPadSub: {
    fontFamily: mono,
    fontSize: 7,
    color: theme.textDim,
    marginTop: 2,
  },

  // Guitar fretboard
  guitarWrap: {},
  guitarStringsList: {
    gap: 6,
  },
  guitarStringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 22,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(28, 42, 69, 0.4)',
    borderRadius: 6,
    backgroundColor: 'rgba(11, 18, 32, 0.6)',
  },
  guitarNoteText: {
    fontFamily: mono,
    fontSize: 10,
    color: theme.text,
    width: 32,
    fontWeight: '700',
  },
  guitarWireTrack: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  guitarWire: {
    width: '100%',
    backgroundColor: '#ffd16670',
    borderRadius: 1,
  },
  guitarFreqText: {
    fontFamily: mono,
    fontSize: 8,
    color: theme.textDim,
    width: 36,
    textAlign: 'right',
  },

  // Xylophone bars
  xyloWrap: {},
  xyloBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 5,
    height: 145,
    paddingBottom: 4,
  },
  xyloBar: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1e2e4b',
    borderRadius: 5,
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
    fontSize: 10,
    color: theme.text,
    fontWeight: '700',
  },

  // Melodic pads (Flute, Trumpet, Violin, Harp)
  melodicWrap: {},
  melodicGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  melodicPad: {
    width: '30%',
    height: 68,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    backgroundColor: theme.panel,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  melodicEmoji: {
    fontSize: 16,
    marginBottom: 2,
  },
  melodicNote: {
    fontFamily: mono,
    fontSize: 11,
    color: theme.text,
    fontWeight: '700',
    letterSpacing: 1,
  },
  melodicFreq: {
    fontFamily: mono,
    fontSize: 8,
    color: theme.textDim,
    marginTop: 2,
  },
});
