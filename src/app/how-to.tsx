import { useRouter } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLoadingTransition } from '../ui/LoadingTransitionContext';
import { NeonButton } from '../ui/NeonButton';
import { mono, theme } from '../ui/theme';

const RULES: { title: string; body: string }[] = [
  {
    title: '1. CHOOSE INSTRUMENT',
    body: 'Select from 8 instruments (Piano, Guitar, Accordion, Synth Lead, Drum, Trumpet, Harp, Xylophone) or Mix Mode on the home screen before starting.',
  },
  {
    title: '2. LISTEN',
    body: 'Tap PLAY TARGET to hear the sequence tone. In Mix Mode, each note plays with an instrument tailored for the level.',
  },
  {
    title: '3. SHAPE & TUNE',
    body: 'Drag the points up and down to match each frequency. In Mix Mode, you can also customize which instrument plays on each node.',
  },
  {
    title: '4. COMPARE & SUBMIT',
    body: 'Tap PLAY MINE to check your melody against the target. When satisfied, hit SYNCHRONIZE to evaluate.',
  },
  {
    title: '5. ADVANCE',
    body: 'Score 40% or higher to unlock subsequent levels.',
  },
];

const GRADES: { grade: string; range: string; color: string }[] = [
  { grade: 'S', range: '95 – 100%', color: '#00f5d4' },
  { grade: 'A', range: '80 – 94%', color: '#38e07b' },
  { grade: 'B', range: '60 – 79%', color: '#ffd166' },
  { grade: 'C', range: '40 – 59%', color: '#ff9f45' },
  { grade: 'F', range: 'BELOW 40%', color: '#ff4d6d' },
];

export default function HowTo() {
  const router = useRouter();
  const { transitionTo } = useLoadingTransition();

  const handleBack = () => {
    transitionTo(() => {
      router.back();
    }, 'Returning Home…');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>HOW TO PLAY</Text>

        {RULES.map((r) => (
          <View key={r.title} style={styles.card}>
            <Text style={styles.cardTitle}>{r.title}</Text>
            <Text style={styles.cardBody}>{r.body}</Text>
          </View>
        ))}

        <Text style={styles.section}>GRADING</Text>
        {GRADES.map((g) => (
          <View key={g.grade} style={styles.gradeRow}>
            <Text style={[styles.grade, { color: g.color }]}>{g.grade}</Text>
            <Text style={styles.gradeRange}>{g.range}</Text>
          </View>
        ))}

        <NeonButton label="Back" variant="ghost" style={styles.back} onPress={handleBack} />

        {/* ── Nameless Forge Copyright Footer ── */}
        <View style={styles.footerBrand}>
          <Image
            source={require('../../assets/Company-dark.png')}
            style={styles.companyLogo}
            resizeMode="contain"
          />
          <Text style={styles.copyrightText}>© 2026 NAMELESS FORGE • ALL RIGHTS RESERVED</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  title: {
    fontFamily: mono,
    fontSize: 22,
    fontWeight: '900',
    color: theme.text,
    letterSpacing: 4,
    marginBottom: 16,
  },
  card: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.panel,
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: { fontFamily: mono, fontSize: 12, color: theme.target, letterSpacing: 2, fontWeight: '700' },
  cardBody: { fontFamily: mono, fontSize: 11, lineHeight: 18, color: theme.textDim, marginTop: 6 },
  section: {
    fontFamily: mono,
    fontSize: 12,
    color: theme.text,
    letterSpacing: 3,
    marginTop: 14,
    marginBottom: 10,
  },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    paddingVertical: 8,
  },
  grade: { fontFamily: mono, fontSize: 16, fontWeight: '900', width: 40 },
  gradeRange: { fontFamily: mono, fontSize: 12, color: theme.textDim, letterSpacing: 1 },
  back: { marginTop: 24 },
  footerBrand: {
    alignItems: 'center',
    marginTop: 28,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28, 42, 69, 0.4)',
  },
  companyLogo: {
    width: 130,
    height: 36,
    marginBottom: 6,
    opacity: 0.9,
  },
  copyrightText: {
    fontFamily: mono,
    fontSize: 9,
    letterSpacing: 1.5,
    color: theme.textDim,
    fontWeight: '700',
  },
});
