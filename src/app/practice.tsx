import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  GestureResponderEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Haptics from 'expo-haptics';

import {
  INSTRUMENTS,
  renderNote,
  SingleInstrumentId,
} from '../audio/instruments';
import { loadClip, playClip, releaseClip, stopClip } from '../audio/player';
import { playUiTap } from '../audio/sfx';
import { bufferToAudioUri } from '../audio/storage';
import { useInstrument } from '../game/InstrumentContext';
import { mono, theme } from '../ui/theme';
import {
  DrumPadData,
  exportWavFile,
  getPianoKeys,
  LayerTrack,
  PRACTICE_DRUM_PADS,
  PracticeNoteEvent,
  renderDrumPadSound,
  renderPracticeEvents,
  renderTimelineMix,
  SavedLoopClip,
  TimelineClipPlacement,
} from '../audio/practiceAudio';

export const GUITAR_CHORDS = [
  { id: 'open', label: 'STANDARD OPEN', strings: [82.41, 110.00, 146.83, 196.00, 246.94, 329.63], notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'em',   label: 'Em CHORD',      strings: [82.41, 123.47, 164.81, 196.00, 246.94, 329.63], notes: ['E2', 'B2', 'E3', 'G3', 'B3', 'E4'] },
  { id: 'g',    label: 'G MAJOR',       strings: [98.00, 123.47, 146.83, 196.00, 246.94, 392.00], notes: ['G2', 'B2', 'D3', 'G3', 'B3', 'G4'] },
  { id: 'c',    label: 'C MAJOR',       strings: [82.41, 130.81, 164.81, 196.00, 261.63, 329.63], notes: ['E2', 'C3', 'E3', 'G3', 'C4', 'E4'] },
  { id: 'd',    label: 'D MAJOR',       strings: [82.41, 110.00, 146.83, 220.00, 293.66, 369.99], notes: ['E2', 'A2', 'D3', 'A3', 'D4', 'F#4'] },
  { id: 'am',   label: 'Am CHORD',      strings: [82.41, 110.00, 164.81, 220.00, 261.63, 329.63], notes: ['E2', 'A2', 'E3', 'A3', 'C4', 'E4'] },
  { id: 'fret2',label: 'FRET 2 (F#)',   strings: [92.50, 123.47, 164.81, 220.00, 277.18, 369.99], notes: ['F#2', 'B2', 'E3', 'A3', 'C#4', 'F#4'] },
  { id: 'fret3',label: 'FRET 3 (G)',    strings: [98.00, 130.81, 174.61, 233.08, 293.66, 392.00], notes: ['G2', 'C3', 'F3', 'Bb3', 'D4', 'G4'] },
];

export const GUITAR_STRINGS_META = [
  { num: 6, label: '6th (Low E)', thickness: 4.2, color: '#eab308' },
  { num: 5, label: '5th (A)',     thickness: 3.5, color: '#f59e0b' },
  { num: 4, label: '4th (D)',     thickness: 2.8, color: '#d97706' },
  { num: 3, label: '3rd (G)',     thickness: 2.2, color: '#fbbf24' },
  { num: 2, label: '2nd (B)',     thickness: 1.6, color: '#fde68a' },
  { num: 1, label: '1st (High E)',thickness: 1.1, color: '#ffffff' },
];

const WHITE_KEY_WIDTH = 54;
const BLACK_KEY_WIDTH = 32;

// 5 Octaves: C2 through C7 (61 keys total: 36 white keys, 25 black keys)
const PRACTICE_PIANO_KEYS = getPianoKeys(2, 5);
const PRACTICE_WHITE_KEYS = PRACTICE_PIANO_KEYS.filter((k) => !k.isBlack);
const PRACTICE_BLACK_KEYS = PRACTICE_PIANO_KEYS.filter((k) => k.isBlack);

const DEFAULT_TRACKS: LayerTrack[] = [
  { id: 'tr_drums',  name: 'PERCUSSION', instrumentType: 'drum',   color: '#e11d48', emoji: '🥁', muted: false, solo: false, volume: 1.0 },
  { id: 'tr_keys',   name: 'PIANO/KEYS', instrumentType: 'piano',  color: '#ff3df0', emoji: '🎹', muted: false, solo: false, volume: 1.0 },
  { id: 'tr_guitar', name: 'GUITAR',     instrumentType: 'guitar', color: '#ffd166', emoji: '🎸', muted: false, solo: false, volume: 1.0 },
  { id: 'tr_synth',  name: 'SYNTH/BRASS',instrumentType: 'synth',  color: '#00e5ff', emoji: '🎛️', muted: false, solo: false, volume: 1.0 },
];

export default function PracticeScreen() {
  const router = useRouter();
  const { selectedInstrument } = useInstrument();

  const isMixMode = selectedInstrument === 'mix';

  // Active instrument in recorder (defaults to selected instrument, or 'piano' / 'drum' in mix mode)
  const [activeInst, setActiveInst] = useState<SingleInstrumentId>(
    isMixMode ? 'piano' : (selectedInstrument as SingleInstrumentId)
  );

  // View mode in Mix Mode: 'record' (Instrument keys/pads) or 'arranger' (Multi-track timeline)
  const [mixTab, setMixTab] = useState<'record' | 'arranger'>('record');

  // Octave for piano/melodic keyboard (defaults to 4)
  const [octave, setOctave] = useState(4);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const [recordElapsedSec, setRecordElapsedSec] = useState(0);
  const recordingStartRef = useRef<number>(0);
  const recordedEventsRef = useRef<PracticeNoteEvent[]>([]);
  const stopRecordingRef = useRef<() => void>(() => {});

  // Single instrument recorded clip
  const [singleClipSamples, setSingleClipSamples] = useState<Float32Array | null>(null);
  const [singleClipDuration, setSingleClipDuration] = useState(0);
  const [isPlayingSingleClip, setIsPlayingSingleClip] = useState(false);
  const singleClipPlayerIdRef = useRef<number | null>(null);

  // Mix Mode: Saved Loops Library
  const [savedLoops, setSavedLoops] = useState<SavedLoopClip[]>([]);
  const [previewingLoopId, setPreviewingLoopId] = useState<string | null>(null);
  const loopPreviewPlayerIdRef = useRef<number | null>(null);

  // Mix Mode: Layer Timeline Arranger State
  const [tracks, setTracks] = useState<LayerTrack[]>(DEFAULT_TRACKS);
  const [placements, setPlacements] = useState<TimelineClipPlacement[]>([]);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState(false);
  const [timelinePlayheadSec, setTimelinePlayheadSec] = useState(0);
  const timelinePlayerIdRef = useRef<number | null>(null);
  const timelineIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Add Loop to Track Picker Modal
  const [selectedTrackForAdd, setSelectedTrackForAdd] = useState<string | null>(null);

  // Pro 1-Minute Extension Modal
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [isProUnlocked, setIsProUnlocked] = useState(false);

  // Active pressed key feedback
  const [activeKeyNote, setActiveKeyNote] = useState<string | null>(null);

  // Cached live note audio players for zero-latency instant playback
  const liveNoteClipsRef = useRef<Map<string, number>>(new Map());

  // Guitar Practice Mode Strumming & Chords State
  const [guitarChordIdx, setGuitarChordIdx] = useState(0);
  const [vibratingString, setVibratingString] = useState<number | null>(null);
  const lastStrummedStringRef = useRef<number | null>(null);
  const strumBoardHeightRef = useRef<number>(180);

  const handleStrumMove = (evt: GestureResponderEvent) => {
    const y = evt.nativeEvent.locationY;
    const boardH = Math.max(120, strumBoardHeightRef.current);
    const stringIdx = Math.min(5, Math.max(0, Math.floor((y / boardH) * 6)));
    if (stringIdx !== lastStrummedStringRef.current) {
      lastStrummedStringRef.current = stringIdx;
      const chord = GUITAR_CHORDS[guitarChordIdx];
      const note = chord.notes[stringIdx];
      const freq = chord.strings[stringIdx];
      setVibratingString(stringIdx);
      setTimeout(() => setVibratingString((prev) => (prev === stringIdx ? null : prev)), 260);
      playNoteAudio(note, freq);
    }
  };

  const handleStrumRelease = () => {
    lastStrummedStringRef.current = null;
  };

  const pluckGuitarString = (stringIdx: number) => {
    const chord = GUITAR_CHORDS[guitarChordIdx];
    const note = chord.notes[stringIdx];
    const freq = chord.strings[stringIdx];
    setVibratingString(stringIdx);
    setTimeout(() => setVibratingString((prev) => (prev === stringIdx ? null : prev)), 260);
    playNoteAudio(note, freq);
  };

  // ─── Screen Orientation Lock ──────────────────────────────────────────────

  useEffect(() => {
    // Switch to Landscape on mount
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    const activeNoteClips = liveNoteClipsRef.current;
    return () => {
      // Restore to Portrait on unmount
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      // Stop any audio
      if (singleClipPlayerIdRef.current) stopClip(singleClipPlayerIdRef.current);
      if (loopPreviewPlayerIdRef.current) stopClip(loopPreviewPlayerIdRef.current);
      if (timelinePlayerIdRef.current) stopClip(timelinePlayerIdRef.current);
      // Clean up cached note players
      for (const [, clipId] of activeNoteClips) {
        releaseClip(clipId);
      }
      activeNoteClips.clear();
    };
  }, []);

  const handleExit = () => {
    playUiTap();
    if (singleClipPlayerIdRef.current) stopClip(singleClipPlayerIdRef.current);
    if (loopPreviewPlayerIdRef.current) stopClip(loopPreviewPlayerIdRef.current);
    if (timelinePlayerIdRef.current) stopClip(timelinePlayerIdRef.current);
    for (const [, clipId] of liveNoteClipsRef.current) {
      releaseClip(clipId);
    }
    liveNoteClipsRef.current.clear();
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    router.back();
  };

  // ─── Recording Timer ──────────────────────────────────────────────────────

  const maxDurationSec = isProUnlocked ? 120.0 : 60.0;

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isRecording) {
      interval = setInterval(() => {
        const elapsed = (Date.now() - recordingStartRef.current) / 1000;
        setRecordElapsedSec(elapsed);
        if (elapsed >= maxDurationSec) {
          stopRecordingRef.current();
        }
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, maxDurationSec]);

  // ─── Note Triggering & Recording ──────────────────────────────────────────

  const playNoteAudio = useCallback(
    (noteName: string, freq: number, padType?: DrumPadData['type']) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}

      setActiveKeyNote(noteName);
      setTimeout(() => setActiveKeyNote((prev) => (prev === noteName ? null : prev)), 200);

      // Play audio live instantly with zero-latency caching
      try {
        if (activeInst === 'drum' && padType) {
          const cacheKey = `drum_${padType}`;
          let clipId = liveNoteClipsRef.current.get(cacheKey);
          if (clipId === undefined) {
            const samples = renderDrumPadSound(padType);
            clipId = loadClip(samples, bufferToAudioUri);
            liveNoteClipsRef.current.set(cacheKey, clipId);
          }
          playClip(clipId, false);
        } else {
          const cacheKey = `${activeInst}_${noteName}`;
          let clipId = liveNoteClipsRef.current.get(cacheKey);
          if (clipId === undefined) {
            const samples = renderNote(freq, activeInst, 0.45);
            clipId = loadClip(samples, bufferToAudioUri);
            liveNoteClipsRef.current.set(cacheKey, clipId);
          }
          playClip(clipId, false);
        }
      } catch (err) {
        console.warn('Live note play error:', err);
      }

      // Record note if currently recording
      if (isRecordingRef.current) {
        const timestampSec = (Date.now() - recordingStartRef.current) / 1000;
        recordedEventsRef.current.push({
          id: `ev_${Date.now()}_${Math.random()}`,
          inst: activeInst,
          note: noteName,
          freq,
          timestampSec,
          durationSec: 0.45,
        });
      }
    },
    [activeInst]
  );

  const startRecording = () => {
    playUiTap();
    if (singleClipPlayerIdRef.current) {
      stopClip(singleClipPlayerIdRef.current);
      setIsPlayingSingleClip(false);
    }
    recordedEventsRef.current = [];
    recordingStartRef.current = Date.now();
    isRecordingRef.current = true;
    setRecordElapsedSec(0);
    setIsRecording(true);
  };

  const stopRecording = useCallback(() => {
    playUiTap();
    isRecordingRef.current = false;
    setIsRecording(false);
    setRecordElapsedSec(0);
    const duration = Math.max(1.0, (Date.now() - recordingStartRef.current) / 1000);
    const events = [...recordedEventsRef.current];

    if (events.length === 0) {
      Alert.alert('Empty Recording', 'No notes were played during recording.');
      return;
    }

    const samples = renderPracticeEvents(events, duration);

    if (isMixMode) {
      // Save as loop clip
      const instMeta = INSTRUMENTS.find((i) => i.id === activeInst)!;
      const countForInst = savedLoops.filter((l) => l.instrument === activeInst).length + 1;
      const newLoop: SavedLoopClip = {
        id: `loop_${Date.now()}`,
        name: `${instMeta.emoji} ${instMeta.label} Loop ${countForInst}`,
        instrument: activeInst,
        durationSec: Math.min(maxDurationSec, Math.ceil(duration * 10) / 10),
        events,
        color: instMeta.color,
        emoji: instMeta.emoji,
        samples,
      };

      setSavedLoops((prev) => [newLoop, ...prev]);

      // Automatically place on the default corresponding track in the timeline
      const targetTrack = tracks.find((t) => t.instrumentType === activeInst) || tracks[0];
      if (targetTrack) {
        // Place at offset 0 or after existing clips on that track
        const existingTrackPlacements = placements.filter((p) => p.trackId === targetTrack.id);
        const lastEnd = existingTrackPlacements.reduce((max, p) => {
          const l = savedLoops.find((x) => x.id === p.loopId);
          return Math.max(max, p.startSec + (l?.durationSec || 4.0));
        }, 0);
        const newStart = lastEnd < maxDurationSec - 1 ? lastEnd : 0;

        setPlacements((prev) => [
          ...prev,
          {
            id: `pl_${Date.now()}`,
            loopId: newLoop.id,
            trackId: targetTrack.id,
            startSec: Math.floor(newStart),
          },
        ]);
      }

      Alert.alert(
        'Loop Saved! 🎵',
        `"${newLoop.name}" (${newLoop.durationSec.toFixed(1)}s) was saved! You can record another instrument or open the Layer Arranger to build your track.`
      );
    } else {
      // Single Instrument Mode
      setSingleClipSamples(samples);
      setSingleClipDuration(duration);
    }
  }, [activeInst, isMixMode, maxDurationSec, placements, savedLoops, tracks]);

  // Keep stopRecordingRef updated
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  // ─── Single Instrument Playback & Export ──────────────────────────────────

  const togglePlaySingleClip = () => {
    if (!singleClipSamples) return;
    if (isPlayingSingleClip) {
      if (singleClipPlayerIdRef.current) stopClip(singleClipPlayerIdRef.current);
      setIsPlayingSingleClip(false);
      return;
    }

    setIsPlayingSingleClip(true);
    const clipId = loadClip(singleClipSamples, bufferToAudioUri);
    singleClipPlayerIdRef.current = clipId;
    playClip(clipId, false, () => {
      setIsPlayingSingleClip(false);
    });
  };

  const handleExportSingleClip = async () => {
    if (!singleClipSamples) return;
    const instName = activeInst.toUpperCase();
    const filename = `ShakeWaves_${instName}_Sequence_${Date.now()}.wav`;
    const res = await exportWavFile(singleClipSamples, filename);
    if (res.success) {
      Alert.alert('Audio File Ready! 🎧', res.message);
    } else {
      Alert.alert('Export Failed', res.message);
    }
  };

  // ─── Loop Preview in Library ──────────────────────────────────────────────

  const togglePreviewLoop = (loop: SavedLoopClip) => {
    if (previewingLoopId === loop.id) {
      if (loopPreviewPlayerIdRef.current) stopClip(loopPreviewPlayerIdRef.current);
      setPreviewingLoopId(null);
      return;
    }
    if (loopPreviewPlayerIdRef.current) stopClip(loopPreviewPlayerIdRef.current);

    setPreviewingLoopId(loop.id);
    const clipId = loadClip(loop.samples, bufferToAudioUri);
    loopPreviewPlayerIdRef.current = clipId;
    playClip(clipId, false, () => {
      setPreviewingLoopId(null);
    });
  };

  const deleteLoop = (loopId: string) => {
    setSavedLoops((prev) => prev.filter((l) => l.id !== loopId));
    setPlacements((prev) => prev.filter((p) => p.loopId !== loopId));
    if (previewingLoopId === loopId) {
      if (loopPreviewPlayerIdRef.current) stopClip(loopPreviewPlayerIdRef.current);
      setPreviewingLoopId(null);
    }
  };

  // ─── Timeline Arranger Controls ───────────────────────────────────────────

  const togglePlayTimeline = () => {
    if (isPlayingTimeline) {
      if (timelinePlayerIdRef.current) stopClip(timelinePlayerIdRef.current);
      if (timelineIntervalRef.current) clearInterval(timelineIntervalRef.current);
      setIsPlayingTimeline(false);
      setTimelinePlayheadSec(0);
      return;
    }

    if (placements.length === 0) {
      Alert.alert('Empty Timeline', 'Add some saved loops to your tracks before playing!');
      return;
    }

    // Render master mix
    const mixSamples = renderTimelineMix(tracks, placements, savedLoops, maxDurationSec);
    const clipId = loadClip(mixSamples, bufferToAudioUri);
    timelinePlayerIdRef.current = clipId;

    setIsPlayingTimeline(true);
    setTimelinePlayheadSec(0);

    const startTime = Date.now();
    timelineIntervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      setTimelinePlayheadSec(elapsed);
      if (elapsed >= maxDurationSec) {
        if (timelineIntervalRef.current) clearInterval(timelineIntervalRef.current);
        setIsPlayingTimeline(false);
        setTimelinePlayheadSec(0);
      }
    }, 100);

    playClip(clipId, false, () => {
      if (timelineIntervalRef.current) clearInterval(timelineIntervalRef.current);
      setIsPlayingTimeline(false);
      setTimelinePlayheadSec(0);
    });
  };

  const handleExportTimeline = async () => {
    if (placements.length === 0) {
      Alert.alert('No Loops Arranged', 'Add some saved loops to tracks before exporting.');
      return;
    }
    const mixSamples = renderTimelineMix(tracks, placements, savedLoops, maxDurationSec);
    const filename = `ShakeWaves_MultiTrack_Mix_${Date.now()}.wav`;
    const res = await exportWavFile(mixSamples, filename);
    if (res.success) {
      Alert.alert('Master Song Ready! 🎵', res.message);
    } else {
      Alert.alert('Export Failed', res.message);
    }
  };

  const nudgePlacement = (plId: string, deltaSec: number) => {
    setPlacements((prev) =>
      prev.map((p) => {
        if (p.id !== plId) return p;
        const newStart = Math.max(0, Math.min(maxDurationSec - 1, p.startSec + deltaSec));
        return { ...p, startSec: Math.round(newStart * 10) / 10 };
      })
    );
  };

  const duplicatePlacement = (pl: TimelineClipPlacement) => {
    const loop = savedLoops.find((l) => l.id === pl.loopId);
    const offset = loop ? loop.durationSec : 4.0;
    const newStart = Math.min(maxDurationSec - 1, pl.startSec + offset);
    setPlacements((prev) => [
      ...prev,
      {
        id: `pl_${Date.now()}_${Math.random()}`,
        loopId: pl.loopId,
        trackId: pl.trackId,
        startSec: Math.round(newStart * 10) / 10,
      },
    ]);
  };

  const removePlacement = (plId: string) => {
    setPlacements((prev) => prev.filter((p) => p.id !== plId));
  };

  const addLoopToTrack = (loopId: string, trackId: string) => {
    const existing = placements.filter((p) => p.trackId === trackId);
    const lastEnd = existing.reduce((max, p) => {
      const l = savedLoops.find((x) => x.id === p.loopId);
      return Math.max(max, p.startSec + (l?.durationSec || 4.0));
    }, 0);
    const newStart = lastEnd < maxDurationSec - 1 ? lastEnd : 0;

    setPlacements((prev) => [
      ...prev,
      {
        id: `pl_${Date.now()}`,
        loopId,
        trackId,
        startSec: Math.floor(newStart),
      },
    ]);
    setSelectedTrackForAdd(null);
  };

  // ─── Piano Keys Calculation (Full 5-Octave Scrollable Keyboard C2-C7) ─────
  const pianoScrollRef = useRef<any>(null);
  const drumScrollRef = useRef<any>(null);
  const whiteKeys = PRACTICE_WHITE_KEYS;
  const blackKeys = PRACTICE_BLACK_KEYS;

  const activeMeta = INSTRUMENTS.find((i) => i.id === activeInst)!;

  // Auto-scroll piano to Middle C (C4) on melodic switch, or reset drum to start
  useEffect(() => {
    if (activeInst === 'drum') {
      drumScrollRef.current?.scrollTo({ x: 0, animated: false });
      const timer = setTimeout(() => {
        drumScrollRef.current?.scrollTo({ x: 0, animated: false });
      }, 50);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        pianoScrollRef.current?.scrollTo({ x: 14 * WHITE_KEY_WIDTH - 120, animated: true });
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [activeInst]);

  const scrollToOctave = (oct: number) => {
    playUiTap();
    setOctave(oct);
    const targetX = Math.max(0, (oct - 2) * 7 * WHITE_KEY_WIDTH - 60);
    pianoScrollRef.current?.scrollTo({ x: targetX, animated: true });
  };

  // ─── Format Time Helper ───────────────────────────────────────────────────

  const formatSec = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      {/* ── Top Header Navigation Bar ── */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={handleExit}>
          <Text style={styles.backBtnText}>‹ EXIT</Text>
        </Pressable>

        <View style={styles.titleWrap}>
          <Text style={styles.titleText}>
            {isMixMode ? '🔀 MULTI-INSTRUMENT LOOP STUDIO' : `${activeMeta.emoji} ${activeMeta.label.toUpperCase()} PRACTICE`}
          </Text>
          <Text style={styles.subTitleText}>
            {isMixMode
              ? 'Record loops per instrument, then arrange tracks in the layer system'
              : `Freely play, record up to ${maxDurationSec}s & export as WAV audio`}
          </Text>
        </View>

        {isMixMode ? (
          <View style={styles.tabSwitch}>
            <Pressable
              style={[styles.tabBtn, mixTab === 'record' && styles.tabBtnActive]}
              onPress={() => setMixTab('record')}>
              <Text style={[styles.tabBtnText, mixTab === 'record' && styles.tabBtnTextActive]}>
                🎹 RECORDER
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tabBtn, mixTab === 'arranger' && styles.tabBtnActive]}
              onPress={() => setMixTab('arranger')}>
              <Text style={[styles.tabBtnText, mixTab === 'arranger' && styles.tabBtnTextActive]}>
                🎛️ LAYERS ({savedLoops.length})
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.singleActionsHeader}>
            {singleClipSamples && (
              <>
                <Pressable
                  style={[styles.headActionBtn, isPlayingSingleClip && styles.headActionBtnActive]}
                  onPress={togglePlaySingleClip}>
                  <Text style={styles.headActionBtnText}>
                    {isPlayingSingleClip ? '■ STOP' : `▶ PLAY (${singleClipDuration.toFixed(1)}s)`}
                  </Text>
                </Pressable>
                <Pressable style={styles.headActionBtnSave} onPress={handleExportSingleClip}>
                  <Text style={styles.headActionBtnSaveText}>💾 SAVE / EXPORT</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </View>

      {/* ── Main Workspace Body ── */}
      {isMixMode && mixTab === 'arranger' ? (
        /* ══════════════════════════════════════════════════════════════════════
           MIX MODE: LAYER ARRANGER (MULTI-TRACK TIMELINE)
           ══════════════════════════════════════════════════════════════════════ */
        <View style={styles.timelineWorkspace}>
          {/* Arranger Top Bar */}
          <View style={styles.timelineHeader}>
            <View style={styles.timelineControlGroup}>
              <Pressable
                style={[styles.playTimelineBtn, isPlayingTimeline && styles.playTimelineBtnActive]}
                onPress={togglePlayTimeline}>
                <Text style={styles.playTimelineBtnText}>
                  {isPlayingTimeline ? '■ STOP MIX' : '▶ PLAY ALL TRACKS'}
                </Text>
              </Pressable>

              <View style={styles.timeBadge}>
                <Text style={styles.timeBadgeText}>
                  ⏱ {formatSec(isPlayingTimeline ? timelinePlayheadSec : 0)} / {formatSec(maxDurationSec)}
                </Text>
              </View>

              <Pressable style={styles.exportTimelineBtn} onPress={handleExportTimeline}>
                <Text style={styles.exportTimelineBtnText}>💾 EXPORT FULL MIX</Text>
              </Pressable>
            </View>

            {/* Pro Button: Buy / Unlock 1 More Min */}
            <Pressable
              style={[styles.buyMinBtn, isProUnlocked && styles.buyMinBtnUnlocked]}
              onPress={() => setShowBuyModal(true)}>
              <Text style={styles.buyMinBtnText}>
                {isProUnlocked ? '⭐ 2 MIN UNLOCKED' : '⭐ BUY +1 MINUTE ($0.99)'}
              </Text>
            </Pressable>
          </View>

          {/* Arranger Multi-Track Scroll View */}
          <ScrollView style={styles.tracksScrollView} showsVerticalScrollIndicator={false}>
            {tracks.map((track) => {
              const trackPlacements = placements.filter((p) => p.trackId === track.id);
              return (
                <View key={track.id} style={styles.trackRow}>
                  {/* Track Left Info */}
                  <View style={[styles.trackSide, { borderColor: track.color }]}>
                    <Text style={styles.trackEmoji}>{track.emoji}</Text>
                    <Text style={[styles.trackName, { color: track.color }]} numberOfLines={1}>
                      {track.name}
                    </Text>
                    <View style={styles.trackSideBtns}>
                      <Pressable
                        style={[styles.trackMuteBtn, track.muted && styles.trackMuteBtnActive]}
                        onPress={() =>
                          setTracks((prev) =>
                            prev.map((t) => (t.id === track.id ? { ...t, muted: !t.muted } : t))
                          )
                        }>
                        <Text style={styles.trackMuteText}>{track.muted ? 'UNMUTE' : 'MUTE'}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.addLoopBtn}
                        onPress={() => setSelectedTrackForAdd(track.id)}>
                        <Text style={styles.addLoopBtnText}>+ LOOP</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Track Horizontal Timeline Strip */}
                  <View style={styles.trackTimelineStrip}>
                    {/* Time Ruler Ticks */}
                    <View style={styles.timeRulerRow}>
                      {[0, 10, 20, 30, 40, 50, 60].map((sec) => (
                        <Text key={sec} style={styles.rulerSecText}>
                          {sec}s
                        </Text>
                      ))}
                    </View>

                    {/* Placed Clips on this Track */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stripScroll}>
                      <View style={[styles.stripContainer, { width: Math.max(700, maxDurationSec * 14) }]}>
                        {trackPlacements.map((pl) => {
                          const loop = savedLoops.find((l) => l.id === pl.loopId);
                          const clipWidth = Math.max(90, (loop?.durationSec || 4) * 14);
                          const leftPos = pl.startSec * 14;

                          return (
                            <View
                              key={pl.id}
                              style={[
                                styles.placedClipBox,
                                {
                                  left: leftPos,
                                  width: clipWidth,
                                  borderColor: loop?.color || track.color,
                                  backgroundColor: `${loop?.color || track.color}25`,
                                },
                              ]}>
                              <View style={styles.clipHeaderRow}>
                                <Text style={styles.clipTitle} numberOfLines={1}>
                                  {loop?.emoji} {loop?.name || 'Loop'}
                                </Text>
                                <Text style={styles.clipDurationText}>
                                  {loop?.durationSec.toFixed(1)}s
                                </Text>
                              </View>

                              <Text style={styles.clipOffsetLabel}>@{pl.startSec.toFixed(1)}s</Text>

                              {/* Clip Quick Controls: Nudge, Duplicate, Delete */}
                              <View style={styles.clipCtrlRow}>
                                <Pressable
                                  style={styles.clipCtrlBtn}
                                  hitSlop={6}
                                  onPress={() => nudgePlacement(pl.id, -1)}>
                                  <Text style={styles.clipCtrlText}>‹</Text>
                                </Pressable>
                                <Pressable
                                  style={styles.clipCtrlBtn}
                                  hitSlop={6}
                                  onPress={() => nudgePlacement(pl.id, 1)}>
                                  <Text style={styles.clipCtrlText}>›</Text>
                                </Pressable>
                                <Pressable
                                  style={styles.clipCtrlBtn}
                                  hitSlop={6}
                                  onPress={() => duplicatePlacement(pl)}>
                                  <Text style={styles.clipCtrlText}>x2</Text>
                                </Pressable>
                                <Pressable
                                  style={[styles.clipCtrlBtn, styles.clipCtrlDel]}
                                  hitSlop={6}
                                  onPress={() => removePlacement(pl.id)}>
                                  <Text style={styles.clipCtrlDelText}>✕</Text>
                                </Pressable>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Saved Loops Drawer at the bottom of Arranger */}
          <View style={styles.arrangerLoopDrawer}>
            <Text style={styles.drawerTitle}>
              SAVED LOOPS LIBRARY ({savedLoops.length}) · TAP TO PREVIEW
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.drawerList}>
              {savedLoops.length === 0 ? (
                <Text style={styles.noLoopsText}>
                  No loops saved yet. Switch to 🎹 RECORDER tab, record a drum or piano groove, and it will appear here!
                </Text>
              ) : (
                savedLoops.map((loop) => {
                  const isPreview = previewingLoopId === loop.id;
                  return (
                    <View key={loop.id} style={[styles.loopChip, { borderColor: loop.color }]}>
                      <Pressable style={styles.loopChipPlay} onPress={() => togglePreviewLoop(loop)}>
                        <Text style={styles.loopChipEmoji}>{isPreview ? '■' : loop.emoji}</Text>
                        <View style={styles.loopChipInfo}>
                          <Text style={styles.loopChipName} numberOfLines={1}>
                            {loop.name}
                          </Text>
                          <Text style={styles.loopChipDur}>{loop.durationSec.toFixed(1)}s</Text>
                        </View>
                      </Pressable>
                      <Pressable style={styles.loopChipDel} onPress={() => deleteLoop(loop.id)}>
                        <Text style={styles.loopChipDelText}>✕</Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      ) : (
        /* ══════════════════════════════════════════════════════════════════════
           INSTRUMENT RECORDER SURFACE (LANDSCAPE KEYS & PADS)
           ══════════════════════════════════════════════════════════════════════ */
        <View style={styles.recorderWorkspace}>
          {/* Controls Bar: Instrument Selector (in Mix Mode) + Record/Stop + Timer */}
          <View style={styles.recorderControlBar}>
            {/* Instrument Tabs in Mix Mode */}
            {isMixMode && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.instSelectorScroll}>
                {INSTRUMENTS.filter((i) => i.id !== 'mix').map((inst) => {
                  const isSel = activeInst === inst.id;
                  return (
                    <Pressable
                      key={inst.id}
                      style={[
                        styles.instTab,
                        isSel && { borderColor: inst.color, backgroundColor: `${inst.color}30` },
                      ]}
                      onPress={() => {
                        playUiTap();
                        setActiveInst(inst.id as SingleInstrumentId);
                      }}>
                      <Text style={styles.instTabEmoji}>{inst.emoji}</Text>
                      <Text style={[styles.instTabLabel, isSel && { color: inst.color, fontWeight: '700' }]}>
                        {inst.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* Rec / Stop Button */}
            <View style={styles.recGroup}>
              {isRecording ? (
                <Pressable style={styles.recStopBtn} onPress={stopRecording}>
                  <View style={styles.recStopSquare} />
                  <Text style={styles.recStopBtnText}>
                    STOP & SAVE ({formatSec(recordElapsedSec)} / {formatSec(maxDurationSec)})
                  </Text>
                </Pressable>
              ) : (
                <Pressable style={styles.recStartBtn} onPress={startRecording}>
                  <View style={styles.recRedCircle} />
                  <Text style={styles.recStartBtnText}>
                    {isMixMode ? '● RECORD LOOP' : '● RECORD'}
                  </Text>
                </Pressable>
              )}

              {/* Quick Octave Selector Pills for Piano & Melodic instruments */}
              {activeInst !== 'drum' && (
                <View style={styles.octaveJumpBar}>
                  <Text style={styles.octaveJumpLabel}>OCT:</Text>
                  {[2, 3, 4, 5, 6].map((oct) => {
                    const isCur = octave === oct;
                    return (
                      <Pressable
                        key={oct}
                        style={[styles.octJumpPill, isCur && styles.octJumpPillActive]}
                        onPress={() => scrollToOctave(oct)}>
                        <Text style={[styles.octJumpPillText, isCur && styles.octJumpPillTextActive]}>
                          C{oct}{oct === 4 ? ' (MID)' : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </View>

          {/* Instrument Play Surface */}
          <View style={styles.instrumentSurface}>
            {activeInst === 'drum' ? (
              /* ── Full 16-Pad Studio Drum Rack (2 Rows, Scrollable) ── */
              <View style={styles.drumRackContainer}>
                <View style={styles.surfaceHeader}>
                  <Text style={styles.surfaceHeaderTitle}>🥁 16-PAD STUDIO DRUM MACHINE</Text>
                  <Text style={styles.surfaceHeaderHint}>↔ SCROLL TO VIEW ALL PERCUSSION</Text>
                </View>
                <ScrollView
                  ref={drumScrollRef}
                  key={`drum-rack-scroll-${activeInst}`}
                  horizontal
                  showsHorizontalScrollIndicator
                  contentOffset={{ x: 0, y: 0 }}
                  contentContainerStyle={styles.drumRackScrollContent}>
                  <View style={styles.drumRackTwoRows}>
                    {/* Top Row: Kicks, Snares, Sticks & Claps */}
                    <View style={styles.drumRackRow}>
                      {PRACTICE_DRUM_PADS.slice(0, 8).map((pad) => {
                        const isHit = activeKeyNote === pad.id;
                        return (
                          <Pressable
                            key={pad.id}
                            style={[
                              styles.drumPadItem,
                              { borderColor: pad.color },
                              isHit && { backgroundColor: `${pad.color}45`, transform: [{ scale: 0.95 }] },
                            ]}
                            onPressIn={() => playNoteAudio(pad.id, pad.freq, pad.type)}>
                            <Text style={styles.drumPadEmoji}>{pad.emoji}</Text>
                            <Text style={[styles.drumPadLabel, { color: pad.color }]}>{pad.label}</Text>
                            <Text style={styles.drumPadSub}>{pad.sub}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {/* Bottom Row: Hi-Hats, Toms, Cymbals & Percussion */}
                    <View style={styles.drumRackRow}>
                      {PRACTICE_DRUM_PADS.slice(8, 16).map((pad) => {
                        const isHit = activeKeyNote === pad.id;
                        return (
                          <Pressable
                            key={pad.id}
                            style={[
                              styles.drumPadItem,
                              { borderColor: pad.color },
                              isHit && { backgroundColor: `${pad.color}45`, transform: [{ scale: 0.95 }] },
                            ]}
                            onPressIn={() => playNoteAudio(pad.id, pad.freq, pad.type)}>
                            <Text style={styles.drumPadEmoji}>{pad.emoji}</Text>
                            <Text style={[styles.drumPadLabel, { color: pad.color }]}>{pad.label}</Text>
                            <Text style={styles.drumPadSub}>{pad.sub}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>
              </View>
            ) : activeInst === 'guitar' ? (
              /* ── Full Interactive Guitar Strumming Board ── */
              <View style={styles.guitarSurfaceContainer}>
                {/* Guitar Header with Chord Voicings */}
                <View style={styles.guitarHeaderBar}>
                  <View style={styles.guitarHeaderLeft}>
                    <Text style={styles.surfaceHeaderTitle}>🎸 REAL ACOUSTIC GUITAR</Text>
                    <Text style={styles.guitarSubHeaderHint}>↕ SWIPE UP/DOWN TO STRUM · TAP TO PLUCK</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chordPillList}>
                    {GUITAR_CHORDS.map((chord, cIdx) => {
                      const isSel = guitarChordIdx === cIdx;
                      return (
                        <Pressable
                          key={chord.id}
                          style={[styles.chordPill, isSel && styles.chordPillActive]}
                          onPress={() => {
                            playUiTap();
                            setGuitarChordIdx(cIdx);
                          }}>
                          <Text style={[styles.chordPillText, isSel && styles.chordPillTextActive]}>
                            {chord.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Guitar Soundboard & Strings Bed (Swipe / Strum Area) */}
                <View
                  style={styles.guitarStrumBed}
                  onLayout={(e) => {
                    strumBoardHeightRef.current = e.nativeEvent.layout.height;
                  }}
                  onTouchStart={handleStrumMove}
                  onTouchMove={handleStrumMove}
                  onTouchEnd={handleStrumRelease}>
                  {/* Fret Markers Background Inlays */}
                  <View style={styles.guitarFretboardBg} pointerEvents="none">
                    <View style={styles.guitarFretLine} />
                    <View style={styles.guitarFretLine} />
                    <View style={styles.guitarFretLine} />
                    <View style={styles.guitarFretLine} />
                    <View style={styles.guitarFretDot} />
                    <View style={styles.guitarFretLine} />
                    <View style={styles.guitarFretLine} />
                  </View>

                  {/* 6 Realistic Guitar Strings Running Horizontally */}
                  {GUITAR_STRINGS_META.map((meta, sIdx) => {
                    const chord = GUITAR_CHORDS[guitarChordIdx];
                    const note = chord.notes[sIdx];
                    const freq = chord.strings[sIdx];
                    const isVibrating = vibratingString === sIdx || activeKeyNote === note;

                    return (
                      <Pressable
                        key={meta.num}
                        style={[
                          styles.guitarStringRow,
                          isVibrating && styles.guitarStringRowActive,
                        ]}
                        onPress={() => pluckGuitarString(sIdx)}>
                        {/* String Tuning Badge on the Left */}
                        <View style={styles.guitarStringPeg}>
                          <Text style={[styles.guitarStringPegText, isVibrating && { color: '#ffd166', fontWeight: '900' }]}>
                            {note}
                          </Text>
                          <Text style={styles.guitarStringPegNum}>{meta.label}</Text>
                        </View>

                        {/* Metallic Resonant String Wire */}
                        <View style={styles.guitarWireContainer}>
                          <View
                            style={[
                              styles.guitarStringWire,
                              {
                                height: meta.thickness,
                                backgroundColor: isVibrating ? '#ffd166' : meta.color,
                                shadowColor: isVibrating ? '#ffd166' : meta.color,
                                shadowOpacity: isVibrating ? 1.0 : 0.4,
                                shadowRadius: isVibrating ? 8 : 2,
                                transform: isVibrating ? [{ scaleY: 1.8 }] : [{ scaleY: 1.0 }],
                              },
                            ]}
                          />
                        </View>

                        {/* Frequency Label on the Right */}
                        <View style={styles.guitarFreqTag}>
                          <Text style={[styles.guitarFreqText, isVibrating && { color: '#ffd166', fontWeight: '900' }]}>
                            {Math.round(freq)} Hz
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              /* ── Full 5-Octave Scrollable Piano Keyboard (C2 through C7) with Glissando ── */
              <View style={styles.pianoSurfaceContainer}>
                <View style={styles.surfaceHeader}>
                  <Text style={styles.surfaceHeaderTitle}>
                    {activeMeta.emoji} {activeMeta.label.toUpperCase()} · 61 KEYS (C2 - C7)
                  </Text>
                  <Text style={styles.surfaceHeaderHint}>↔ SCROLL OCTAVES · SWIPE KEYS TO GLISSANDO</Text>
                </View>
                <ScrollView
                  ref={pianoScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator
                  contentContainerStyle={styles.pianoScrollContent}>
                  <View
                    style={[styles.pianoKeyboardArea, { width: whiteKeys.length * WHITE_KEY_WIDTH }]}>
                    {/* White Keys */}
                    {whiteKeys.map((k) => {
                      const isPressed = activeKeyNote === k.note;
                      return (
                        <Pressable
                          key={k.note}
                          style={[
                            styles.whiteKeyAbsolute,
                            {
                              left: k.whiteIndex * WHITE_KEY_WIDTH,
                              width: WHITE_KEY_WIDTH - 2,
                            },
                            isPressed && { backgroundColor: activeMeta.color, borderColor: activeMeta.color },
                          ]}
                          onPressIn={() => playNoteAudio(k.note, k.freq)}>
                          <Text style={[styles.whiteKeyText, isPressed && { color: '#000', fontWeight: '900' }]}>
                            {k.note}
                          </Text>
                        </Pressable>
                      );
                    })}

                    {/* Black Keys */}
                    {blackKeys.map((k) => {
                      const isPressed = activeKeyNote === k.note;
                      const blackLeft = (k.whiteIndex + 1) * WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2 - 1;
                      return (
                        <Pressable
                          key={k.note}
                          style={[
                            styles.blackKeyAbsolute,
                            {
                              left: blackLeft,
                              width: BLACK_KEY_WIDTH,
                            },
                            isPressed && { backgroundColor: activeMeta.color, borderColor: '#fff' },
                          ]}
                          onPressIn={() => playNoteAudio(k.note, k.freq)}>
                          <Text style={styles.blackKeyText}>{k.note.replace(/[0-9]/g, '')}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ── Modal: Add Loop To Track Picker ── */}
      <Modal visible={!!selectedTrackForAdd} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>SELECT A LOOP TO ADD TO TRACK</Text>
            <ScrollView style={styles.modalScroll}>
              {savedLoops.length === 0 ? (
                <Text style={styles.modalEmpty}>No saved loops available. Record some loops first!</Text>
              ) : (
                savedLoops.map((l) => (
                  <Pressable
                    key={l.id}
                    style={[styles.modalLoopItem, { borderColor: l.color }]}
                    onPress={() => {
                      if (selectedTrackForAdd) addLoopToTrack(l.id, selectedTrackForAdd);
                    }}>
                    <Text style={styles.modalLoopEmoji}>{l.emoji}</Text>
                    <View style={styles.modalLoopInfo}>
                      <Text style={styles.modalLoopName}>{l.name}</Text>
                      <Text style={styles.modalLoopSub}>{l.durationSec.toFixed(1)} seconds</Text>
                    </View>
                    <Text style={styles.modalAddPlus}>+ ADD</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
            <Pressable style={styles.modalCloseBtn} onPress={() => setSelectedTrackForAdd(null)}>
              <Text style={styles.modalCloseBtnText}>CANCEL</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Buy Another Minute ($0.99) ── */}
      <Modal visible={showBuyModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { borderColor: '#ffd166' }]}>
            <Text style={styles.modalProCrown}>👑 PRO STUDIO PASS</Text>
            <Text style={styles.modalTitle}>UNLOCK +1 MINUTE TIMELINE</Text>
            <Text style={styles.modalDesc}>
              Extend your multi-track studio arrangement timeline from 1 minute to 2 full minutes of audio recording & layering.
            </Text>
            <View style={styles.proFeaturesList}>
              <Text style={styles.proFeatureItem}>✔ Extended 2:00 Minutes Multi-Track Timeline</Text>
              <Text style={styles.proFeatureItem}>✔ High-Density Layer Arrangements</Text>
              <Text style={styles.proFeatureItem}>✔ Unlimited Master WAV File Exports</Text>
            </View>

            <Pressable
              style={styles.proBuyBtn}
              onPress={() => {
                setIsProUnlocked(true);
                setShowBuyModal(false);
                Alert.alert('Unlocked! 🎉', 'Pro 2-Minute studio timeline extension has been activated.');
              }}>
              <Text style={styles.proBuyBtnText}>UNLOCK FOR $0.99</Text>
            </Pressable>

            <Pressable style={styles.modalCloseBtn} onPress={() => setShowBuyModal(false)}>
              <Text style={styles.modalCloseBtnText}>KEEP 1 MINUTE (FREE)</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Stylesheet ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#05070d',
  },

  // ── Header Bar ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0b111e',
  },
  backBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  backBtnText: {
    fontFamily: mono,
    fontSize: 10,
    color: '#00f5d4',
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  titleWrap: {
    alignItems: 'center',
  },
  titleText: {
    fontFamily: mono,
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 2,
  },
  subTitleText: {
    fontFamily: mono,
    fontSize: 8,
    color: theme.textDim,
    letterSpacing: 1,
    marginTop: 2,
  },
  tabSwitch: {
    flexDirection: 'row',
    gap: 6,
  },
  tabBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  tabBtnActive: {
    borderColor: '#00f5d4',
    backgroundColor: 'rgba(0,245,212,0.15)',
  },
  tabBtnText: {
    fontFamily: mono,
    fontSize: 9.5,
    color: theme.textDim,
    fontWeight: '600',
    letterSpacing: 1,
  },
  tabBtnTextActive: {
    color: '#00f5d4',
    fontWeight: '800',
  },
  singleActionsHeader: {
    flexDirection: 'row',
    gap: 8,
  },
  headActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#00f5d4',
    backgroundColor: 'rgba(0,245,212,0.12)',
  },
  headActionBtnActive: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239,68,68,0.25)',
  },
  headActionBtnText: {
    fontFamily: mono,
    fontSize: 9.5,
    color: '#00f5d4',
    fontWeight: '700',
  },
  headActionBtnSave: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ffd166',
    backgroundColor: 'rgba(255,209,102,0.15)',
  },
  headActionBtnSaveText: {
    fontFamily: mono,
    fontSize: 9.5,
    color: '#ffd166',
    fontWeight: '700',
  },

  // ── Recorder Workspace ──
  recorderWorkspace: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  recorderControlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 10,
  },
  instSelectorScroll: {
    flexGrow: 0,
    maxWidth: '55%',
  },
  instTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginRight: 6,
  },
  instTabEmoji: {
    fontSize: 14,
  },
  instTabLabel: {
    fontFamily: mono,
    fontSize: 8.5,
    color: theme.textDim,
    letterSpacing: 1,
  },
  recGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  recRedCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  recStartBtnText: {
    fontFamily: mono,
    fontSize: 9.5,
    fontWeight: '800',
    color: '#ef4444',
    letterSpacing: 1.5,
  },
  recStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ff3df0',
    backgroundColor: 'rgba(255,61,240,0.2)',
  },
  recStopSquare: {
    width: 8,
    height: 8,
    backgroundColor: '#ffffff',
  },
  recStopBtnText: {
    fontFamily: mono,
    fontSize: 9.5,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1.5,
  },
  octaveGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 4,
  },
  octaveJumpBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  octaveJumpLabel: {
    fontFamily: mono,
    fontSize: 7.5,
    color: theme.textDim,
    fontWeight: '700',
    marginRight: 2,
  },
  octJumpPill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  octJumpPillActive: {
    backgroundColor: '#00f5d4',
    borderColor: '#00f5d4',
  },
  octJumpPillText: {
    fontFamily: mono,
    fontSize: 7.5,
    color: '#94a3b8',
    fontWeight: '700',
  },
  octJumpPillTextActive: {
    color: '#000000',
    fontWeight: '900',
  },

  // ── Instrument Surface ──
  instrumentSurface: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#070a12',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  surfaceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  surfaceHeaderTitle: {
    fontFamily: mono,
    fontSize: 8,
    color: '#ffffff',
    fontWeight: '800',
    letterSpacing: 1,
  },
  surfaceHeaderHint: {
    fontFamily: mono,
    fontSize: 7,
    color: '#00f5d4',
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Drum Rack (16 Pads, 2 Rows)
  drumRackContainer: {
    flex: 1,
  },
  drumRackScrollContent: {
    padding: 6,
  },
  drumRackTwoRows: {
    gap: 6,
  },
  drumRackRow: {
    flexDirection: 'row',
    gap: 6,
  },
  drumPadItem: {
    width: 96,
    height: 72,
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  drumPadEmoji: {
    fontSize: 20,
    marginBottom: 2,
  },
  drumPadLabel: {
    fontFamily: mono,
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 1,
  },
  drumPadSub: {
    fontFamily: mono,
    fontSize: 7,
    color: theme.textDim,
    marginTop: 1,
  },

  // Interactive Guitar Strumming Board
  guitarSurfaceContainer: {
    flex: 1,
    backgroundColor: '#0f0c08',
  },
  guitarHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,209,102,0.06)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,209,102,0.15)',
  },
  guitarHeaderLeft: {
    marginRight: 8,
  },
  guitarSubHeaderHint: {
    fontFamily: mono,
    fontSize: 6.5,
    color: '#ffd166',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  chordPillList: {
    gap: 4,
    alignItems: 'center',
  },
  chordPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chordPillActive: {
    backgroundColor: '#ffd166',
    borderColor: '#ffd166',
  },
  chordPillText: {
    fontFamily: mono,
    fontSize: 7.5,
    color: '#cbd5e1',
    fontWeight: '700',
  },
  chordPillTextActive: {
    color: '#000000',
    fontWeight: '900',
  },
  guitarStrumBed: {
    flex: 1,
    position: 'relative',
    justifyContent: 'space-around',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#140f0a',
  },
  guitarFretboardBg: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  guitarFretLine: {
    width: 2,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  guitarFretDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  guitarStringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 6,
  },
  guitarStringRowActive: {
    backgroundColor: 'rgba(255,209,102,0.15)',
  },
  guitarStringPeg: {
    width: 68,
    paddingRight: 6,
  },
  guitarStringPegText: {
    fontFamily: mono,
    fontSize: 10,
    color: '#ffffff',
    fontWeight: '800',
  },
  guitarStringPegNum: {
    fontFamily: mono,
    fontSize: 6.5,
    color: theme.textDim,
  },
  guitarWireContainer: {
    flex: 1,
    height: 14,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  guitarStringWire: {
    width: '100%',
    borderRadius: 2,
  },
  guitarFreqTag: {
    width: 50,
    alignItems: 'flex-end',
    paddingLeft: 4,
  },
  guitarFreqText: {
    fontFamily: mono,
    fontSize: 7.5,
    color: theme.textDim,
  },

  // Full 5-Octave Piano Keyboard
  pianoSurfaceContainer: {
    flex: 1,
  },
  pianoScrollContent: {
    flexGrow: 1,
  },
  pianoKeyboardArea: {
    height: '100%',
    position: 'relative',
    backgroundColor: '#0a0d16',
  },
  whiteKeyAbsolute: {
    position: 'absolute',
    top: 0,
    bottom: 2,
    backgroundColor: '#f8fafc',
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    borderWidth: 1,
    borderColor: '#94a3b8',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
  whiteKeyText: {
    fontFamily: mono,
    fontSize: 8.5,
    color: '#334155',
    fontWeight: '800',
  },
  blackKeyAbsolute: {
    position: 'absolute',
    top: 0,
    height: '62%',
    backgroundColor: '#0f172a',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 4,
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 3,
  },
  blackKeyText: {
    fontFamily: mono,
    fontSize: 7,
    color: '#94a3b8',
    fontWeight: '700',
  },

  // ── Timeline Arranger Workspace ──
  timelineWorkspace: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  timelineControlGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playTimelineBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#00f5d4',
    backgroundColor: 'rgba(0,245,212,0.15)',
  },
  playTimelineBtnActive: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239,68,68,0.25)',
  },
  playTimelineBtnText: {
    fontFamily: mono,
    fontSize: 9.5,
    fontWeight: '800',
    color: '#00f5d4',
  },
  timeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  timeBadgeText: {
    fontFamily: mono,
    fontSize: 9,
    color: '#ffffff',
    fontWeight: '700',
  },
  exportTimelineBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ffd166',
    backgroundColor: 'rgba(255,209,102,0.12)',
  },
  exportTimelineBtnText: {
    fontFamily: mono,
    fontSize: 9.5,
    color: '#ffd166',
    fontWeight: '800',
  },
  buyMinBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245,158,11,0.15)',
  },
  buyMinBtnUnlocked: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  buyMinBtnText: {
    fontFamily: mono,
    fontSize: 9,
    fontWeight: '800',
    color: '#fbbf24',
  },

  // Tracks List
  tracksScrollView: {
    flex: 1,
  },
  trackRow: {
    flexDirection: 'row',
    height: 60,
    marginBottom: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0a0f1d',
    overflow: 'hidden',
  },
  trackSide: {
    width: 120,
    borderRightWidth: 2,
    padding: 4,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  trackEmoji: {
    fontSize: 12,
  },
  trackName: {
    fontFamily: mono,
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 1,
  },
  trackSideBtns: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  trackMuteBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  trackMuteBtnActive: {
    backgroundColor: 'rgba(239,68,68,0.3)',
  },
  trackMuteText: {
    fontFamily: mono,
    fontSize: 6.5,
    color: theme.textDim,
  },
  addLoopBtn: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0,245,212,0.15)',
  },
  addLoopBtnText: {
    fontFamily: mono,
    fontSize: 6.5,
    color: '#00f5d4',
    fontWeight: '700',
  },

  trackTimelineStrip: {
    flex: 1,
    position: 'relative',
  },
  timeRulerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  rulerSecText: {
    fontFamily: mono,
    fontSize: 6.5,
    color: 'rgba(255,255,255,0.25)',
  },
  stripScroll: {
    flex: 1,
  },
  stripContainer: {
    height: '100%',
    position: 'relative',
  },
  placedClipBox: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    borderRadius: 6,
    borderWidth: 1,
    padding: 3,
    justifyContent: 'space-between',
  },
  clipHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clipTitle: {
    fontFamily: mono,
    fontSize: 7.5,
    color: '#ffffff',
    fontWeight: '700',
    flex: 1,
  },
  clipDurationText: {
    fontFamily: mono,
    fontSize: 6.5,
    color: '#00f5d4',
  },
  clipOffsetLabel: {
    fontFamily: mono,
    fontSize: 6,
    color: theme.textDim,
  },
  clipCtrlRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 4,
  },
  clipCtrlBtn: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  clipCtrlText: {
    fontFamily: mono,
    fontSize: 7,
    color: '#ffffff',
    fontWeight: '700',
  },
  clipCtrlDel: {
    backgroundColor: 'rgba(239,68,68,0.25)',
  },
  clipCtrlDelText: {
    fontFamily: mono,
    fontSize: 6.5,
    color: '#ef4444',
    fontWeight: '900',
  },

  // Saved Loops Drawer
  arrangerLoopDrawer: {
    height: 70,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 4,
  },
  drawerTitle: {
    fontFamily: mono,
    fontSize: 7.5,
    color: theme.textDim,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  drawerList: {
    gap: 6,
  },
  noLoopsText: {
    fontFamily: mono,
    fontSize: 8,
    color: theme.textDim,
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  loopChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 6,
  },
  loopChipPlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  loopChipEmoji: {
    fontSize: 12,
  },
  loopChipInfo: {},
  loopChipName: {
    fontFamily: mono,
    fontSize: 7.5,
    color: '#ffffff',
    fontWeight: '700',
  },
  loopChipDur: {
    fontFamily: mono,
    fontSize: 6.5,
    color: '#00f5d4',
  },
  loopChipDel: {
    padding: 2,
  },
  loopChipDelText: {
    fontFamily: mono,
    fontSize: 8,
    color: '#ef4444',
    fontWeight: '900',
  },

  // ── Modals ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '75%',
    maxWidth: 480,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#00f5d4',
    backgroundColor: '#0c1220',
    padding: 16,
  },
  modalProCrown: {
    fontFamily: mono,
    fontSize: 10,
    color: '#ffd166',
    fontWeight: '800',
    marginBottom: 4,
  },
  modalTitle: {
    fontFamily: mono,
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  modalDesc: {
    fontFamily: mono,
    fontSize: 9,
    color: theme.textDim,
    lineHeight: 14,
    marginBottom: 10,
  },
  proFeaturesList: {
    gap: 4,
    marginBottom: 14,
  },
  proFeatureItem: {
    fontFamily: mono,
    fontSize: 8.5,
    color: '#10b981',
  },
  proBuyBtn: {
    borderRadius: 8,
    backgroundColor: '#f59e0b',
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  proBuyBtnText: {
    fontFamily: mono,
    fontSize: 11,
    color: '#000000',
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  modalScroll: {
    maxHeight: 180,
    marginBottom: 10,
  },
  modalEmpty: {
    fontFamily: mono,
    fontSize: 9,
    color: theme.textDim,
    textAlign: 'center',
    paddingVertical: 14,
  },
  modalLoopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  modalLoopEmoji: {
    fontSize: 16,
    marginRight: 8,
  },
  modalLoopInfo: {
    flex: 1,
  },
  modalLoopName: {
    fontFamily: mono,
    fontSize: 9,
    color: '#ffffff',
    fontWeight: '700',
  },
  modalLoopSub: {
    fontFamily: mono,
    fontSize: 7.5,
    color: theme.textDim,
  },
  modalAddPlus: {
    fontFamily: mono,
    fontSize: 9,
    color: '#00f5d4',
    fontWeight: '800',
  },
  modalCloseBtn: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    fontFamily: mono,
    fontSize: 8.5,
    color: theme.textDim,
    fontWeight: '700',
  },
});
