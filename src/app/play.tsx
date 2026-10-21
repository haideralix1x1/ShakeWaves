import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  INSTRUMENTS,
  SINGLE_INSTRUMENTS,
} from '../audio/instruments';
import { useInstrument } from '../game/InstrumentContext';
import { useStats } from '../game/StatsContext';
import { phaseForLevel } from '../game/levels';
import { gradeColor } from '../game/scoring';
import { PlaybackSpeed, useGameSession } from '../game/useGameSession';
import { useLoadingTransition } from '../ui/LoadingTransitionContext';
import { NeonButton } from '../ui/NeonButton';
import { Waveform } from '../ui/Waveform';
import { WaveformEditor } from '../ui/WaveformEditor';
import { mono, theme } from '../ui/theme';

export default function Play() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { selectedInstrument } = useInstrument();
  const { transitionTo } = useLoadingTransition();
  const session = useGameSession(selectedInstrument);
  const { recordRun } = useStats();
  const [showTarget, setShowTarget] = useState(false);
  const recorded = useRef<number | null>(null);

  const info = phaseForLevel(session.level.streak);
  const innerWidth = width - 40;

  useEffect(() => {
    if (session.result && recorded.current !== session.level.index) {
      recorded.current = session.level.index;
      if (session.result.match) {
        recordRun(session.level.index, session.result.percent);
      }
    }
  }, [session.result, session.level.index, recordRun]);

  const onNext = () => {
    transitionTo(() => {
      session.next();
      setShowTarget(false);
      recorded.current = null;
    }, 'Loading Next Level…');
  };

  const onRetry = () => {
    transitionTo(() => {
      session.retrySame();
      setShowTarget(false);
      recorded.current = null;
    }, 'Resetting Level…');
  };

  const onHome = () => {
    transitionTo(() => {
      router.replace('/');
    }, 'Returning to Menu…');
  };

  if (session.result) {
    return (
      <ResultView
        result={session.result}
        level={session.level.index}
        onNext={onNext}
        onRetry={onRetry}
        onHearTarget={session.previewTarget}
        onHearMine={session.previewPlayer}
        onHome={onHome}
        instrument={session.instrument}
        activePlaying={session.activePlaying}
      />
    );
  }

  const chosenMeta = INSTRUMENTS.find((i) => i.id === session.instrument)!;
  const isMixMode = session.instrument === 'mix';
  const selectedNodeInst = session.playerNodeInstruments[session.selectedPoint] || 'piano';
  const selectedNodeMeta = INSTRUMENTS.find((i) => i.id === selectedNodeInst)!;

  const SPEED_OPTIONS: { label: string; val: PlaybackSpeed }[] = [
    { label: '0.5x Slow', val: 0.5 },
    { label: '1.0x Normal', val: 1.0 },
    { label: '1.5x Fast', val: 1.5 },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <Pressable onPress={onHome} hitSlop={12}>
            <Text style={styles.back}>‹ EXIT</Text>
          </Pressable>

          <View style={styles.levelTag}>
            <Text style={styles.levelTagText} numberOfLines={1} adjustsFontSizeToFit>
              STREAK: {session.level.streak} 🔥 · {session.level.melodyTitle.toUpperCase()}
            </Text>
          </View>

          <View style={[styles.instBadge, { borderColor: chosenMeta.color }]}>
            <Text style={[styles.instBadgeText, { color: chosenMeta.color }]}>
              {chosenMeta.emoji} {chosenMeta.label.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* ── Phase info ── */}
        <View style={styles.phaseRow}>
          <Text style={styles.phaseName}>{info.name}</Text>
          <Text style={styles.phaseDesc}>{info.description}</Text>
        </View>

        {/* ── Mix Mode: Per-Node Instrument Customizer ── */}
        {isMixMode && (
          <View style={styles.mixCard}>
            <View style={styles.mixHeader}>
              <Text style={styles.mixTitle}>MIX MODE · NODE #{session.selectedPoint + 1}</Text>
              <Text style={[styles.mixActive, { color: selectedNodeMeta.color }]}>
                {selectedNodeMeta.emoji} {selectedNodeMeta.label}
              </Text>
            </View>
            <Text style={styles.mixSubtitle}>
              Tap below to change this node&apos;s instrument:
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mixScroll}>
              {SINGLE_INSTRUMENTS.map((instId) => {
                const meta = INSTRUMENTS.find((i) => i.id === instId)!;
                const isCurrent = selectedNodeInst === instId;
                return (
                  <Pressable
                    key={instId}
                    style={[
                      styles.mixBtn,
                      isCurrent && {
                        borderColor: meta.color,
                        backgroundColor: `${meta.color}25`,
                      },
                    ]}
                    onPress={() => session.setPlayerNodeInstrument(session.selectedPoint, instId)}>
                    <Text style={styles.mixEmoji}>{meta.emoji}</Text>
                    <Text
                      style={[
                        styles.mixLabel,
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

        {/* ── Waveform editor ── */}
        <View style={styles.stageCard}>
          <View style={styles.stageHeader}>
            <Text style={styles.stageLabel} numberOfLines={1}>
              {isMixMode
                ? `NODE #${session.selectedPoint + 1} (${selectedNodeMeta.emoji} ${selectedNodeMeta.label})`
                : `MELODY: ${chosenMeta.emoji} ${chosenMeta.label.toUpperCase()}`}
            </Text>
            <Text style={styles.stageHint}>DRAG NODES</Text>
          </View>
          <WaveformEditor
            profile={session.profile}
            onChange={session.updatePoint}
            onNoteChange={(v) => session.playNote(v, session.selectedPoint)}
            width={innerWidth}
            height={200}
            color={isMixMode ? selectedNodeMeta.color : chosenMeta.color}
          />
        </View>

        {/* ── Target hint (pure wave line only, no text/data/numbers) ── */}
        {showTarget ? (
          <View style={styles.targetCard}>
            <Waveform
              data={session.targetData}
              color={theme.target}
              width={innerWidth - 16}
              height={100}
              opacity={0.9}
              fill
            />
          </View>
        ) : null}

        {/* ── Speed and Loop Controls ── */}
        <View style={styles.playbackControlsRow}>
          {/* Speed Pills */}
          <View style={styles.speedRow}>
            {SPEED_OPTIONS.map((opt) => {
              const active = session.speed === opt.val;
              return (
                <Pressable
                  key={opt.val}
                  style={[styles.speedBtn, active && styles.speedBtnActive]}
                  onPress={() => session.setSpeed(opt.val)}>
                  <Text style={[styles.speedText, active && styles.speedTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Loop Mode Check */}
          <Pressable
            style={[styles.loopBtn, session.isLooping && styles.loopBtnActive]}
            onPress={() => session.setIsLooping((prev) => !prev)}>
            <Text style={[styles.loopText, session.isLooping && styles.loopTextActive]}>
              🔁 LOOP {session.isLooping ? 'ON' : 'OFF'}
            </Text>
          </Pressable>
        </View>

        {/* ── Play row with Active Highlight ── */}
        <View style={styles.playRow}>
          <NeonButton
            label={session.activePlaying === 'target' ? '◼ Stop Target' : '▶ Play Target'}
            variant="ghost"
            active={session.activePlaying === 'target'}
            activeColor={theme.target}
            style={styles.flex}
            onPress={session.previewTarget}
          />
          <NeonButton
            label={session.activePlaying === 'player' ? '◼ Stop Mine' : '▶ Play Mine'}
            variant="ghost"
            active={session.activePlaying === 'player'}
            activeColor={theme.player}
            style={styles.flex}
            onPress={session.previewPlayer}
          />
        </View>

        <Pressable style={styles.peek} onPress={() => setShowTarget((s) => !s)} hitSlop={8}>
          <Text style={styles.peekText}>
            {showTarget ? '▾ HIDE TARGET SHAPE' : '▸ REVEAL TARGET SHAPE (HINT)'}
          </Text>
        </Pressable>

        <View style={styles.submitWrap}>
          <NeonButton label="Synchronize" onPress={session.submit} disabled={session.busy} />
          <Pressable onPress={session.clear} style={styles.clearBtn} hitSlop={8}>
            <Text style={styles.clearText}>RESET WAVE</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Result view ─────────────────────────────────────────────────────────────

function ResultView({
  result,
  level,
  onNext,
  onRetry,
  onHearTarget,
  onHearMine,
  onHome,
  instrument,
  activePlaying,
}: {
  result: ReturnType<typeof useGameSession>['result'];
  level: number;
  onNext: () => void;
  onRetry: () => void;
  onHearTarget: () => void;
  onHearMine: () => void;
  onHome: () => void;
  instrument: string;
  activePlaying?: 'target' | 'player' | null;
}) {
  const { width } = useWindowDimensions();
  const innerWidth = width - 40;
  if (!result) return null;
  const color = gradeColor(result.grade);
  const passed = result.match;
  const chosenMeta = INSTRUMENTS.find((i) => i.id === instrument)!;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ── Grade header ── */}
        <View style={styles.resultHead}>
          <Text style={styles.resultLevel}>
            {passed ? `🔥 STREAK ${level} UNLOCKED!` : `STREAK ENDED AT ${Math.max(0, level - 1)}`} · {chosenMeta.emoji} {chosenMeta.label.toUpperCase()}
          </Text>
          <Text style={[styles.gradeBig, { color }]}>{result.grade}</Text>
          <Text style={[styles.percent, { color }]}>{result.percent.toFixed(1)}%</Text>
          <Text style={styles.resultVerdict}>
            {passed ? 'STREAK CONTINUES!' : result.grade === 'C' ? 'LOCK ACQUIRED' : 'SIGNAL LOST'}
          </Text>
        </View>

        {/* ── Compare card ── */}
        <View style={styles.compareCard}>
          <View style={styles.legend}>
            <Text style={[styles.legendItem, { color: theme.target }]}>— TARGET</Text>
            <Text style={[styles.legendItem, { color: theme.player }]}>— YOURS</Text>
          </View>
          <Waveform
            data={result.targetEvaluation}
            color={theme.target}
            width={innerWidth - 24}
            height={90}
            dashed
            strokeWidth={2}
            baseline
          />
          <Waveform
            data={result.playerEvaluation}
            color={theme.player}
            width={innerWidth - 24}
            height={90}
            strokeWidth={2.5}
          />
        </View>

        {/* ── Playback row with Active Highlight ── */}
        <View style={styles.playRow}>
          <NeonButton
            label={activePlaying === 'target' ? '◼ Stop Target' : 'Hear Target'}
            variant="ghost"
            active={activePlaying === 'target'}
            activeColor={theme.target}
            style={styles.flex}
            onPress={onHearTarget}
          />
          <NeonButton
            label={activePlaying === 'player' ? '◼ Stop Mine' : 'Hear Mine'}
            variant="ghost"
            active={activePlaying === 'player'}
            activeColor={theme.player}
            style={styles.flex}
            onPress={onHearMine}
          />
        </View>

        <View style={styles.actions}>
          {passed ? (
            <NeonButton label="Next Level" onPress={onNext} />
          ) : (
            <NeonButton label="Retry Level" onPress={onRetry} />
          )}
          <NeonButton label="Exit to Menu" variant="ghost" onPress={onHome} />
        </View>

        {!passed ? (
          <Text style={styles.failNote}>
            Match 40% or higher to advance. Tip: use HEAR TARGET then HEAR MINE and study the wave shape differences.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scroll: { padding: 18, paddingBottom: 48 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  back: { fontFamily: mono, fontSize: 13, color: theme.textDim, letterSpacing: 2 },
  levelTag: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.target,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  levelTagText: {
    fontFamily: mono,
    fontSize: 10,
    color: theme.target,
    letterSpacing: 1,
    textAlign: 'center',
  },
  instBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  instBadgeText: {
    fontFamily: mono,
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: '700',
  },

  // Phase
  phaseRow: { marginTop: 10, marginBottom: 8 },
  phaseName: { fontFamily: mono, fontSize: 15, color: theme.text, letterSpacing: 2.5, fontWeight: '800' },
  phaseDesc: { fontFamily: mono, fontSize: 10, color: theme.textDim, marginTop: 2, lineHeight: 15 },

  // Mix Mode per-node customizer
  mixCard: {
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 212, 0.3)',
    borderRadius: 12,
    backgroundColor: 'rgba(0, 245, 212, 0.04)',
    padding: 10,
    marginBottom: 10,
  },
  mixHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  mixTitle: {
    fontFamily: mono,
    fontSize: 10,
    color: theme.target,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  mixActive: {
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
  },
  mixSubtitle: {
    fontFamily: mono,
    fontSize: 9,
    color: theme.textDim,
    marginBottom: 8,
  },
  mixScroll: {
    gap: 6,
  },
  mixBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 62,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  mixEmoji: {
    fontSize: 18,
    marginBottom: 2,
  },
  mixLabel: {
    fontFamily: mono,
    fontSize: 8,
    color: theme.textDim,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // Stage / editor card
  stageCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    backgroundColor: theme.panel,
    padding: 10,
    marginBottom: 10,
  },
  stageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  stageLabel: {
    fontFamily: mono,
    fontSize: 10,
    color: theme.player,
    letterSpacing: 1,
    flex: 1,
    fontWeight: '700',
  },
  stageHint: { fontFamily: mono, fontSize: 9, color: theme.textDim, letterSpacing: 1 },

  // Target hint card
  targetCard: {
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.4)',
    borderRadius: 14,
    backgroundColor: 'rgba(0,229,255,0.05)',
    padding: 10,
    marginBottom: 10,
  },

  // Playback speed and loop row
  playbackControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
    gap: 6,
  },
  speedRow: {
    flexDirection: 'row',
    gap: 4,
    flex: 1,
  },
  speedBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  speedBtnActive: {
    borderColor: theme.target,
    backgroundColor: 'rgba(0,229,255,0.15)',
  },
  speedText: {
    fontFamily: mono,
    fontSize: 9,
    color: theme.textDim,
  },
  speedTextActive: {
    color: theme.target,
    fontWeight: '700',
  },
  loopBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  loopBtnActive: {
    borderColor: '#00f5d4',
    backgroundColor: 'rgba(0,245,212,0.18)',
  },
  loopText: {
    fontFamily: mono,
    fontSize: 9,
    color: theme.textDim,
  },
  loopTextActive: {
    color: '#00f5d4',
    fontWeight: '700',
  },

  // Play/action rows
  playRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  flex: { flex: 1 },
  peek: { alignItems: 'center', paddingVertical: 10 },
  peekText: { fontFamily: mono, fontSize: 10, color: theme.textDim, letterSpacing: 1 },
  submitWrap: { marginTop: 6, gap: 10 },
  clearBtn: { alignItems: 'center', paddingVertical: 6 },
  clearText: { fontFamily: mono, fontSize: 10, color: theme.textDim, letterSpacing: 2 },

  // Result screen
  resultHead: { alignItems: 'center', marginBottom: 16, paddingTop: 6 },
  resultLevel: { fontFamily: mono, fontSize: 10, color: theme.textDim, letterSpacing: 2 },
  gradeBig: { fontFamily: mono, fontSize: 72, fontWeight: '900', marginTop: 4 },
  percent: { fontFamily: mono, fontSize: 26, fontWeight: '800', letterSpacing: 2, marginTop: -6 },
  resultVerdict: {
    fontFamily: mono,
    fontSize: 11,
    color: theme.textDim,
    letterSpacing: 3,
    marginTop: 8,
    textAlign: 'center',
  },
  compareCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    backgroundColor: theme.panel,
    padding: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  legend: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  legendItem: { fontFamily: mono, fontSize: 10, letterSpacing: 2 },
  actions: { gap: 10, marginTop: 14 },
  failNote: {
    fontFamily: mono,
    fontSize: 10,
    lineHeight: 16,
    color: theme.textDim,
    marginTop: 16,
    textAlign: 'center',
  },
});
