import { routeHref } from '../../app/navigation';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { ScreenHeader } from '../../components/Screen/Screen';
import { useAppStore } from '../../core/state/useAppStore';
import { durationLabel } from '../../engine/duration/duration';
import { useTodayWorkout } from '../today/useTodayWorkout';
import { ActiveWorkoutScreen } from './ActiveWorkoutScreen';
import { WorkoutCompletion } from './WorkoutCompletion';
import styles from './WorkoutScreen.module.css';

/** Preview before the start, the active workout while training, the summary after. */
export function WorkoutScreen() {
  const store = useAppStore();
  const today = useTodayWorkout();

  if (!today) {
    return (
      <>
        <ScreenHeader title="Workout" intro="Finish setup on Today to get a workout." />
        <Card eyebrow="Setup" title="No workout yet">
          <p className={styles.meta}>
            <a href={routeHref('today')}>Open Today</a> to finish setup.
          </p>
        </Card>
      </>
    );
  }

  const { session } = today;
  if (session.status === 'active' || session.status === 'paused') return <ActiveWorkoutScreen />;
  if (session.status === 'completed')
    return <WorkoutCompletion session={session} units={today.profile.units} />;

  return (
    <>
      <ScreenHeader
        title="Workout"
        intro="One unmistakable current set, fast logging, and calm recalibration. Start when you are at the first station."
      />
      <Card eyebrow="Active workout list" title={today.workout.title}>
        <p className={styles.meta}>
          {durationLabel(today.workout.duration.choice, today.defaultEstimatedMinutes)} · about{' '}
          {today.workout.duration.estimatedMinutes} min · {today.location?.name ?? 'no place set'}
        </p>
        {session.lastSummary ? (
          <p className={styles.meta} role="status">
            {session.lastSummary.headline}
          </p>
        ) : null}
        <ol className={styles.list} aria-label="Active workout list">
          {today.workout.blocks.map((block) => (
            <li key={block.id} className={styles.row} data-kind={block.kind}>
              <span className={styles.rowLabel}>{block.label}</span>
              <span className={styles.rowMeta}>
                {block.kind === 'straight' ? `${block.rounds} sets` : `${block.rounds} rounds`}
              </span>
            </li>
          ))}
        </ol>
        <Button variant="primary" onClick={() => store.startWorkout()} data-testid="start-workout">
          Start Workout
        </Button>
        <p className={styles.meta}>
          Change the length, swap, pin, or skip an exercise on{' '}
          <a href={routeHref('today')}>Today</a> or here once started.
        </p>
      </Card>

      <Card eyebrow="Recalibration engine" title="What changed this session">
        {session.log.length === 0 ? (
          <p className={styles.meta}>
            No recalibrations yet. Every change to the workout is routed through one engine and
            listed here with its scope and how long it took.
          </p>
        ) : (
          <ol className={styles.list} aria-label="Recalibration log" data-testid="calibration-log">
            {session.log.map((item) => (
              <li key={`${item.at}-${item.trigger}`} className={styles.row}>
                <span className={styles.rowLabel}>{item.headline}</span>
                <span className={styles.rowMeta}>
                  {item.label} · {item.scope} · {item.durationMs} ms
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
