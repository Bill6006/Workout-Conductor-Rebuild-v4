import { useState } from 'react';
import { requireExercise } from '../../catalog/exercises/catalog';
import { AdaptiveCoachCard } from '../../components/AdaptiveCoach/AdaptiveCoachCard';
import { Card } from '../../components/Card/Card';
import { DurationSelector } from '../../components/DurationSelector/DurationSelector';
import { ExerciseCard } from '../../components/ExerciseCard/ExerciseCard';
import {
  ExerciseDetailSheet,
  type EditActions,
} from '../../components/ExerciseDetail/ExerciseDetailSheet';
import { ProgressBar } from '../../components/ProgressBar/ProgressBar';
import { RestTimer } from '../../components/RestTimer/RestTimer';
import { ScreenHeader } from '../../components/Screen/Screen';
import { SetLogger, type SetLoggerValues } from '../../components/SetLogger/SetLogger';
import { SupersetGroup } from '../../components/SupersetGroup/SupersetGroup';
import { useToast } from '../../components/Toast/useToast';
import { doneKeys, elapsedSeconds, type WorkoutSession } from '../../core/state/session';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import { useTicker } from '../../core/time/useTicker';
import type { UnitSystem } from '../../core/validation/profile';
import type { SessionRating } from '../../core/validation/workoutRecord';
import { rankAlternatives } from '../../engine/alternatives/rankAlternatives';
import { liveSetRecords } from '../../engine/scoring/personalRecords';
import type { CoachAction } from '../../engine/coach/coachConductor';
import { useCoach } from '../coach/useCoach';
import { ReadinessSheet } from '../today/ReadinessSheet';
import { preferredIdsOf } from '../../engine/conflicts/context';
import { estimateWorkout } from '../../engine/duration/duration';
import { plateMath, weightStep } from '../../engine/plateMath/plateMath';
import { contextFor } from '../../engine/recalibration/recalibrate';
import type { RecalibrationTrigger } from '../../engine/recalibration/types';
import { currentPosition, workoutProgress } from '../../engine/workout/sequence';
import {
  allEntries,
  type SetPrescription,
  type WorkoutBlock,
  type WorkoutEntry,
} from '../../engine/workout/types';
import styles from './ActiveWorkout.module.css';
import { EntryPanels } from './EntryPanels';
import { LoggedSets } from './LoggedSets';
import { describeSet } from './setFormat';
import { RatingSheet } from './RatingSheet';
import { previousPerformance } from './previousPerformance';

interface Editing {
  entryId: string;
  setIndex: number;
}

interface Selection {
  entry: WorkoutEntry;
  block: WorkoutBlock;
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

function roundTo(value: number, step: number): number {
  return Math.max(0, Math.round(value / step) * step);
}

/** Prefilled logger values: the last set of this exercise, else the target, else previous performance. */
function initialFor(
  session: WorkoutSession,
  entry: WorkoutEntry,
  set: SetPrescription,
  previousWeight: number | null,
  step: number,
): SetLoggerValues {
  const draft = session.drafts[entry.id];
  const base = draft?.weight ?? set.targetWeight ?? previousWeight;
  if (set.kind === 'warmup') {
    return {
      weight: base === null || base === undefined ? null : roundTo(base * 0.6, step),
      reps: set.targetReps[1],
      rir: 5,
    };
  }
  if (set.kind === 'drop') {
    return {
      weight: base === null || base === undefined ? null : roundTo(base * 0.8, step),
      reps: set.targetReps[1],
      rir: 0,
    };
  }
  return {
    weight: base ?? null,
    reps: draft?.reps ?? set.targetReps[1],
    rir: draft?.rir ?? set.targetRir,
  };
}

function loggedValues(session: WorkoutSession, entryId: string, setIndex: number): SetLoggerValues {
  const logged = session.completed.sets.find(
    (candidate) => candidate.entryId === entryId && candidate.setIndex === setIndex,
  );
  return {
    weight: logged?.weight ?? null,
    reps: logged?.reps ?? 0,
    rir: logged?.rir ?? null,
  };
}

/**
 * The active workout: one unmistakable current set, fast logging, the rest
 * timer, both superset moves together, and every edit routed through the one
 * Recalibration Engine. Panels and sheets keep the screen compact.
 */
export function ActiveWorkoutScreen() {
  const store = useAppStore();
  const toast = useToast();
  const session = useAppSelector((state) => state.session);
  const profile = useAppSelector((state) => state.profile);
  const history = useAppSelector((state) => state.history);
  const instructions = useAppSelector((state) => state.customInstructions);
  const locations = useAppSelector((state) => state.locations);
  const calibrating = useAppSelector((state) => state.calibration.status !== 'idle');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [finishing, setFinishing] = useState<'idle' | 'rating'>('idle');
  const [endedEarly, setEndedEarly] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const coach = useCoach();
  /** Weight currently shown in a logger, so Plate Math follows it before the set is logged. */
  const [liveWeights, setLiveWeights] = useState<Record<string, number | null>>({});
  const active = session?.status === 'active';
  const now = useTicker(1000, active);

  if (!session || !profile || session.status === 'preview' || session.status === 'completed') {
    return null;
  }

  const { workout } = session;
  const units: UnitSystem = profile.units;
  const location = locations.find((candidate) => candidate.id === profile.currentLocationId);
  const context = contextFor({ profile, location }, session.constraints);
  const keys = doneKeys(session.completed);
  const isDone = (entryId: string, setIndex: number) => keys.has(`${entryId}:${setIndex}`);
  const position = currentPosition(workout, isDone);
  const progress = workoutProgress(workout, isDone);
  const elapsed = elapsedSeconds(session, now);
  const remainingMinutes = Math.round(
    estimateWorkout(workout.blocks, 0, requireExercise, isDone).totalMinutes,
  );
  const currentBlock = position
    ? workout.blocks.find((block) => block.id === position.blockId)
    : undefined;
  const nextBlock = currentBlock
    ? workout.blocks[workout.blocks.indexOf(currentBlock) + 1]
    : undefined;
  const lastLogged = session.completed.sets[session.completed.sets.length - 1];
  const undoable =
    lastLogged && !lastLogged.skipped
      ? { entryId: lastLogged.entryId, setIndex: lastLogged.setIndex }
      : null;
  const paused = session.status === 'paused';

  const act = (trigger: RecalibrationTrigger) => {
    setSelected(null);
    void store.recalibrate(trigger);
  };

  // Compact PR feedback: what the logged sets of this exercise have already beaten.
  const prBadge = (entry: { id: string; exerciseId: string }) =>
    liveSetRecords(
      entry.exerciseId,
      session.completed.sets.filter((set) => set.entryId === entry.id),
      history,
    )
      .map((pr) => pr.label)
      .join(' · ') || null;

  const onCoachAction = (action: CoachAction) => {
    switch (action.kind) {
      case 'recalibrate':
        void store.recalibrate(action.trigger);
        break;
      case 'rest':
        store.adjustRest(action.deltaSeconds);
        break;
      case 'readiness':
        setCheckingIn(true);
        break;
      case 'alternatives': {
        const block = workout.blocks.find((candidate) =>
          candidate.entries.some((entry) => entry.id === action.entryId),
        );
        const entry = block?.entries.find((candidate) => candidate.id === action.entryId);
        if (block && entry) setSelected({ entry, block });
        break;
      }
      case 'backup':
        window.location.hash = '#/settings';
        break;
    }
  };

  const commitLog = (entry: WorkoutEntry, set: SetPrescription, values: SetLoggerValues) => {
    void store.logSet(entry.id, set.index, values).catch((error: unknown) => {
      toast.show(error instanceof Error ? error.message : 'Could not log the set', 'error');
    });
  };

  const commitEdit = (entryId: string, setIndex: number, values: SetLoggerValues) => {
    setEditing(null);
    void store.logSet(entryId, setIndex, values).catch((error: unknown) => {
      toast.show(error instanceof Error ? error.message : 'Could not save the set', 'error');
    });
  };

  const finish = async (rating: SessionRating | null) => {
    setFinishing('idle');
    try {
      await store.finishWorkout(rating, { endedEarly });
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not save the workout', 'error');
    }
  };

  const loggerFor = (entry: WorkoutEntry, block: WorkoutBlock) => {
    const exercise = requireExercise(entry.exerciseId);
    const step = weightStep(exercise, units);
    const previous = previousPerformance(history, entry.exerciseId);
    const logged = session.completed.sets.filter((set) => set.entryId === entry.id);
    const editingHere = editing && editing.entryId === entry.id ? editing : null;
    const editingSet = editingHere
      ? entry.sets.find((set) => set.index === editingHere.setIndex)
      : undefined;
    const currentHere = position && position.entryId === entry.id ? position : null;
    const draftWeight =
      liveWeights[entry.id] ??
      session.drafts[entry.id]?.weight ??
      currentHere?.set.targetWeight ??
      previous?.weight ??
      null;
    const helper =
      draftWeight !== null && draftWeight > 0 ? plateMath(exercise, draftWeight, units).line : null;

    return (
      <>
        <LoggedSets
          entry={entry}
          logged={logged}
          units={units}
          currentSetIndex={currentHere?.setIndex ?? null}
          undoable={undoable}
          onEdit={(setIndex) => setEditing({ entryId: entry.id, setIndex })}
          onUndo={() => store.undoLastSet()}
          compact={block.kind !== 'straight'}
        />
        {editingHere && editingSet ? (
          <SetLogger
            key={`edit-${entry.id}-${editingSet.index}`}
            units={units}
            target={{
              kind: editingSet.kind,
              reps: editingSet.targetReps,
              rir: editingSet.targetRir,
              weight: editingSet.targetWeight,
              label: describeSet(editingSet, entry),
            }}
            initial={loggedValues(session, entry.id, editingSet.index)}
            mode="edit"
            weightStep={step}
            onCommit={(values) => commitEdit(entry.id, editingSet.index, values)}
            onCancel={() => setEditing(null)}
            onDelete={() => {
              setEditing(null);
              store.deleteLoggedSet(entry.id, editingSet.index);
            }}
            disabled={calibrating}
          />
        ) : currentHere ? (
          <>
            <SetLogger
              key={`log-${entry.id}-${currentHere.setIndex}`}
              units={units}
              target={{
                kind: currentHere.kind,
                reps: currentHere.set.targetReps,
                rir: currentHere.set.targetRir,
                weight: currentHere.set.targetWeight,
                label: describeSet(currentHere.set, entry),
              }}
              initial={initialFor(session, entry, currentHere.set, previous?.weight ?? null, step)}
              mode="log"
              weightStep={step}
              onCommit={(values) => commitLog(entry, currentHere.set, values)}
              disabled={calibrating}
              helper={helper}
              onChange={(values) =>
                setLiveWeights((current) => ({ ...current, [entry.id]: values.weight }))
              }
            />
            {currentHere.kind === 'warmup' ? (
              <div className={styles.warmupActions}>
                <button
                  type="button"
                  className={styles.smallButton}
                  onClick={() => store.skipWarmup(entry.id)}
                  data-testid="skip-warmup"
                >
                  Skip ramp sets
                </button>
                <span className={styles.panelNote}>Ramp sets never count as working sets.</span>
              </div>
            ) : null}
          </>
        ) : null}
        <EntryPanels
          entry={entry}
          block={block}
          exercise={exercise}
          units={units}
          currentWeight={draftWeight}
          previous={previous}
          instruction={instructions.find((item) => item.exerciseId === entry.exerciseId)}
          onSaveNotes={(notes, cues) => store.saveExerciseNotes(entry.exerciseId, { notes, cues })}
          onOptions={() => setSelected({ entry, block })}
        />
      </>
    );
  };

  const renderBlock = (block: WorkoutBlock) => {
    if (block.kind === 'straight') {
      const entry = block.entries[0] as WorkoutEntry;
      return (
        <ExerciseCard
          key={block.id}
          entry={entry}
          block={block}
          units={units}
          position={position}
          logged={session.completed.sets.filter((set) => set.entryId === entry.id)}
          previous={previousPerformance(history, entry.exerciseId)}
          availableEquipment={context.availableEquipment}
          badge={prBadge(entry)}
        >
          {loggerFor(entry, block)}
        </ExerciseCard>
      );
    }
    return (
      <SupersetGroup
        key={block.id}
        block={block}
        units={units}
        position={position}
        logged={session.completed.sets.filter((set) =>
          block.entries.some((entry) => entry.id === set.entryId),
        )}
        onEditRound={(entryId, setIndex) => setEditing({ entryId, setIndex })}
      >
        {block.entries.map((entry, index) => (
          <ExerciseCard
            key={entry.id}
            entry={entry}
            block={block}
            units={units}
            position={position}
            logged={session.completed.sets.filter((set) => set.entryId === entry.id)}
            previous={previousPerformance(history, entry.exerciseId)}
            availableEquipment={context.availableEquipment}
            prefix={block.kind === 'superset' ? `A${index + 1}` : `${index + 1}`}
            active={position?.entryId === entry.id}
            badge={prBadge(entry)}
          >
            {loggerFor(entry, block)}
          </ExerciseCard>
        ))}
      </SupersetGroup>
    );
  };

  const selectedExercise = selected ? requireExercise(selected.entry.exerciseId) : null;
  const alternatives =
    selected && selectedExercise
      ? rankAlternatives({
          current: selectedExercise,
          context,
          otherExercises: allEntries(workout.blocks)
            .filter((entry) => entry.id !== selected.entry.id)
            .map((entry) => requireExercise(entry.exerciseId)),
          supersetPartner:
            selected.block.kind === 'superset'
              ? requireExercise(
                  selected.block.entries.find((entry) => entry.id !== selected.entry.id)
                    ?.exerciseId ?? selected.entry.exerciseId,
                )
              : undefined,
          dropSetPlanned: selected.entry.dropSet,
          plannedSets: {
            sets: selected.entry.sets.length,
            restSeconds: selected.entry.restSeconds,
          },
          signals: { preferredIds: preferredIdsOf(profile) },
          limit: 6,
        })
      : null;
  const selectedStarted = selected
    ? session.completed.sets.some((set) => set.entryId === selected.entry.id)
    : false;
  const editActions: EditActions | undefined = selected
    ? {
        canReorder: !selectedStarted,
        inSuperset: selected.block.kind !== 'straight' && !selectedStarted,
        hasWarmup: selected.entry.sets.some(
          (set) => set.kind === 'warmup' && !isDone(selected.entry.id, set.index),
        ),
        onAddSet: () => act({ type: 'sets', entryId: selected.entry.id, workingDelta: 1 }),
        onRemoveSet: () => act({ type: 'sets', entryId: selected.entry.id, workingDelta: -1 }),
        onAddRamp: () => act({ type: 'add-warmup', entryId: selected.entry.id }),
        onSkipWarmup: () => {
          setSelected(null);
          store.skipWarmup(selected.entry.id);
        },
        onRepRange: (reps) => act({ type: 'rep-range', entryId: selected.entry.id, reps }),
        onMoveUp: () => act({ type: 'reorder', entryId: selected.entry.id, direction: 'up' }),
        onMoveDown: () => act({ type: 'reorder', entryId: selected.entry.id, direction: 'down' }),
        onSplit: () => act({ type: 'split-superset', blockId: selected.block.id }),
      }
    : undefined;

  return (
    <>
      <ScreenHeader
        title="Workout"
        intro={paused ? 'Paused. Resume when you are ready.' : 'Log the set in front of you.'}
      />

      <Card tone="accent" eyebrow={paused ? 'Paused' : 'Active workout'} title={workout.title}>
        <div className={styles.stats} data-testid="workout-stats">
          <div className={styles.stat}>
            <span className={styles.statLabel}>Elapsed</span>
            <span className={styles.statValue} data-testid="elapsed-clock">
              {formatClock(elapsed)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Left</span>
            <span className={styles.statValue}>~{remainingMinutes} min</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Sets</span>
            <span className={styles.statValue}>
              {progress.workingDone}/{progress.workingTotal}
            </span>
          </div>
        </div>
        <ProgressBar
          value={progress.workingDone}
          max={progress.workingTotal}
          label="Working sets done"
        />
        <div className={styles.headRow}>
          <DurationSelector
            choice={workout.duration.choice}
            defaultMinutes={session.defaultEstimatedMinutes}
            onChange={(choice) => void store.setDurationChoice(choice)}
            id="active-duration-select"
          />
          <button
            type="button"
            className={styles.pauseButton}
            onClick={() => (paused ? void store.resumeWorkout() : store.pauseWorkout())}
            data-testid="pause-toggle"
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
        {session.lastSummary ? (
          <div className={styles.summary} role="status" data-testid="recalibration-summary">
            <span className={styles.summaryText}>{session.lastSummary.headline}</span>
            <span className={styles.summaryActions}>
              {session.previous ? (
                <button
                  type="button"
                  className={styles.smallButton}
                  onClick={() => store.undoRecalibration()}
                >
                  Undo
                </button>
              ) : null}
              <button
                type="button"
                className={styles.smallButton}
                onClick={() => store.dismissSummary()}
                aria-label="Dismiss summary"
              >
                ✕
              </button>
            </span>
          </div>
        ) : null}
        <button
          type="button"
          className={styles.endEarly}
          onClick={() => {
            setEndedEarly(true);
            setFinishing('rating');
          }}
          data-testid="end-early"
        >
          End workout early
        </button>
      </Card>

      {coach ? (
        <AdaptiveCoachCard card={coach.card} fatigue={coach.fatigue} onAction={onCoachAction} />
      ) : null}

      {session.rest && position ? (
        <RestTimer
          rest={session.rest}
          paused={paused}
          onAdjust={(delta) => store.adjustRest(delta)}
          onSkip={() => store.skipRest()}
        />
      ) : null}

      {currentBlock ? (
        renderBlock(currentBlock)
      ) : (
        <Card tone="accent" eyebrow="All sets done" title="Workout complete">
          <p className={styles.panelNote}>
            Every set is logged. Save the workout to write it to your history and see the summary.
          </p>
          <button
            type="button"
            className={styles.finishButton}
            onClick={() => {
              setEndedEarly(false);
              setFinishing('rating');
            }}
            data-testid="finish-workout"
          >
            Finish workout
          </button>
        </Card>
      )}

      {nextBlock ? (
        <Card eyebrow="Up next" title={nextBlock.label}>
          <p className={styles.panelNote}>
            {nextBlock.entries
              .map((entry) => {
                const first = entry.sets.find((set) => set.kind === 'working');
                return first
                  ? `${requireExercise(entry.exerciseId).name}: ${first.targetReps[0]}-${first.targetReps[1]} reps @ RIR ${first.targetRir}`
                  : requireExercise(entry.exerciseId).name;
              })
              .join(' · ')}
          </p>
        </Card>
      ) : null}

      <details className={styles.listDetails}>
        <summary className={styles.listSummary}>Whole workout</summary>
        <ol className={styles.list} aria-label="Active workout list">
          {workout.blocks.map((block) => {
            const done = block.entries.every((entry) =>
              entry.sets.every((set) => isDone(entry.id, set.index)),
            );
            const current = currentBlock?.id === block.id;
            return (
              <li
                key={block.id}
                className={styles.listRow}
                data-state={done ? 'done' : current ? 'current' : 'upcoming'}
                data-kind={block.kind}
              >
                <button
                  type="button"
                  className={styles.listButton}
                  onClick={() => setSelected({ entry: block.entries[0] as WorkoutEntry, block })}
                >
                  <span className={styles.listLabel}>{block.label}</span>
                  <span className={styles.listMeta}>
                    {done
                      ? 'done'
                      : current
                        ? 'now'
                        : `${block.rounds} ${block.kind === 'straight' ? 'sets' : 'rounds'}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </details>

      <ExerciseDetailSheet
        exercise={selectedExercise}
        onClose={() => setSelected(null)}
        availableEquipment={context.availableEquipment}
        alternatives={alternatives}
        sessionActions={
          selected
            ? {
                pinned: selected.entry.pinned,
                onPin: () =>
                  act({ type: 'pin', entryId: selected.entry.id, pinned: !selected.entry.pinned }),
                onBusy: () => act({ type: 'equipment-busy', entryId: selected.entry.id }),
                onUncomfortable: () => act({ type: 'uncomfortable', entryId: selected.entry.id }),
                onSkip: () => act({ type: 'skip', entryId: selected.entry.id }),
                onPain: (joint) => act({ type: 'pain', entryId: selected.entry.id, joint }),
                onUseAlternative: (exerciseId) =>
                  act({ type: 'replace', entryId: selected.entry.id, exerciseId }),
              }
            : undefined
        }
        editActions={editActions}
      />

      <ReadinessSheet
        key={session.constraints.readiness ? 'set' : 'unset'}
        open={checkingIn}
        initial={session.constraints.readiness}
        onClose={() => setCheckingIn(false)}
        onSubmit={(next) => {
          setCheckingIn(false);
          void store.recalibrate({ type: 'readiness', readiness: next });
        }}
      />

      <RatingSheet
        open={finishing === 'rating'}
        endedEarly={endedEarly}
        onClose={() => setFinishing('idle')}
        onSave={(rating) => void finish(rating)}
      />
    </>
  );
}
