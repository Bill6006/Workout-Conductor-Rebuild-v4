import { routeHref } from '../../app/navigation';
import { muscleName, type MuscleId } from '../../catalog/muscles/muscles';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { FactList } from '../../components/FactList/FactList';
import { ScreenHeader } from '../../components/Screen/Screen';
import type { WorkoutSession } from '../../core/state/session';
import { useAppStore } from '../../core/state/useAppStore';
import type { UnitSystem } from '../../core/validation/profile';
import styles from './ActiveWorkout.module.css';

interface WorkoutCompletionProps {
  session: WorkoutSession;
  units: UnitSystem;
}

function minutes(seconds: number): string {
  return `${Math.round((seconds / 60) * 10) / 10} min`;
}

/** The completion surface: what was done, what changed, and what it means next time. */
export function WorkoutCompletion({ session, units }: WorkoutCompletionProps) {
  const store = useAppStore();
  const summary = session.completion;
  if (!summary) return null;
  const rating = session.rating;

  return (
    <>
      <ScreenHeader title="Workout" intro="Saved to this device with a verified write." />
      <Card tone="accent" eyebrow="Workout saved" title={session.workout.title}>
        <div className={styles.completionGrid} data-testid="completion-summary">
          <div className={styles.stat}>
            <span className={styles.statLabel}>Duration</span>
            <span className={styles.statValue}>{minutes(summary.elapsedSeconds)}</span>
            <span className={styles.statSub}>planned {summary.plannedMinutes} min</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Exercises</span>
            <span className={styles.statValue}>
              {summary.exercisesCompleted}/{summary.exercisesPlanned}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Sets</span>
            <span className={styles.statValue}>
              {summary.setsCompleted}/{summary.setsPlanned}
            </span>
            <span className={styles.statSub}>+{summary.warmupSets} warm-up</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Volume</span>
            <span className={styles.statValue}>{summary.volume.toLocaleString()}</span>
            <span className={styles.statSub}>{units} × reps</span>
          </div>
        </div>
        {summary.muscles.length > 0 ? (
          <div className={styles.chips} aria-label="Muscles trained">
            {summary.muscles.map((muscle) => (
              <span key={muscle} className={styles.chip}>
                {muscleName(muscle as MuscleId)}
              </span>
            ))}
          </div>
        ) : null}
        {summary.prs.length > 0 ? (
          <div className={styles.chips} aria-label="Personal records" data-testid="completion-prs">
            {summary.prs.map((pr) => (
              <span
                key={`${pr.exerciseId}-${pr.kind}`}
                className={`${styles.chip} ${styles.prChip}`}
              >
                PR · {pr.detail}
              </span>
            ))}
          </div>
        ) : null}
        <FactList
          items={[
            ...summary.highlights.map((line, index) => ({
              label: index === 0 ? 'Highlights' : '',
              value: line,
            })),
            {
              label: 'Skipped',
              value: summary.skipped.length > 0 ? summary.skipped.join(', ') : 'nothing',
            },
            {
              label: 'Substitutions',
              value: summary.substitutions.length > 0 ? summary.substitutions.join('; ') : 'none',
            },
            {
              label: 'Rating',
              value: rating
                ? `${rating.effort.replace('-', ' ')}, energy ${rating.energyAfter}/5${rating.pain ? ', pain reported' : ''}${rating.note ? `: ${rating.note}` : ''}`
                : 'not rated',
            },
            { label: 'Next time', value: summary.nextImplication },
            {
              label: 'Records',
              value:
                summary.prs.length > 0
                  ? `${summary.prs.length} personal ${summary.prs.length === 1 ? 'record' : 'records'}`
                  : 'none this time',
            },
            { label: 'Recovery', value: summary.recoveryNote },
            { label: 'Focus', value: summary.nextFocus },
          ]}
        />
        {summary.nextTargets.length > 0 ? (
          <div data-testid="next-targets">
            <FactList
              items={summary.nextTargets.map((line, index) => ({
                label: index === 0 ? 'Next targets' : '',
                value: line,
              }))}
            />
          </div>
        ) : null}
        {summary.feedback.length > 0 ? (
          <FactList
            items={summary.feedback.map((line, index) => ({
              label: index === 0 ? 'Coach' : '',
              value: line,
            }))}
          />
        ) : null}
        <p className={styles.panelNote}>
          Personal records, next targets, and next focus were computed from this record. Progress
          and Plan read the same history.
        </p>
        <Button
          variant="primary"
          onClick={() => {
            store.dismissCompletion();
            window.location.hash = routeHref('today');
          }}
          data-testid="completion-done"
        >
          Done
        </Button>
      </Card>
    </>
  );
}
