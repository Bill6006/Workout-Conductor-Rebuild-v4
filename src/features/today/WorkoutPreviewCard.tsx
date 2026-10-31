import { routeHref } from '../../app/navigation';
import { exerciseEquipmentLabel, requireExercise } from '../../catalog/exercises/catalog';
import { muscleName } from '../../catalog/muscles/muscles';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { DurationSelector } from '../../components/DurationSelector/DurationSelector';
import { ExerciseThumb } from '../../components/ExerciseDetail/ExerciseMedia';
import type { LocationProfile } from '../../core/validation/location';
import type { ChangeSummary, EntryChange } from '../../engine/recalibration/types';
import {
  allEntries,
  isStopped,
  pushMarkOf,
  workingSets,
  type DurationChoice,
  type GeneratedWorkout,
  type WorkoutBlock,
  type WorkoutEntry,
} from '../../engine/workout/types';
import { holdById, stoppedText } from '../../engine/workout/setText';
import { keyedLines } from '../../core/screen/keyedLines';
import styles from './TodayScreen.module.css';

interface WorkoutPreviewCardProps {
  workout: GeneratedWorkout;
  /** Complete Default session length, shown in the dropdown's Default option. */
  defaultEstimatedMinutes: number;
  location: LocationProfile | undefined;
  /** Opens the place chooser; without it the control links to the Plan tab. */
  onChangeLocation?: () => void;
  onSelect: (entry: WorkoutEntry, block: WorkoutBlock) => void;
  onDurationChange: (choice: DurationChoice) => void;
  /** The last recalibration's compact summary, until dismissed. */
  summary?: ChangeSummary | null;
  changes?: readonly EntryChange[];
  canUndo?: boolean;
  onUndo?: () => void;
  onDismissSummary?: () => void;
  /** Exact-end mode state; the control shows when the plan runs over or the mode is on. */
  endBy?: { on: boolean; label: string | null };
  onEndByChange?: (on: boolean) => void;
  /** 'preview' offers Start; an active or completed session offers to continue. */
  sessionStatus?: 'preview' | 'active' | 'paused' | 'completed';
  onStart?: () => void;
  /** Puts this place's barcode on screen; only passed when the place has one. */
  onShowBarcode?: () => void;
  /** Sets logged this session, not skipped, as `entryId:setIndex`: what a stopped exercise counts. */
  logged?: ReadonlySet<string>;
  /**
   * The day's one line on a catch-up or a second workout (Maintenance 31), which only says what the
   * plan is (the owner, 2026-10-31: the app chooses the day's workout, never the lifter); a rest
   * day's, with its button to update the check-in (Maintenance 33).
   */
  dayNote?: { text: string; actionLabel?: string; onAction?: () => void } | null;
  /** A rest day from the check-in (Maintenance 33): the day's line says so, and nothing starts. */
  restToday?: boolean;
  /**
   * "Longer would help" (Maintenance 34): an inline suggestion beside the length control, never a
   * question, with the length to take and Not now.
   */
  longer?: { text: string; take: string; onTake: () => void; onDecline: () => void } | null;
}

const NONE_LOGGED: ReadonlySet<string> = new Set();

const CHANGE_TAGS: Record<EntryChange['kind'], string> = {
  added: 'New',
  replaced: 'Swapped',
  adjusted: 'Adjusted',
  removed: 'Removed',
};

function restLabel(seconds: number): string {
  if (seconds === 0) return 'no rest';
  return seconds >= 60 ? `${Math.round((seconds / 60) * 10) / 10} min rest` : `${seconds} s rest`;
}

/** What the lifter's own pace adds to the plan's own parts, or takes away (Maintenance 28). */
function paceText(minutes: number | undefined): string {
  if (!minutes) return '';
  return `, ${Math.abs(minutes)} min ${minutes > 0 ? 'more' : 'less'} at your pace`;
}

/**
 * An exercise stopped at its logged sets (the place could not equip it, or it was swapped out
 * once started) says so, instead of reading as work still to do (Maintenance 22).
 */
function setsLabel(entry: WorkoutEntry): string {
  const working = workingSets(entry).filter((set) => set.kind === 'working');
  const first = working[0];
  const hold = holdById(entry.exerciseId);
  const reps = first
    ? hold
      ? `${first.targetReps[0]} s`
      : `${first.targetReps[0]}-${first.targetReps[1]}`
    : '';
  const rir = first && !hold ? ` @ RIR ${first.targetRir}` : '';
  const warm = entry.warmupSets > 0 ? ` · ${entry.warmupSets} warm-up` : '';
  const load = first && first.targetWeight !== null ? `${first.targetWeight} × ` : '';
  // A top set and its back-offs (Maintenance 32, item 11): "1 × 190 × 4-6 @ RIR 1, then 3 × 180
  // @ RIR 2".
  const backOffs = working.filter((set) => set.tier === 'back-off');
  const backOff = backOffs[0];
  if (first?.tier === 'top' && backOff) {
    const then = `${backOffs.length} × ${backOff.targetWeight !== null ? `${backOff.targetWeight} ` : ''}@ RIR ${backOff.targetRir}`;
    return `${working.length - backOffs.length} × ${load}${reps}${rir}, then ${then}${warm}`;
  }
  return `${working.length} × ${load}${reps}${rir}${warm}`;
}

function EntryRow({
  entry,
  block,
  prefix,
  location,
  change,
  logged,
  onSelect,
}: {
  entry: WorkoutEntry;
  block: WorkoutBlock;
  prefix?: string;
  location: LocationProfile | undefined;
  change?: EntryChange['kind'];
  logged: ReadonlySet<string>;
  onSelect: (entry: WorkoutEntry, block: WorkoutBlock) => void;
}) {
  const exercise = requireExercise(entry.exerciseId);
  const stopped = isStopped(entry);
  return (
    <button
      type="button"
      className={styles.exercise}
      onClick={() => onSelect(entry, block)}
      data-testid="workout-entry"
      data-entry-id={entry.id}
      data-exercise-id={entry.exerciseId}
      data-changed={change}
    >
      {prefix ? <span className={styles.exerciseIndex}>{prefix}</span> : null}
      <ExerciseThumb exercise={exercise} />
      <span className={styles.exerciseBody}>
        <span className={styles.exerciseName}>
          {exercise.name}
          {entry.dropSet ? <span className={styles.badge}>Drop set</span> : null}
          {pushMarkOf(entry) && !stopped ? (
            <span className={styles.badge}>Lift to push</span>
          ) : entry.role === 'primary-strength' && !stopped ? (
            <span className={styles.badge}>Main lift</span>
          ) : null}
          {change ? <span className={styles.tag}>{CHANGE_TAGS[change]}</span> : null}
          {entry.pinned ? (
            <span className={`${styles.tag} ${styles.tagQuiet}`}>Pinned</span>
          ) : entry.locked ? (
            <span className={`${styles.tag} ${styles.tagQuiet}`}>Your pick</span>
          ) : null}
        </span>
        <span className={styles.exerciseMeta} data-testid="entry-meta">
          {stopped ? (
            stoppedText(entry, logged)
          ) : (
            <>
              {setsLabel(entry)} ·{' '}
              {restLabel(
                block.kind === 'straight' ? entry.restSeconds : block.restBetweenRoundsSeconds,
              )}{' '}
              · {exerciseEquipmentLabel(exercise, new Set(location?.equipment ?? []))}
            </>
          )}
        </span>
      </span>
    </button>
  );
}

export function WorkoutPreviewCard({
  workout,
  defaultEstimatedMinutes,
  location,
  onChangeLocation,
  onSelect,
  onDurationChange,
  summary = null,
  changes = [],
  canUndo = false,
  onUndo,
  onDismissSummary,
  endBy,
  onEndByChange,
  sessionStatus = 'preview',
  onStart,
  onShowBarcode,
  logged = NONE_LOGGED,
  dayNote = null,
  longer = null,
  restToday = false,
}: WorkoutPreviewCardProps) {
  const { duration } = workout;
  const fitted = duration.choice !== 'default' || (endBy?.on ?? false);
  const estimateLabel =
    duration.overByMinutes > 1
      ? `about ${duration.estimatedMinutes} min, ${Math.round(duration.overByMinutes)} over`
      : `about ${duration.estimatedMinutes} min`;
  // The dropdown already says "Default: N min" (Maintenance 29, the owner's item 10): the line
  // shows only what it adds, a length chosen or an end time, or a plan running over. At the Default
  // every rebuild sets the dropdown's minutes too; should the two ever part, the line says the
  // plan's own.
  const sayEstimate =
    fitted || duration.overByMinutes > 1 || duration.estimatedMinutes !== defaultEstimatedMinutes;
  const changeOf = (entry: WorkoutEntry) =>
    changes.find((change) => change.entryId === entry.id)?.kind;
  // A second workout with nothing left to give (Maintenance 31): the day's line says so, and there
  // is nothing to start.
  const nothing =
    (dayNote !== null && sessionStatus === 'preview' && allEntries(workout.blocks).length === 0) ||
    (restToday && sessionStatus === 'preview');

  return (
    <Card tone="accent" eyebrow="Today's workout" title={workout.title}>
      <p className={styles.demoNote}>{workout.explanation.summary}</p>

      {dayNote ? (
        <p className={styles.dayNote} data-testid="day-note">
          <span data-testid="day-note-text">{dayNote.text}</span>
          {dayNote.onAction && dayNote.actionLabel ? (
            <button
              type="button"
              className={styles.link}
              onClick={dayNote.onAction}
              data-testid="day-note-action"
            >
              {dayNote.actionLabel}
            </button>
          ) : null}
        </p>
      ) : null}

      <div className={styles.metaRow}>
        <DurationSelector
          choice={duration.choice}
          defaultMinutes={defaultEstimatedMinutes}
          onChange={onDurationChange}
        />
        {onChangeLocation ? (
          <button
            type="button"
            className={`${styles.meta} ${styles.metaButton}`}
            onClick={onChangeLocation}
            data-testid="location-open"
          >
            <span className={styles.metaLabel}>Location</span>
            <span className={styles.metaValue}>
              {location?.name ?? 'Not set'} <span className={styles.metaChevron}>›</span>
            </span>
          </button>
        ) : (
          <a className={styles.meta} href={routeHref('plan')}>
            <span className={styles.metaLabel}>Location</span>
            <span className={styles.metaValue}>{location?.name ?? 'Not set'} ›</span>
          </a>
        )}
      </div>

      {longer ? (
        <p className={styles.dayNote} data-testid="longer-offer">
          <span data-testid="longer-text">{longer.text}</span>
          <button
            type="button"
            className={styles.link}
            onClick={longer.onTake}
            data-testid="longer-take"
          >
            {longer.take}
          </button>
          <button
            type="button"
            className={styles.link}
            onClick={longer.onDecline}
            data-testid="longer-decline"
          >
            Not now
          </button>
        </p>
      ) : null}

      {onShowBarcode ? (
        <button
          type="button"
          className={styles.link}
          onClick={onShowBarcode}
          data-testid="barcode-open"
        >
          Show barcode
        </button>
      ) : null}

      {sayEstimate ? (
        <p className={styles.estimate} data-testid="workout-estimate">
          {fitted ? `Fitted to ${duration.targetMinutes} min: ` : 'Default time: '}
          {estimateLabel}
          {duration.overByMinutes > 1 ? '. It may run a few minutes over.' : '.'}
        </p>
      ) : null}

      {endBy && (duration.overByMinutes > 1 || endBy.on) ? (
        <label className={styles.endBy}>
          <input
            type="checkbox"
            checked={endBy.on}
            onChange={(event) => onEndByChange?.(event.target.checked)}
            data-testid="end-by-toggle"
          />
          <span>
            End by exact time
            {endBy.on && endBy.label
              ? ` · ends by ${endBy.label}`
              : ` · fit strictly to ${duration.targetMinutes} min, even if a set of the main lift has to go`}
          </span>
        </label>
      ) : null}

      {summary ? (
        <div className={styles.summary} role="status" data-testid="recalibration-summary">
          <div className={styles.summaryBody}>
            <span className={styles.summaryHeadline}>{summary.headline}</span>
            {summary.details.length > 0 ? (
              <details className={styles.summaryDetails}>
                <summary>What changed</summary>
                <ul>
                  {keyedLines(summary.details).map(({ key, line }) => (
                    <li key={key}>{line}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
          <div className={styles.summaryActions}>
            {canUndo ? (
              <button type="button" className={styles.summaryButton} onClick={onUndo}>
                Undo
              </button>
            ) : null}
            <button
              type="button"
              className={styles.summaryButton}
              onClick={onDismissSummary}
              aria-label="Dismiss summary"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.focus} aria-label="Muscle priorities">
        {workout.musclePriorities.slice(0, 4).map((priority) => (
          <span key={priority.muscle} className={styles.focusChip} title={priority.reason}>
            {muscleName(priority.muscle)}
          </span>
        ))}
      </div>

      {nothing ? null : <p className={styles.warmup}>{workout.warmup.note}</p>}

      <ol className={styles.exercises} aria-label="Session list">
        {workout.blocks.map((block, index) => (
          <li
            key={block.id}
            className={styles.blockRow}
            data-testid="workout-block"
            data-kind={block.kind}
          >
            {block.kind === 'straight' ? (
              <EntryRow
                entry={block.entries[0]!}
                block={block}
                prefix={String(index + 1)}
                location={location}
                change={changeOf(block.entries[0]!)}
                logged={logged}
                onSelect={onSelect}
              />
            ) : (
              <div className={styles.group}>
                <span className={styles.groupLabel}>
                  {index + 1}. {block.label}
                  {block.kind === 'circuit'
                    ? ''
                    : ` · ${block.rounds} rounds · ${restLabel(block.restBetweenRoundsSeconds)}`}
                </span>
                {block.entries.map((entry, entryIndex) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    block={block}
                    prefix={
                      block.kind === 'superset' ? `A${entryIndex + 1}` : String(entryIndex + 1)
                    }
                    location={location}
                    change={changeOf(entry)}
                    logged={logged}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>

      <details className={styles.why}>
        <summary className={styles.whySummary}>Why this workout</summary>
        <ul className={styles.whyList}>
          {keyedLines(workout.explanation.reasons).map(({ key, line }) => (
            <li key={key}>{line}</li>
          ))}
          {keyedLines(workout.explanation.fittingSteps).map(({ key, line }) => (
            <li key={key}>{line}</li>
          ))}
          {keyedLines(workout.compromises).map(({ key, line }) => (
            <li key={key} className={styles.compromise}>
              {line}
            </li>
          ))}
          <li data-testid="time-breakdown">
            Time: {workout.explanation.time.warmupMinutes} min warm-up,{' '}
            {workout.explanation.time.workMinutes} min work, {workout.explanation.time.restMinutes}{' '}
            min rest, {workout.explanation.time.transitionMinutes} min setup
            {paceText(workout.explanation.time.paceMinutes)}. Confidence {workout.confidence}.
          </li>
        </ul>
      </details>

      {nothing ? null : (
        <>
          <Button
            variant="primary"
            onClick={onStart}
            aria-describedby="start-workout-hint"
            data-testid="start-workout"
          >
            {sessionStatus === 'preview'
              ? 'Start Workout'
              : sessionStatus === 'completed'
                ? 'See the summary'
                : 'Continue workout'}
          </Button>
          <p id="start-workout-hint" className={styles.hint}>
            Change the length above and the session recalibrates at once. Tap an exercise for its
            demonstration, alternatives, and session-only changes: swap, pin, busy station, skip,
            hurts. Start opens the active workout with one-tap set logging and the rest timer.
          </p>
        </>
      )}
    </Card>
  );
}
