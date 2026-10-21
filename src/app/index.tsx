import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { INSTRUMENTS } from '../audio/instruments';

import { useInstrument } from '../game/InstrumentContext';
import { useStats } from '../game/StatsContext';
import { tutorialLevel } from '../game/levels';
import { NeonButton } from '../ui/NeonButton';
import { useLoadingTransition } from '../ui/LoadingTransitionContext';
import { Waveform } from '../ui/Waveform';
import { mono, theme } from '../ui/theme';

export default function Home() {
  const router = useRouter();
  const { bestLevel, totalScore } = useStats();
  const { selectedInstrument, setSelectedInstrument } = useInstrument();
  const { transitionTo } = useLoadingTransition();
  const [phase, setPhase] = useState(0);

  const target = useMemo(() => tutorialLevel().targetWaveform, []);

  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % 100), 60);
    return () => clearInterval(id);
  }, []);

  const animated = useMemo(() => {
    const shift = (phase / 100) * Math.PI * 2;
    return target.map((v, i) => Math.sin((i / target.length) * Math.PI * 4 + shift) * Math.abs(v));
  }, [target, phase]);

  const handleStart = () => {
    const instObj = INSTRUMENTS.find((i) => i.id === selectedInstrument);
    transitionTo(() => {
      router.push('/play');
    }, `Preparing ${instObj?.label || 'Game'}…`);
  };

  const handleHowTo = () => {
    transitionTo(() => {
      router.push('/how-to');
    }, 'Loading Instructions…');
  };

  const chosenObj = INSTRUMENTS.find((i) => i.id === selectedInstrument)!;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Text style={styles.title}>SHAKE</Text>
          <Text style={styles.titleAccent}>WAVES</Text>
          <Text style={styles.subtitle}>MATCH THE FREQUENCY</Text>
        </View>

        <View style={styles.stage}>
          <Waveform data={animated} color={chosenObj.color || theme.target} width={300} height={120} strokeWidth={2} />
        </View>

        {/* ── Instrument Selection Before Game Start ── */}
        <View style={styles.pickerSection}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>CHOOSE INSTRUMENT</Text>
            <Text style={[styles.pickerActiveBadge, { color: chosenObj.color }]}>
              {chosenObj.emoji} {chosenObj.label.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.pickerDesc}>
            {selectedInstrument === 'mix'
              ? 'Mix Mode: Each node uses a blended instrument for rich multi-instrument harmonies.'
              : `Play all melodies tuned in authentic ${chosenObj.label} acoustics.`}
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pickerScroll}>
            {INSTRUMENTS.map((inst) => {
              const isSelected = selectedInstrument === inst.id;
              return (
                <Pressable
                  key={inst.id}
                  style={[
                    styles.instrBtn,
                    isSelected && {
                      borderColor: inst.color,
                      backgroundColor: `${inst.color}1e`,
                    },
                  ]}
                  onPress={() => setSelectedInstrument(inst.id)}>
                  <Text style={styles.instrEmoji}>{inst.emoji}</Text>
                  <Text
                    style={[
                      styles.instrLabel,
                      isSelected && { color: inst.color, fontWeight: '700' },
                    ]}>
                    {inst.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.statsRow}>
          <Stat label="BEST STREAK" value={bestLevel > 0 ? `${bestLevel} 🔥` : '—'} />
          <Stat label="TOTAL SCORE" value={totalScore.toFixed(0)} />
        </View>

        <View style={styles.actions}>
          <NeonButton
            label={`Start Game (${chosenObj.emoji} ${chosenObj.label})`}
            onPress={handleStart}
          />
          <NeonButton label="How to Play" variant="ghost" onPress={handleHowTo} />
        </View>

        <Text style={styles.hint}>
          Select your music instrument above before starting. Listen to the target tone, shape your wave, and synchronize.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  hero: { alignItems: 'center', marginBottom: 16 },
  title: { fontFamily: mono, fontSize: 40, fontWeight: '900', color: theme.text, letterSpacing: 8 },
  titleAccent: {
    fontFamily: mono,
    fontSize: 40,
    fontWeight: '900',
    color: theme.player,
    letterSpacing: 8,
    marginTop: -8,
  },
  subtitle: {
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 5,
    color: theme.textDim,
    marginTop: 8,
  },
  stage: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: theme.panel,
    padding: 6,
    alignItems: 'center',
    marginBottom: 16,
  },

  // Picker Section
  pickerSection: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    backgroundColor: theme.panel,
    padding: 12,
    marginBottom: 16,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  pickerTitle: {
    fontFamily: mono,
    fontSize: 10,
    color: theme.textDim,
    letterSpacing: 2,
    fontWeight: '700',
  },
  pickerActiveBadge: {
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  pickerDesc: {
    fontFamily: mono,
    fontSize: 10,
    color: theme.textDim,
    lineHeight: 15,
    marginBottom: 10,
  },
  pickerScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  instrBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 72,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  instrEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  instrLabel: {
    fontFamily: mono,
    fontSize: 9,
    color: theme.textDim,
    letterSpacing: 1,
    textAlign: 'center',
  },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  stat: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    backgroundColor: theme.panel,
    padding: 12,
  },
  statLabel: { fontFamily: mono, fontSize: 9, color: theme.textDim, letterSpacing: 2 },
  statValue: { fontFamily: mono, fontSize: 20, color: theme.text, fontWeight: '700', marginTop: 4 },

  actions: { gap: 10, marginTop: 4 },
  hint: {
    fontFamily: mono,
    fontSize: 10,
    lineHeight: 16,
    color: theme.textDim,
    marginTop: 20,
    textAlign: 'center',
  },
});
