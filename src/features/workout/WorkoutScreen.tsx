import { routeHref } from '../../app/navigation';
import { Card } from '../../components/Card/Card';
import { PlaceholderCard, ScreenHeader } from '../../components/Screen/Screen';
import { durationLabel } from '../../engine/duration/duration';
import { useTodayWorkout } from '../today/useTodayWorkout';
import styles from './WorkoutScreen.module.css';

export function WorkoutScreen() {
  const today = useTodayWorkout();

  return (
    <>
      <ScreenHeader
        title="Workout"
        intro="The active session: one unmistakable current set, fast logging, and calm recalibration."
      />
      {today ? (
        <>
          <Card eyebrow="Active workout list · preview" title={today.workout.title}>
            <p className={styles.meta}>
              {durationLabel(today.workout.duration.choice, today.defaultEstimatedMinutes)} · about{' '}
              {today.workout.duration.estimatedMinutes} min ·{' '}
              {today.location?.name ?? 'no place set'}
            </p>
            {today.session.lastSummary ? (
              <p className={styles.meta} role="status">
                {today.session.lastSummary.headline}
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
            <p className={styles.meta}>
              Change the length, swap, pin, or skip an exercise on{' '}
              <a href={routeHref('today')}>Today</a>. Logging starts in Phase 5.
            </p>
          </Card>

          <Card eyebrow="Recalibration engine" title="What changed this session">
            {today.session.log.length === 0 ? (
              <p className={styles.meta}>
                No recalibrations yet. Every change to the workout is routed through one engine and
                listed here with its scope and how long it took.
              </p>
            ) : (
              <ol
                className={styles.list}
                aria-label="Recalibration log"
                data-testid="calibration-log"
              >
                {today.session.log.map((item) => (
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
      ) : null}
      <PlaceholderCard
        title="Active workout"
        arrivesIn="Phase 5"
        items={[
          'One-handed set logging for weight, reps, and RIR',
          'Rest timer that survives screen changes',
          'Recalibration while you train: reps far from target, busy stations, pain, finish early',
          'Workout completion and session rating',
        ]}
      />
    </>
  );
}
