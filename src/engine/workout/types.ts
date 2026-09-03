import type { CatalogExercise, TrainingRole } from '../../catalog/exercises/exerciseSchema';
import type { MuscleId } from '../../catalog/muscles/muscles';

/**
 * The generated workout data model. One block per list row: a straight block
 * holds one exercise, a superset block holds exactly two moves, a circuit
 * block holds three or more. Every set carries its own kind so warm-up and
 * drop sets are never confused with working sets.
 */

export type DurationChoice = 15 | 30 | 45 | 'default';

export type SetKind = 'warmup' | 'working' | 'drop';

export interface SetPrescription {
  index: number;
  kind: SetKind;
  targetReps: [number, number];
  targetRir: number;
  /** Load targets arrive with the progression engine (Phase 6). */
  targetWeight: number | null;
  restSeconds: number;
}

export interface WorkoutEntry {
  id: string;
  exerciseId: string;
  role: TrainingRole;
  sets: SetPrescription[];
  restSeconds: number;
  warmupSets: number;
  dropSet: boolean;
  /** Muscle priority this entry was chosen for. */
  chosenFor: MuscleId[];
  locked: boolean;
  pinned: boolean;
}

export type BlockKind = 'straight' | 'superset' | 'circuit';

export interface WorkoutBlock {
  id: string;
  kind: BlockKind;
  /** One readable canonical list row, for example "A1 Cable Fly + A2 Lateral Raise". */
  label: string;
  entries: WorkoutEntry[];
  rounds: number;
  restBetweenRoundsSeconds: number;
}

export interface MusclePriority {
  muscle: MuscleId;
  weight: number;
  reason: string;
  weeklySetsDone: number;
  weeklyTarget: number;
  daysSinceTrained: number | null;
}

export interface WarmupPlan {
  generalMinutes: number;
  rampEntryIds: string[];
  note: string;
}

export interface TimeBreakdown {
  warmupMinutes: number;
  workMinutes: number;
  restMinutes: number;
  transitionMinutes: number;
  totalMinutes: number;
}

export interface WorkoutExplanation {
  summary: string;
  reasons: string[];
  fittingSteps: string[];
  time: TimeBreakdown;
}

export interface GeneratedWorkout {
  id: string;
  templateId: string;
  title: string;
  goal: string;
  generatedAt: string;
  locationId: string | null;
  duration: {
    choice: DurationChoice;
    targetMinutes: number;
    defaultMinutes: number;
    estimatedMinutes: number;
    overByMinutes: number;
  };
  musclePriorities: MusclePriority[];
  blocks: WorkoutBlock[];
  warmup: WarmupPlan;
  explanation: WorkoutExplanation;
  confidence: 'high' | 'medium' | 'low';
  compromises: string[];
  recalibration: { version: number; lastTrigger: string | null };
}

export interface ResolvedEntry {
  entry: WorkoutEntry;
  exercise: CatalogExercise;
}

export function allEntries(blocks: readonly WorkoutBlock[]): WorkoutEntry[] {
  return blocks.flatMap((block) => block.entries);
}

export function workingSets(entry: WorkoutEntry): SetPrescription[] {
  return entry.sets.filter((set) => set.kind !== 'warmup');
}
