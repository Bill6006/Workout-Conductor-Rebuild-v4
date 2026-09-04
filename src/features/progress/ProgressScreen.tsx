import { useMemo, useState } from 'react';
import { requireExercise } from '../../catalog/exercises/catalog';
import { Card } from '../../components/Card/Card';
import { BandBar, WeekBars } from '../../components/Charts/Bars';
import { FactList } from '../../components/FactList/FactList';
import { ScorePanel } from '../../components/ScorePanel/ScorePanel';
import { ScreenHeader } from '../../components/Screen/Screen';
import { Sheet } from '../../components/Sheet/Sheet';
import { useAppState } from '../../core/state/useAppStore';
import { formatDateTime, useNow } from '../../core/time/clock';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import {
  consistencyScore,
  durationEfficiency,
  estimatedStrength,
  exerciseProgress,
  muscleCoverage,
  painPatterns,
  rankings,
  techniqueUsage,
  type ExerciseProgress,
  type Score,
} from '../../engine/scoring/analytics';
import { recentPersonalRecords } from '../../engine/scoring/personalRecords';
import { HistoryDetailSheet } from './HistoryDetailSheet';
import styles from './Progress.module.css';

const BAND_TEXT = { under: '▲ under', in: '● in band', over: '▼ over' } as const;
const PR_KIND = {
  weight: 'Weight',
  'reps-at-weight': 'Reps',
  volume: 'Volume',
  'top-of-range': 'Top of range',
} as const;

function minutesOf(record: WorkoutRecord): number {
  return Math.round((record.elapsedSeconds ?? 0) / 60);
}

function setsOf(record: WorkoutRecord): number {
  return record.entries.reduce(
    (sum, entry) =>
      sum + entry.sets.filter((set) => set.kind === 'working' && set.completed).length,
    0,
  );
}

function volumeOf(record: WorkoutRecord): number {
  return Math.round(
    record.entries.reduce(
      (sum, entry) =>
        sum +
        entry.sets
          .filter((set) => set.kind !== 'warmup' && set.completed && set.weight !== null)
          .reduce((inner, set) => inner + (set.weight ?? 0) * set.reps, 0),
      0,
    ),
  );
}

/** Notes saved for an exercise, from the custom instruction that carries them. */
function notesFor(instructions: readonly unknown[], exerciseId: string): string | null {
  for (const item of instructions) {
    const candidate = item as { id?: string; exerciseId?: string; notes?: string };
    if (
      (candidate.exerciseId === exerciseId || candidate.id === exerciseId) &&
      typeof candidate.notes === 'string' &&
      candidate.notes.trim()
    ) {
      return candidate.notes;
    }
  }
  return null;
}

export function ProgressScreen() {
  const state = useAppState();
  const nowEpoch = useNow();
  const { history, profile } = state;
  const units = profile?.units ?? 'lb';
  const nowIso = nowEpoch
    ? new Date(nowEpoch).toISOString()
    : (profile?.updatedAt ?? '2026-01-01T00:00:00.000Z');
  const [record, setRecord] = useState<WorkoutRecord | null>(null);
  const [exercise, setExercise] = useState<ExerciseProgress | null>(null);
  const [allMuscles, setAllMuscles] = useState(false);

  const analytics = useMemo(() => {
    if (!profile) return null;
    const progress = exerciseProgress(history);
    return {
      consistency: consistencyScore(history, profile, nowIso),
      coverage: muscleCoverage(history, profile, nowIso),
      progress,
      strength: estimatedStrength(progress, units),
      ranked: rankings(progress),
      efficiency: durationEfficiency(history),
      techniques: techniqueUsage(history),
      pain: painPatterns(history),
      prs: recentPersonalRecords(history),
    };
  }, [history, profile, nowIso, units]);

  if (!analytics || !profile) {
    return (
      <>
        <ScreenHeader title="Progress" intro="History and trends with honest confidence." />
        <Card eyebrow="Setup" title="No profile yet">
          <p className={styles.muted}>Finish setup, then log a workout to see progress here.</p>
        </Card>
      </>
    );
  }

  const { consistency, coverage, progress, strength, ranked, efficiency, techniques, pain, prs } =
    analytics;
  const coverageScore: Score<null> = {
    value: null,
    definition:
      'Completed working sets in the last 7 days per muscle: direct sets count 1, indirect sets 0.5. Targets come from your goals (10 per muscle, scaled up for priority muscles and down for small ones). The band is 70 to 130 percent of the target.',
    samples: consistency.value.thisWeek,
    confidence:
      consistency.value.thisWeek === 0 ? 'none' : consistency.value.thisWeek < 2 ? 'low' : 'medium',
    explanation: `${coverage.filter((row) => row.band === 'in').length} of ${coverage.length} muscles are in band this week; ${coverage.filter((row) => row.priority && row.band === 'under').length} priority muscles are under.`,
    data: coverage.map(
      (row) =>
        `${row.name}: ${row.direct} direct + ${row.indirect} indirect of ${row.target} (${row.band}); last week ${row.lastWeekTotal}`,
    ),
  };
  const shownCoverage = allMuscles ? coverage : coverage.slice(0, 8);
  const newest = [...history].sort((a, b) =>
    (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt),
  );

  return (
    <>
      <ScreenHeader
        title="Progress"
        intro="History and trends with honest confidence, never false precision."
      />

      <Card tone="accent" eyebrow="Consistency" title="This week">
        <p className={styles.hero} data-testid="consistency-hero">
          {consistency.value.thisWeek} of {consistency.value.planned}
          <span className={styles.heroSub}> sessions planned</span>
        </p>
        <WeekBars weeks={consistency.value.weeks} label="Sessions per week, last eight weeks" />
        <FactList
          items={[
            {
              label: 'Average',
              value:
                consistency.value.averagePerWeek === null
                  ? 'no sessions yet'
                  : `${consistency.value.averagePerWeek} per week`,
            },
            {
              label: 'Streak',
              value: `${consistency.value.streakWeeks} ${consistency.value.streakWeeks === 1 ? 'week' : 'weeks'} with training`,
            },
            { label: 'Logged', value: `${history.length} workouts on this device` },
          ]}
        />
        <ScorePanel score={consistency} />
      </Card>

      <Card eyebrow="Muscle volume" title="Weekly coverage against targets">
        <ul className={styles.coverageList}>
          {shownCoverage.map((row) => (
            <li key={row.muscle} className={styles.coverageRow} data-testid="coverage-row">
              <span className={styles.coverageName}>
                {row.name}
                {row.priority ? <span className={styles.tag}>priority</span> : null}
                <span className={styles.band}>{BAND_TEXT[row.band]}</span>
              </span>
              <BandBar direct={row.direct} indirect={row.indirect} target={row.target} />
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={styles.link}
          onClick={() => setAllMuscles((value) => !value)}
        >
          {allMuscles ? 'Show priority muscles only' : `Show all ${coverage.length} muscles`}
        </button>
        <ScorePanel score={coverageScore} />
      </Card>

      <Card eyebrow="Estimated strength" title="Best estimates per lift">
        {strength.value.length === 0 ? (
          <p className={styles.muted}>Log weights on your sets and estimates appear here.</p>
        ) : (
          <ul className={styles.list}>
            {strength.value.map((item) => (
              <li key={item.exerciseId} className={styles.row}>
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{item.name}</span>
                  <span className={styles.rowMeta}>
                    {item.weight} {units} × {item.reps} · {item.sessions}{' '}
                    {item.sessions === 1 ? 'session' : 'sessions'} · {item.confidence} confidence
                  </span>
                </span>
                <span className={styles.rowValue}>
                  ~{Math.round(item.e1rm)} <span className={styles.rowUnit}>{units}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <ScorePanel score={strength} />
      </Card>

      <Card eyebrow="Exercise progress" title="Every lift you have logged">
        {progress.length === 0 ? (
          <p className={styles.muted}>Nothing logged yet.</p>
        ) : (
          <ul className={styles.list}>
            {progress.slice(0, 12).map((row) => (
              <li key={row.exerciseId}>
                <button
                  type="button"
                  className={`${styles.row} ${styles.rowButton}`}
                  onClick={() => setExercise(row)}
                  data-testid="exercise-progress-row"
                >
                  <span className={styles.rowMain}>
                    <span className={styles.rowName}>{row.name}</span>
                    <span className={styles.rowMeta}>
                      {row.sessions} {row.sessions === 1 ? 'session' : 'sessions'}
                      {row.best.weight !== null
                        ? ` · best ${row.best.weight} ${units} × ${row.best.reps}`
                        : row.best.reps > 0
                          ? ` · best ${row.best.reps} reps`
                          : ''}
                      {row.timesReplaced + row.timesSkipped > 0
                        ? ` · swapped or skipped ${row.timesReplaced + row.timesSkipped}×`
                        : ''}
                    </span>
                  </span>
                  <span className={styles.rowValue}>
                    {row.trendPct === null ? '' : `${row.trendPct > 0 ? '+' : ''}${row.trendPct}%`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {ranked.mostProductive.length > 0 || ranked.frequentlyReplaced.length > 0 ? (
          <FactList
            items={[
              {
                label: 'Most productive',
                value:
                  ranked.mostProductive.length > 0
                    ? ranked.mostProductive
                        .map(
                          (row) => `${row.name} (${row.trendPct! > 0 ? '+' : ''}${row.trendPct}%)`,
                        )
                        .join(', ')
                    : 'needs three sessions per lift',
              },
              {
                label: 'Often replaced',
                value:
                  ranked.frequentlyReplaced.length > 0
                    ? ranked.frequentlyReplaced.map((row) => row.name).join(', ')
                    : 'none',
              },
            ]}
          />
        ) : null}
        <p className={styles.muted}>
          Trend is the latest estimated one-rep max against the oldest of the last four sessions.
          Tap a lift for its sessions and notes.
        </p>
      </Card>

      <Card eyebrow="Personal records" title={prs.length > 0 ? 'Recent records' : 'No records yet'}>
        {prs.length === 0 ? (
          <p className={styles.muted}>
            The first session of a lift is its baseline. Beat it on weight, reps at a weight,
            session volume, or complete the top of the range at your best load, and it lands here.
          </p>
        ) : (
          <ul className={styles.prList} data-testid="pr-list">
            {prs.map(({ record: from, pr }) => (
              <li key={`${from.id}-${pr.exerciseId}-${pr.kind}`} className={styles.prRow}>
                <span className={styles.prBadge}>{PR_KIND[pr.kind]} PR</span>
                <span className={styles.prText}>
                  {pr.detail}
                  <span className={styles.rowMeta}>
                    {' '}
                    · {formatDateTime(from.completedAt ?? from.startedAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card eyebrow="Efficiency and patterns" title="How sessions actually go">
        <FactList
          items={[
            {
              label: 'Duration',
              value:
                efficiency.value.averageRatio === null
                  ? 'no timed sessions yet'
                  : `${efficiency.value.averageActualMinutes} min actual vs ${efficiency.value.averagePlannedMinutes} planned (${Math.round(efficiency.value.averageRatio * 100)}%)`,
            },
            {
              label: 'Density',
              value:
                efficiency.value.setsPer10Min === null
                  ? efficiency.samples > 0
                    ? 'needs five minutes of logged training'
                    : 'no timed sessions yet'
                  : `${efficiency.value.setsPer10Min} working sets per 10 min`,
            },
            {
              label: 'Techniques',
              value: `${techniques.value.supersetSessions} paired ${techniques.value.supersetSessions === 1 ? 'session' : 'sessions'}, ${techniques.value.dropSets} drop ${techniques.value.dropSets === 1 ? 'set' : 'sets'}`,
            },
            {
              label: 'Balance',
              value:
                techniques.value.strengthSets + techniques.value.hypertrophySets === 0
                  ? 'no working sets yet'
                  : `${Math.round((techniques.value.strengthSets / (techniques.value.strengthSets + techniques.value.hypertrophySets)) * 100)}% strength, ${Math.round((techniques.value.hypertrophySets / (techniques.value.strengthSets + techniques.value.hypertrophySets)) * 100)}% hypertrophy sets`,
            },
            {
              label: 'Pain',
              value:
                pain.value.length === 0
                  ? 'none reported'
                  : pain.value
                      .map((item) => `${item.joint.replace('-', ' ')} ×${item.count}`)
                      .join(', '),
            },
          ]}
        />
        <ScorePanel score={efficiency} label="Duration and density" />
        <ScorePanel score={techniques} label="Techniques and balance" />
        <ScorePanel score={pain} label="Pain patterns" />
      </Card>

      <Card
        eyebrow="History"
        title={`${history.length} ${history.length === 1 ? 'workout' : 'workouts'} logged`}
      >
        {newest.length === 0 ? (
          <p className={styles.muted}>Finish a workout and it appears here with every set.</p>
        ) : (
          <ul className={styles.list}>
            {newest.slice(0, 20).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`${styles.row} ${styles.rowButton}`}
                  onClick={() => setRecord(item)}
                  data-testid="history-row"
                >
                  <span className={styles.rowMain}>
                    <span className={styles.rowName}>
                      {item.title ?? 'Workout'}
                      {(item.prs ?? []).length > 0 ? (
                        <span className={styles.prBadge}>{(item.prs ?? []).length} PR</span>
                      ) : null}
                    </span>
                    <span className={styles.rowMeta}>
                      {formatDateTime(item.completedAt ?? item.startedAt)} · {minutesOf(item)} min ·{' '}
                      {setsOf(item)} sets · {volumeOf(item).toLocaleString()} {units}
                      {item.endedEarly ? ' · ended early' : ''}
                    </span>
                  </span>
                  <span className={styles.rowValue}>›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <HistoryDetailSheet
        record={record}
        units={units}
        notesFor={(exerciseId) => notesFor(state.customInstructions, exerciseId)}
        onClose={() => setRecord(null)}
      />

      <Sheet
        open={exercise !== null}
        title={exercise?.name ?? ''}
        onClose={() => setExercise(null)}
      >
        {exercise ? (
          <>
            <FactList
              items={[
                { label: 'Sessions', value: String(exercise.sessions) },
                {
                  label: 'Best',
                  value:
                    exercise.best.weight !== null
                      ? `${exercise.best.weight} ${units} × ${exercise.best.reps} (~${Math.round(exercise.best.e1rm ?? 0)} ${units} e1RM)`
                      : `${exercise.best.reps} reps`,
                },
                {
                  label: 'Trend',
                  value:
                    exercise.trendPct === null
                      ? 'needs two sessions with weights'
                      : `${exercise.trendPct > 0 ? '+' : ''}${exercise.trendPct}% over the last ${Math.min(4, exercise.points.length)} sessions`,
                },
                {
                  label: 'Swaps',
                  value: `${exercise.timesReplaced} replaced, ${exercise.timesSkipped} skipped`,
                },
                {
                  label: 'Notes',
                  value: notesFor(state.customInstructions, exercise.exerciseId) ?? 'none saved',
                },
              ]}
            />
            <ul className={styles.list}>
              {exercise.points.map((point) => (
                <li key={point.date} className={styles.row}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowName}>{formatDateTime(point.date)}</span>
                    <span className={styles.rowMeta}>
                      {point.sets
                        .map(
                          (set) =>
                            `${set.weight ?? 'bw'}×${set.reps}${set.rir !== null ? `@${set.rir}` : ''}`,
                        )
                        .join('  ')}
                    </span>
                  </span>
                  <span className={styles.rowValue}>
                    {point.e1rm !== null ? `~${Math.round(point.e1rm)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.muted}>
              {requireExercise(exercise.exerciseId).name}: e1RM uses Epley on the best completed
              working set of each session. Warm-ups are never counted.
            </p>
          </>
        ) : null}
      </Sheet>
    </>
  );
}
