import { useState } from 'react';
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
import { mono, theme } from './theme';

interface Props {
  profile: number[];
  selectedStep: number;
  onSelectStep: (step: number) => void;
  onNoteChange: (step: number, value: number) => void;
  instrument: InstrumentId;
  stepInstruments?: SingleInstrumentId[];
  onStepInstrumentChange?: (step: number, inst: SingleInstrumentId) => void;
  onPlayNote: (value: number, nodeIndex?: number, inst?: SingleInstrumentId) => void;
  color?: string;
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
  onStepInstrumentChange,
  onPlayNote,
  color = theme.player,
}: Props) {
  const [autoAdvance, setAutoAdvance] = useState(true);

  // Active instrument for currently selected step (in Mix Mode, each step has its own instrument)
  const isMix = instrument === 'mix';
  const currentStepInst: SingleInstrumentId = isMix
    ? (stepInstruments?.[selectedStep] || 'piano')
    : (instrument as SingleInstrumentId);

  const currentInstMeta = INSTRUMENTS.find((i) => i.id === currentStepInst)!;
  const currentVal = profile[selectedStep] ?? 0;

  const handleKeyPress = (val: number) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics optional
    }

    onNoteChange(selectedStep, val);
    onPlayNote(val, selectedStep, currentStepInst);

    if (autoAdvance && selectedStep < profile.length - 1) {
      onSelectStep(selectedStep + 1);
    }
  };

  const handleStepSelect = (idx: number) => {
    try {
      Haptics.selectionAsync();
    } catch {
      // Haptics optional
    }
    onSelectStep(idx);
    const stepVal = profile[idx] ?? 0;
    const stepInst = isMix ? (stepInstruments?.[idx] || 'piano') : (instrument as SingleInstrumentId);
    onPlayNote(stepVal, idx, stepInst);
  };

  return (
    <View style={styles.container}>
      {/* ── 1. Sequence Step Tracker ── */}
      <View style={styles.stepHeader}>
        <View style={styles.stepTitleRow}>
          <Text style={styles.sectionLabel}>STEP SEQUENCE</Text>
          <Pressable
            style={[styles.autoAdvanceBtn, autoAdvance && styles.autoAdvanceBtnActive]}
            onPress={() => setAutoAdvance((p) => !p)}>
            <Text style={[styles.autoAdvanceText, autoAdvance && styles.autoAdvanceTextActive]}>
              AUTO-NEXT: {autoAdvance ? 'ON ⏩' : 'OFF'}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stepScroll}>
          {profile.map((val, idx) => {
            const isSelected = selectedStep === idx;
            const stepInst = isMix ? (stepInstruments?.[idx] || 'piano') : (instrument as SingleInstrumentId);
            const stepMeta = INSTRUMENTS.find((i) => i.id === stepInst)!;
            const noteInfo = valueToPianoKey(val);

            // In drum mode, show drum label
            let noteLabel = noteInfo.note;
            if (stepInst === 'drum') {
              const drumMatch = DRUM_PADS.find((d) => Math.abs(d.value - val) < 0.15);
              if (drumMatch) noteLabel = drumMatch.label;
            }

            return (
              <Pressable
                key={`step-${idx}`}
                style={[
                  styles.stepPill,
                  isSelected && {
                    borderColor: stepMeta.color,
                    backgroundColor: `${stepMeta.color}25`,
                    transform: [{ scale: 1.05 }],
                  },
                ]}
                onPress={() => handleStepSelect(idx)}>
                <Text style={[styles.stepNum, isSelected && { color: stepMeta.color, fontWeight: '800' }]}>
                  #{idx + 1}
                </Text>
                {isMix && <Text style={styles.stepEmoji}>{stepMeta.emoji}</Text>}
                <Text
                  style={[
                    styles.stepNote,
                    isSelected && { color: stepMeta.color, fontWeight: '700' },
                  ]}
                  numberOfLines={1}>
                  {noteLabel}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── 2. Mix Mode: Quick Instrument Selector for Current Step ── */}
      {isMix && (
        <View style={styles.mixInstBar}>
          <View style={styles.mixInstHeader}>
            <Text style={styles.mixInstTitle}>
              INSTRUMENT FOR STEP #{selectedStep + 1}:
            </Text>
            <Text style={[styles.mixInstActiveName, { color: currentInstMeta.color }]}>
              {currentInstMeta.emoji} {currentInstMeta.label}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.mixInstScroll}>
            {SINGLE_INSTRUMENTS.map((instId) => {
              const meta = INSTRUMENTS.find((i) => i.id === instId)!;
              const isCurrent = currentStepInst === instId;
              return (
                <Pressable
                  key={instId}
                  style={[
                    styles.mixInstBtn,
                    isCurrent && {
                      borderColor: meta.color,
                      backgroundColor: `${meta.color}30`,
                    },
                  ]}
                  onPress={() => {
                    onStepInstrumentChange?.(selectedStep, instId);
                    onPlayNote(profile[selectedStep] ?? 0, selectedStep, instId);
                  }}>
                  <Text style={styles.mixInstEmoji}>{meta.emoji}</Text>
                  <Text
                    style={[
                      styles.mixInstLabel,
                      isCurrent && { color: meta.color, fontWeight: '700' },
                    ]}>
                    {meta.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── 3. Active Instrument Key Surface ── */}
      <View style={styles.keyboardSurface}>
        {currentStepInst === 'piano' && (
          <PianoKeyboard
            activeValue={currentVal}
            onPressKey={handleKeyPress}
            accentColor={currentInstMeta.color}
          />
        )}

        {currentStepInst === 'drum' && (
          <DrumPads
            activeValue={currentVal}
            onPressPad={handleKeyPress}
            accentColor={currentInstMeta.color}
          />
        )}

        {currentStepInst === 'guitar' && (
          <GuitarFretboard
            activeValue={currentVal}
            onPressString={handleKeyPress}
            accentColor={currentInstMeta.color}
          />
        )}

        {currentStepInst === 'xylophone' && (
          <XylophoneBars
            activeValue={currentVal}
            onPressBar={handleKeyPress}
            accentColor={currentInstMeta.color}
          />
        )}

        {currentStepInst !== 'piano' &&
          currentStepInst !== 'drum' &&
          currentStepInst !== 'guitar' &&
          currentStepInst !== 'xylophone' && (
            <MelodicPads
              activeValue={currentVal}
              onPressKey={handleKeyPress}
              accentColor={currentInstMeta.color}
              instrument={currentInstMeta}
            />
          )}
      </View>
    </View>
  );
}

// ─── 1. Piano Keyboard Surface ───────────────────────────────────────────────

function PianoKeyboard({
  activeValue,
  onPressKey,
  accentColor,
}: {
  activeValue: number;
  onPressKey: (val: number) => void;
  accentColor: string;
}) {
  return (
    <View style={styles.pianoWrap}>
      <Text style={styles.surfaceHint}>
        TAP A PIANO KEY TO RECORD PITCH AT THIS STEP
      </Text>
      <View style={styles.pianoKeysRow}>
        {PIANO_KEYS.map((k) => {
          const isActive = Math.abs(k.value - activeValue) < 0.12;
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
              ]}
              onPress={() => onPressKey(k.value)}>
              <Text
                style={[
                  styles.pianoKeyNote,
                  isActive && { color: accentColor, fontWeight: '900' },
                ]}>
                {k.note}
              </Text>
              <Text style={styles.pianoKeyFreq}>{Math.round(k.freq)}Hz</Text>
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
  onPressPad,
  accentColor,
}: {
  activeValue: number;
  onPressPad: (val: number) => void;
  accentColor: string;
}) {
  return (
    <View style={styles.drumWrap}>
      <Text style={styles.surfaceHint}>
        TAP A DRUM PAD TO RECORD PERCUSSION AT THIS STEP
      </Text>
      <View style={styles.drumGrid}>
        {DRUM_PADS.map((pad) => {
          const isActive = Math.abs(pad.value - activeValue) < 0.12;
          return (
            <Pressable
              key={pad.label}
              style={[
                styles.drumPad,
                isActive && {
                  borderColor: accentColor,
                  backgroundColor: `${accentColor}30`,
                },
              ]}
              onPress={() => onPressPad(pad.value)}>
              <Text style={styles.drumPadEmoji}>{pad.emoji}</Text>
              <Text
                style={[
                  styles.drumPadLabel,
                  isActive && { color: accentColor, fontWeight: '900' },
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
  onPressString,
  accentColor,
}: {
  activeValue: number;
  onPressString: (val: number) => void;
  accentColor: string;
}) {
  return (
    <View style={styles.guitarWrap}>
      <Text style={styles.surfaceHint}>
        TAP AN ACOUSTIC STRING TO STRUM NOTE AT THIS STEP
      </Text>
      <View style={styles.guitarStringsList}>
        {PIANO_KEYS.map((k, i) => {
          const isActive = Math.abs(k.value - activeValue) < 0.12;
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
              ]}
              onPress={() => onPressString(k.value)}>
              <Text
                style={[
                  styles.guitarNoteText,
                  isActive && { color: accentColor, fontWeight: '800' },
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
                  ]}
                />
              </View>

              <Text style={styles.guitarFreqText}>{Math.round(k.freq)}Hz</Text>
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
  onPressBar,
  accentColor,
}: {
  activeValue: number;
  onPressBar: (val: number) => void;
  accentColor: string;
}) {
  return (
    <View style={styles.xyloWrap}>
      <Text style={styles.surfaceHint}>
        TAP A RESONANT CHIME BAR AT THIS STEP
      </Text>
      <View style={styles.xyloBarsRow}>
        {PIANO_KEYS.map((k, i) => {
          const isActive = Math.abs(k.value - activeValue) < 0.12;
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
              ]}
              onPress={() => onPressBar(k.value)}>
              <View style={styles.xyloPin} />
              <Text
                style={[
                  styles.xyloNote,
                  isActive && { color: accentColor, fontWeight: '900' },
                ]}>
                {k.note}
              </Text>
              <View style={styles.xyloPin} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── 5. Universal Melodic Touch Pads (Flute, Trumpet, Violin, Harp) ──────────

function MelodicPads({
  activeValue,
  onPressKey,
  accentColor,
  instrument,
}: {
  activeValue: number;
  onPressKey: (val: number) => void;
  accentColor: string;
  instrument: { label: string; emoji: string };
}) {
  return (
    <View style={styles.melodicWrap}>
      <Text style={styles.surfaceHint}>
        TAP {instrument.label.toUpperCase()} KEYS TO SET STEP PITCH
      </Text>
      <View style={styles.melodicGrid}>
        {PIANO_KEYS.map((k) => {
          const isActive = Math.abs(k.value - activeValue) < 0.12;
          return (
            <Pressable
              key={k.note}
              style={[
                styles.melodicPad,
                isActive && {
                  borderColor: accentColor,
                  backgroundColor: `${accentColor}30`,
                },
              ]}
              onPress={() => onPressKey(k.value)}>
              <Text style={styles.melodicEmoji}>{instrument.emoji}</Text>
              <Text
                style={[
                  styles.melodicNote,
                  isActive && { color: accentColor, fontWeight: '900' },
                ]}>
                {k.note}
              </Text>
              <Text style={styles.melodicFreq}>{Math.round(k.freq)}Hz</Text>
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

  // 1. Step sequence
  stepHeader: {
    marginBottom: 12,
  },
  stepTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionLabel: {
    fontFamily: mono,
    fontSize: 10,
    color: theme.textDim,
    letterSpacing: 2,
    fontWeight: '700',
  },
  autoAdvanceBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  autoAdvanceBtnActive: {
    borderColor: '#00f5d4',
    backgroundColor: '#00f5d415',
  },
  autoAdvanceText: {
    fontFamily: mono,
    fontSize: 9,
    color: theme.textDim,
    letterSpacing: 1,
  },
  autoAdvanceTextActive: {
    color: '#00f5d4',
    fontWeight: '700',
  },
  stepScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  stepPill: {
    width: 52,
    height: 58,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    backgroundColor: theme.panel,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  stepNum: {
    fontFamily: mono,
    fontSize: 9,
    color: theme.textDim,
    letterSpacing: 1,
  },
  stepEmoji: {
    fontSize: 13,
    marginVertical: 1,
  },
  stepNote: {
    fontFamily: mono,
    fontSize: 10,
    color: theme.text,
    fontWeight: '600',
    marginTop: 2,
  },

  // 2. Mix mode instrument selector
  mixInstBar: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    backgroundColor: theme.panel,
    padding: 8,
    marginBottom: 12,
  },
  mixInstHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  mixInstTitle: {
    fontFamily: mono,
    fontSize: 9,
    color: theme.textDim,
    letterSpacing: 1.5,
  },
  mixInstActiveName: {
    fontFamily: mono,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  mixInstScroll: {
    gap: 6,
  },
  mixInstBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'center',
    minWidth: 54,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  mixInstEmoji: {
    fontSize: 16,
    marginBottom: 2,
  },
  mixInstLabel: {
    fontFamily: mono,
    fontSize: 8,
    color: theme.textDim,
    letterSpacing: 1,
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
