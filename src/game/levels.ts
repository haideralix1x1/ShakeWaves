import { profileToCycle } from '../audio/wave';
import { PIANO_KEYS, valueToPianoKey } from '../audio/render';

export type Phase = 1 | 2 | 3;

export interface PhaseInfo {
  phase: Phase;
  name: string;
  description: string;
}

export const POINT_COUNT = 9;
const CYCLE_TABLE = 512;
const PREVIEW_CURVE_POINTS = 256;

export interface Level {
  index: number;
  streak: number;
  phase: Phase;
  pointCount: number;
  cycles: number;
  frequency: number;
  noteName: string;
  melodyTitle: string;
  targetProfile: number[];
  targetCycle: Float32Array;
  targetWaveform: number[];
}

export function phaseForLevel(streak: number): PhaseInfo {
  if (streak <= 2) {
    return {
      phase: 1,
      name: 'MELODIC INTRO',
      description: 'Tune each node by ear to reproduce the sequence',
    };
  }
  if (streak <= 6) {
    return {
      phase: 2,
      name: 'HARMONIC RUN',
      description: 'Wide harmonic intervals and cascading arpeggios',
    };
  }
  return {
    phase: 3,
    name: 'STREAK MASTER',
    description: 'Dynamic melodies and expressive phrasing across the range',
  };
}

export interface MelodyDef {
  title: string;
  notes: string;
  profile: number[];
}

export const LEVEL_MELODIES: MelodyDef[] = [
  {
    title: 'Dawn Arpeggio',
    notes: 'C4 · E4 · G4 · C5 · G4 · E4 · G4 · C5 · C5',
    profile: [-1.0, -0.5, 0.0, 0.75, 0.0, -0.5, 0.0, 0.75, 0.75],
  },
  {
    title: 'Ode to Joy',
    notes: 'E4 · E4 · F4 · G4 · G4 · F4 · E4 · D4 · C4',
    profile: [-0.5, -0.5, -0.25, 0.0, 0.0, -0.25, -0.5, -0.75, -1.0],
  },
  {
    title: 'Twinkle Starlight',
    notes: 'C4 · C4 · G4 · G4 · A4 · A4 · G4 · F4 · E4',
    profile: [-1.0, -1.0, 0.0, 0.0, 0.25, 0.25, 0.0, -0.25, -0.5],
  },
  {
    title: 'Bach Minuet',
    notes: 'D4 · G4 · A4 · B4 · C5 · D5 · G4 · G4 · B4',
    profile: [-0.75, 0.0, 0.25, 0.5, 0.75, 1.0, 0.0, 0.0, 0.5],
  },
  {
    title: 'Pachelbel Cascade',
    notes: 'C5 · B4 · A4 · G4 · F4 · E4 · F4 · G4 · C4',
    profile: [0.75, 0.5, 0.25, 0.0, -0.25, -0.5, -0.25, 0.0, -1.0],
  },
  {
    title: 'Pentatonic Horizon',
    notes: 'C4 · D4 · E4 · G4 · A4 · C5 · A4 · G4 · E4',
    profile: [-1.0, -0.75, -0.5, 0.0, 0.25, 0.75, 0.25, 0.0, -0.5],
  },
  {
    title: 'Neon Pulse',
    notes: 'C4 · G4 · E4 · B4 · G4 · D5 · C5 · A4 · G4',
    profile: [-1.0, 0.0, -0.5, 0.5, 0.0, 1.0, 0.75, 0.25, 0.0],
  },
  {
    title: 'Moonlight Serenade',
    notes: 'C4 · E4 · G4 · C4 · E4 · G4 · C4 · E4 · G4',
    profile: [-1.0, -0.5, 0.0, -1.0, -0.5, 0.0, -1.0, -0.5, 0.0],
  },
  {
    title: 'Spring Vivaldi',
    notes: 'C4 · E4 · E4 · E4 · D4 · C4 · G4 · F4 · E4',
    profile: [-1.0, -0.5, -0.5, -0.5, -0.75, -1.0, 0.0, -0.25, -0.5],
  },
  {
    title: 'Swan Lake Theme',
    notes: 'B4 · C5 · D5 · C5 · B4 · A4 · G4 · F4 · E4',
    profile: [0.5, 0.75, 1.0, 0.75, 0.5, 0.25, 0.0, -0.25, -0.5],
  },
  {
    title: 'Clair de Lune',
    notes: 'C5 · B4 · G4 · A4 · B4 · C5 · A4 · G4 · C4',
    profile: [0.75, 0.5, 0.0, 0.25, 0.5, 0.75, 0.25, 0.0, -1.0],
  },
  {
    title: 'Für Elise Motif',
    notes: 'E4 · D4 · E4 · D4 · E4 · B4 · D4 · C4 · A4',
    profile: [-0.5, -0.75, -0.5, -0.75, -0.5, 0.5, -0.75, -1.0, 0.25],
  },
];

const SONATA_NAMES = [
  'Solar Aria',
  'Lunar Drift',
  'Starlight Fugue',
  'Echoes of Valleys',
  'Celestial Voyage',
  'Midnight Rhapsody',
  'Pulse of Waves',
  'Velvet Overture',
  'Cascade Harmony',
];

/**
 * Builds a fresh, non-repetitive musical melody.
 * Uses randomized selection every run so re-starting from menu never gives the same tune.
 */
function getFreshMelody(streak: number): MelodyDef {
  // 50% chance to pick a curated classic theme at random, or generate a fresh procedural theme
  if (Math.random() < 0.5) {
    const randomPick = LEVEL_MELODIES[Math.floor(Math.random() * LEVEL_MELODIES.length)];
    return {
      title: randomPick.title,
      notes: randomPick.notes,
      profile: [...randomPick.profile],
    };
  }

  // Musical procedural generation with smooth musical intervals
  const scaleValues = PIANO_KEYS.map((k) => k.value);
  const profile: number[] = [];
  const notesArr: string[] = [];

  // Start on tonic or third
  let currentIdx = Math.floor(Math.random() * 5); // C4 to G4

  for (let i = 0; i < POINT_COUNT; i++) {
    // Musical stepwise motion (jump at most 1-2 scale steps)
    const stepChoice = [-2, -1, 0, 1, 1, 2][Math.floor(Math.random() * 6)];
    currentIdx = Math.max(0, Math.min(scaleValues.length - 1, currentIdx + stepChoice));

    const val = scaleValues[currentIdx];
    profile.push(val);
    notesArr.push(valueToPianoKey(val).note);
  }

  const namePick = SONATA_NAMES[Math.floor(Math.random() * SONATA_NAMES.length)];
  return {
    title: `${namePick} #${streak + 1}`,
    notes: notesArr.join(' · '),
    profile,
  };
}

export function generateLevel(streak: number): Level {
  const { phase } = phaseForLevel(streak);
  const pointCount = POINT_COUNT;
  const cycles = 1;
  const melody = getFreshMelody(streak);
  const targetProfile = melody.profile.slice();
  const targetCycle = profileToCycle(targetProfile, CYCLE_TABLE);

  const smoothCurve = profileToCycle(targetProfile, PREVIEW_CURVE_POINTS);
  const targetWaveform = Array.from(smoothCurve);
  const firstKey = valueToPianoKey(targetProfile[0]);

  return {
    index: streak + 1,
    streak,
    phase,
    pointCount,
    cycles,
    frequency: firstKey.freq,
    noteName: melody.notes,
    melodyTitle: melody.title,
    targetProfile,
    targetCycle,
    targetWaveform,
  };
}

export function flatProfile(pointCount: number): number[] {
  return new Array(pointCount).fill(0);
}

export function startProfile(pointCount: number): number[] {
  return new Array(pointCount).fill(0);
}

/** Starting level with randomized melody every new session */
export function tutorialLevel(): Level {
  return generateLevel(0);
}
