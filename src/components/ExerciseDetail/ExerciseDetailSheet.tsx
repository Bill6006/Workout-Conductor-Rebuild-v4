import { exerciseEquipmentLabel } from '../../catalog/exercises/catalog';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import { movementPatternName } from '../../catalog/movementPatterns/movementPatterns';
import { muscleName } from '../../catalog/muscles/muscles';
import type { AlternativeResult } from '../../engine/alternatives/rankAlternatives';
import { Sheet } from '../Sheet/Sheet';
import styles from './ExerciseDetail.module.css';
import { ExerciseDemo, ExerciseThumb } from './ExerciseMedia';

export interface PreferenceControls {
  preferred: boolean;
  disliked: boolean;
  onPrefer: () => void;
  onDislike: () => void;
}

interface ExerciseDetailSheetProps {
  exercise: CatalogExercise | null;
  onClose: () => void;
  availableEquipment?: ReadonlySet<string>;
  alternatives?: AlternativeResult | null;
  preference?: PreferenceControls;
}

const ROLE_LABELS: Record<CatalogExercise['defaultRole'], string> = {
  'primary-strength': 'Primary strength',
  'secondary-strength': 'Secondary strength',
  'primary-hypertrophy': 'Primary hypertrophy',
  'secondary-hypertrophy': 'Secondary hypertrophy',
  isolation: 'Isolation',
  specialization: 'Specialization',
  corrective: 'Corrective',
  'warm-up': 'Warm-up',
  finisher: 'Finisher',
};

function repRangeLabel(exercise: CatalogExercise): string {
  const { strength, hypertrophy } = exercise.repRanges;
  const parts = [`${hypertrophy[0]}-${hypertrophy[1]} hypertrophy`];
  if (strength) parts.unshift(`${strength[0]}-${strength[1]} strength`);
  return parts.join(' · ');
}

export function ExerciseDetailSheet({
  exercise,
  onClose,
  availableEquipment,
  alternatives,
  preference,
}: ExerciseDetailSheetProps) {
  if (!exercise) return null;

  const traits = [
    exercise.compound ? 'Compound' : 'Isolation',
    exercise.unilateral ? 'One side at a time' : null,
    exercise.dropSetSafe ? 'Drop-set safe' : 'No drop sets',
    exercise.supersetFriendly ? 'Superset friendly' : 'Keep it solo',
    `Warm-up: ${exercise.warmup}`,
    exercise.barWeight ? `Bar ${exercise.barWeight.lb} lb / ${exercise.barWeight.kg} kg` : null,
    `Setup ~${exercise.setupSeconds}s`,
  ].filter((trait): trait is string => Boolean(trait));

  return (
    <Sheet open title={exercise.name} onClose={onClose}>
      <ExerciseDemo exercise={exercise} />

      <div className={styles.chips} aria-label="Muscles">
        {exercise.primaryMuscles.map((muscle) => (
          <span key={muscle} className={`${styles.chip} ${styles.chipPrimary}`}>
            {muscleName(muscle)}
          </span>
        ))}
        {exercise.secondaryMuscles.map((muscle) => (
          <span key={muscle} className={styles.chip}>
            {muscleName(muscle)}
          </span>
        ))}
      </div>

      <dl className={styles.facts}>
        <dt>Pattern</dt>
        <dd>{movementPatternName(exercise.movementPattern)}</dd>
        <dt>Equipment</dt>
        <dd>{exerciseEquipmentLabel(exercise, availableEquipment)}</dd>
        <dt>Role</dt>
        <dd>{ROLE_LABELS[exercise.defaultRole]}</dd>
        <dt>Reps</dt>
        <dd>{repRangeLabel(exercise)}</dd>
        <dt>Difficulty</dt>
        <dd>{exercise.difficulty}</dd>
      </dl>

      <div className={styles.chips} aria-label="Traits">
        {traits.map((trait) => (
          <span key={trait} className={styles.chip}>
            {trait}
          </span>
        ))}
        {exercise.limitationFlags.map((flag) => (
          <span key={flag} className={`${styles.chip} ${styles.chipWarn}`}>
            {flag.replace(/-/g, ' ')}
          </span>
        ))}
      </div>

      {preference ? (
        <div className={styles.prefRow}>
          <button
            type="button"
            className={styles.prefButton}
            aria-pressed={preference.preferred}
            onClick={preference.onPrefer}
          >
            {preference.preferred ? 'Preferred ✓' : 'Prefer'}
          </button>
          <button
            type="button"
            className={styles.prefButton}
            aria-pressed={preference.disliked}
            onClick={preference.onDislike}
          >
            {preference.disliked ? 'Disliked ✓' : 'Dislike'}
          </button>
        </div>
      ) : null}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Setup</h3>
        <ol className={styles.steps}>
          {exercise.instructions.setup.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <h3 className={styles.sectionTitle}>Execution</h3>
        <ol className={styles.steps}>
          {exercise.instructions.execution.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <h3 className={styles.sectionTitle}>Breathing</h3>
        <p className={styles.text}>{exercise.instructions.breathing}</p>
        <h3 className={styles.sectionTitle}>Common mistakes</h3>
        <ul className={styles.steps}>
          {exercise.instructions.mistakes.map((mistake) => (
            <li key={mistake}>{mistake}</li>
          ))}
        </ul>
      </section>

      {alternatives ? (
        <section className={styles.section} aria-label="Alternatives">
          <h3 className={styles.sectionTitle}>Alternatives, best match first</h3>
          <p className={styles.text}>
            Ranked by muscles, pattern, role, equipment here, and your limitations. Tap-to-replace
            arrives with the active workout in Phase 5.
          </p>
          {alternatives.candidates.length === 0 ? (
            <p className={styles.empty}>{alternatives.emptyReason}</p>
          ) : (
            <ol className={styles.alternatives}>
              {alternatives.candidates.map((candidate) => (
                <li key={candidate.exercise.id} className={styles.alternative}>
                  <ExerciseThumb exercise={candidate.exercise} />
                  <div className={styles.alternativeBody}>
                    <div className={styles.alternativeHead}>
                      <span className={styles.alternativeName}>{candidate.exercise.name}</span>
                      <span className={styles.score}>{candidate.score}</span>
                    </div>
                    <span className={styles.alternativeMeta}>{candidate.primaryReason}</span>
                    <span className={styles.alternativeMeta}>
                      {candidate.keyDifference} · {candidate.equipment} · ~{candidate.setupSeconds}s
                      setup
                    </span>
                    <span className={styles.alternativeMeta}>
                      {candidate.preservesProgression
                        ? 'Keeps progression history'
                        : 'New progression'}
                      {candidate.supersetImpact !== 'none'
                        ? ` · ${candidate.supersetImpact === 'breaks' ? 'breaks the superset' : 'changes the superset'}`
                        : ''}
                    </span>
                    {candidate.warnings.length > 0 ? (
                      <span className={styles.alternativeWarn}>{candidate.warnings[0]}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </Sheet>
  );
}
