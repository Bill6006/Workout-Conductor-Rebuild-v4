import { useEffect, useState } from 'react';
import { requireExercise } from '../../catalog/exercises/catalog';
import { AdaptiveCoachCard } from '../../components/AdaptiveCoach/AdaptiveCoachCard';
import { restSounds } from '../../core/alerts/restSounds';
import { Button } from '../../components/Button/Button';
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
import { Sheet } from '../../components/Sheet/Sheet';
import { SupersetGroup } from '../../components/SupersetGroup/SupersetGroup';
import { useToast } from '../../components/Toast/useToast';
import { explainSaveFailure } from '../../core/storage/explainSaveFailure';
import { doneKeys, elapsedSeconds, type WorkoutSession } from '../../core/state/session';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import { useTicker } from '../../core/time/useTicker';
import type { UnitSystem } from '../../core/validation/profile';
import type { SessionRating } from '../../core/validation/workoutRecord';
import { rankAlternatives } from '../../engine/alternatives/rankAlternatives';
import { buildRankingSignals } from '../../engine/alternatives/signals';
import { liveSetRecords } from '../../engine/scoring/personalRecords';
import type { CoachAction, CoachSignal } from '../../engine/coach/coachConductor';
import { useCoach } from '../coach/useCoach';
import { ReadinessSheet } from '../today/ReadinessSheet';
import { estimateWorkout } from '../../engine/duration/duration';
import { plateMath } from '../../engine/plateMath/plateMath';
import { dropSetWeight } from '../../engine/recalibration/dropSet';
import { fitWeight, loadingFor, loadingKeyFor, specFor } from '../../engine/loading/loading';
import { maxPromptHidden } from '../../engine/progression/maxes';
import { startRatio } from '../../engine/progression/startingLoad';
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
import { describeSetPosition } from './setFormat';
import { RatingSheet } from './RatingSheet';
import { MaxSheet } from './MaxSheet';
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

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function roundTo(value: number, step: number): number {
  return Math.max(0, Math.round(value / step) * step);
}

/**
 * Prefilled logger values. Ramp and drop sets carry loads the engine already
 * scaled, so they prefill as prescribed; only a set with no target falls back
 * to a fraction of the last working weight. A working set follows the last
 * logged working set of this exercise, else the target, else last time.
 */
function initialFor(
  session: WorkoutSession,
  entry: WorkoutEntry,
  set: SetPrescription,
  previousWeight: number | null,
  step: number,
  workingLogged: boolean,
): SetLoggerValues {
  const draft = workingLogged ? session.drafts[entry.id] : undefined;
  if (set.kind === 'warmup' || set.kind === 'drop') {
    const rir = set.kind === 'warmup' ? 5 : 0;
    if (set.targetWeight !== null) {
      return { weight: set.targetWeight, reps: set.targetReps[1], rir };
    }
    const base = draft?.weight ?? previousWeight;
    return {
      weight:
        base === null || base === undefined
          ? null
          : set.kind === 'warmup'
            ? roundTo(base * 0.6, step)
            : dropSetWeight(base, step),
      reps: set.targetReps[1],
      rir,
    };
  }
  const base = draft?.weight ?? set.targetWeight ?? previousWeight;
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
  const workoutCount = useAppSelector((state) => state.workoutCount);
  // The logging habit line: shown under a working set until any weight has been logged.
  const anyWeights = history.some((record) =>
    record.entries.some((entry) => entry.sets.some((set) => set.weight !== null)),
  );
  const instructions = useAppSelector((state) => state.customInstructions);
  const locations = useAppSelector((state) => state.locations);
  const currentLocation = locations.find((place) => place.id === profile?.currentLocationId);
  const calibrating = useAppSelector((state) => state.calibration.status !== 'idle');
  const soundsOn = useAppSelector((state) => state.localSettings.restSounds);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  // Today can ask for the end-of-workout sheet; it opens here and the request is cleared.
  const [finishing, setFinishing] = useState<'idle' | 'rating' | 'discard'>(() =>
    store.getSnapshot().finishRequested ? 'rating' : 'idle',
  );
  useEffect(() => {
    store.clearFinishRequest();
  }, [store]);
  // A workout ended from the coach's card is ended early, exactly like the End workout early link.
  const [endedEarly, setEndedEarly] = useState(() => store.getSnapshot().finishRequested);
  const [checkingIn, setCheckingIn] = useState(false);
  const [maxFor, setMaxFor] = useState<Selection | null>(null);
  // The one-time offer can be snoozed; the same sheet opened from Options cannot.
  const [maxOffer, setMaxOffer] = useState(true);
  const coach = useCoach();
  const coachRoutes = useAppSelector((state) => state.coachRoutes);
  const strengthMaxes = useAppSelector((state) => state.strengthMaxes);
  /** Weight currently shown in a logger, so Plate Math follows it before the set is logged. */
  const [liveWeights, setLiveWeights] = useState<Record<string, number | null>>({});
  /** A block opened from the Whole workout list, to edit its sets; null shows the current one. */
  const [viewingBlockId, setViewingBlockId] = useState<string | null>(null);
  /** Why the last save did not go through, in plain words; the session stays until it does. */
  const [saveProblem, setSaveProblem] = useState<string | null>(null);
  /** A tap on the target line asks the Plates panel of that exercise to open. */
  const [platesRequest, setPlatesRequest] = useState<{ entryId: string; at: number } | null>(null);
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
  const viewingBlock =
    viewingBlockId !== null && viewingBlockId !== currentBlock?.id
      ? (workout.blocks.find((block) => block.id === viewingBlockId) ?? null)
      : null;
  const nextBlock = currentBlock
    ? workout.blocks[workout.blocks.indexOf(currentBlock) + 1]
    : undefined;
  const lastLogged = session.completed.sets[session.completed.sets.length - 1];
  const undoable =
    lastLogged && !lastLogged.skipped
      ? { entryId: lastLogged.entryId, setIndex: lastLogged.setIndex }
      : null;
  const paused = session.status === 'paused';

  // A lift held at the heaviest weight here ranks variations that stay heavy with what you have.
  const capLimitedFor = (entry: WorkoutEntry, exercise: ReturnType<typeof requireExercise>) => {
    if (!entry.progression?.capped) return undefined;
    const ratio = startRatio(exercise);
    return ratio === null ? undefined : { currentRatio: ratio };
  };

  // Skip today has nothing to do once every set is logged; the button says so instead of failing.
  const skipReasonFor = (entry: WorkoutEntry) =>
    entry.sets.every((set) => isDone(entry.id, set.index))
      ? 'Every set is logged. Edit a set from its row instead.'
      : null;

  const act = (trigger: RecalibrationTrigger) => {
    setSelected(null);
    if (trigger.type === 'skip') {
      // With logged sets the store trims the exercise instead of asking the engine to remove it.
      void store.skipExercise(trigger.entryId).then(
        (result) => {
          if (result.kind === 'trimmed') {
            toast.show(
              `Skipped the rest of ${result.name}: ${result.skippedSets} ${result.skippedSets === 1 ? 'set' : 'sets'} marked skipped. Tap a set to change it.`,
              'success',
            );
          }
        },
        (error: unknown) => {
          toast.show(error instanceof Error ? error.message : 'Could not skip', 'error');
        },
      );
      return;
    }
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

  // The one-time max offer: a lift without its own history, nothing logged yet, not declined.
  const knowMaxFor = (entry: WorkoutEntry, block: WorkoutBlock) => {
    const mode = entry.progression?.mode;
    if (mode !== 'start' && mode !== 'estimate' && mode !== 'return') return undefined;
    if (startRatio(requireExercise(entry.exerciseId)) === null) return undefined;
    const logged = session.completed.sets.some(
      (set) => set.entryId === entry.id && set.kind === 'working' && !set.skipped,
    );
    if (logged) return undefined;
    if (maxPromptHidden(strengthMaxes, entry.exerciseId, new Date().toISOString())) {
      return undefined;
    }
    return () => {
      setMaxOffer(true);
      setMaxFor({ entry, block });
    };
  };

  const onCoachAction = (action: CoachAction, signal: CoachSignal) => {
    void store.noteCoachAction(action);
    switch (action.kind) {
      case 'recalibrate':
        // Once the change lands the offer is marked as taken, so the same button never comes back.
        void store.recalibrate(action.trigger).then((result) => {
          // A route step keeps its own record (it reads as applied); everything else is marked here.
          if (result?.ok && !action.route) store.acceptCoachSignal(signal);
        });
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
      case 'finish':
        setEndedEarly(true);
        setFinishing('rating');
        break;
      case 'focus':
        void store.setCoachFocus(action.muscle).then(() => {
          if (!action.route) store.acceptCoachSignal(signal);
        });
        break;
    }
  };

  const commitLog = (entry: WorkoutEntry, set: SetPrescription, values: SetLoggerValues) => {
    // The tap that starts a rest is what lets the browser play the rest's sounds.
    if (soundsOn) restSounds.unlock();
    // The dial's live value belongs to the set just logged; the next set starts from its own rule.
    setLiveWeights((current) => withoutKey(current, entry.id));
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
    setSaveProblem(null);
    try {
      await store.finishWorkout(rating, { endedEarly });
    } catch (error) {
      // Said on the screen in plain words, and it stays there until the next attempt.
      setSaveProblem(explainSaveFailure(error));
    }
  };

  const loggerFor = (entry: WorkoutEntry, block: WorkoutBlock) => {
    const exercise = requireExercise(entry.exerciseId);
    // What this place can load for the exercise today: the dial's step, its list, its plates.
    const loading = loadingFor(currentLocation?.loading, session.loading, exercise, units);
    const step = loading.step;
    const previous = previousPerformance(history, entry.exerciseId);
    const logged = session.completed.sets.filter((set) => set.entryId === entry.id);
    const editingHere = editing && editing.entryId === entry.id ? editing : null;
    const editingSet = editingHere
      ? entry.sets.find((set) => set.index === editingHere.setIndex)
      : undefined;
    const currentHere = position && position.entryId === entry.id ? position : null;
    const workingLogged = logged.some((set) => set.kind === 'working' && !set.skipped);
    // One rule for the dial and the plate line: the dial's own starting value, or the weight
    // the dial has been turned to, or, with no set in front of you, the last working weight
    // logged here. A warm-up's draft never reaches a working set.
    const dialRaw = currentHere
      ? initialFor(session, entry, currentHere.set, previous?.weight ?? null, step, workingLogged)
      : null;
    // A weight derived here rather than written by the engine lands on what the place can load.
    const dial =
      dialRaw && dialRaw.weight !== null && currentHere?.set.targetWeight === null
        ? { ...dialRaw, weight: fitWeight(dialRaw.weight, loading) }
        : dialRaw;
    const lastWorkingWeight =
      [...logged]
        .filter((set) => set.kind === 'working' && !set.skipped && set.weight !== null)
        .sort((a, b) => a.setIndex - b.setIndex)
        .map((set) => set.weight)
        .pop() ?? null;
    const draftWeight =
      editingHere && editingSet
        ? loggedValues(session, entry.id, editingSet.index).weight
        : (liveWeights[entry.id] ??
          dial?.weight ??
          lastWorkingWeight ??
          // An exercise being looked at, not worked: its planned working weight.
          entry.sets.find((set) => set.kind === 'working')?.targetWeight ??
          null);
    const helper =
      draftWeight !== null && draftWeight !== undefined && draftWeight > 0
        ? plateMath(exercise, draftWeight, units, loading.perSide ?? undefined).line
        : null;

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
              label: describeSetPosition(editingSet, entry),
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
              key={`log-${entry.id}-${currentHere.setIndex}-${currentHere.set.targetWeight ?? 'none'}`}
              units={units}
              target={{
                kind: currentHere.kind,
                reps: currentHere.set.targetReps,
                rir: currentHere.set.targetRir,
                weight: currentHere.set.targetWeight,
                label: describeSetPosition(currentHere.set, entry),
              }}
              initial={
                dial ??
                initialFor(
                  session,
                  entry,
                  currentHere.set,
                  previous?.weight ?? null,
                  step,
                  workingLogged,
                )
              }
              available={loading.available}
              onWeightHintTap={() => setPlatesRequest({ entryId: entry.id, at: Date.now() })}
              mode="log"
              weightStep={step}
              onCommit={(values) => commitLog(entry, currentHere.set, values)}
              disabled={calibrating}
              helper={helper}
              weightHint={
                currentHere.set.targetWeight === null &&
                (exercise.load === 'bodyweight' || exercise.load === 'band')
                  ? exercise.load === 'band'
                    ? 'Band tension'
                    : 'Bodyweight'
                  : undefined
              }
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
                  Skip warm-up sets
                </button>
                <span className={styles.panelNote}>Ramp sets never count as working sets.</span>
              </div>
            ) : null}
            {currentHere.kind === 'working' && !anyWeights && workoutCount > 0 ? (
              <p className={styles.panelNote} data-testid="logging-note">
                No weights logged yet. Targets follow your last logged load.
              </p>
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
          loading={loading}
          spec={specFor(currentLocation?.loading, exercise)}
          placeName={currentLocation?.name ?? 'this place'}
          missingPlates={session.loading.missingPlates}
          onSaveLoading={(spec) =>
            currentLocation
              ? store.saveLoading(currentLocation.id, loadingKeyFor(exercise), spec)
              : Promise.reject(new Error('Pick a place on Today first.'))
          }
          onSetMissingPlates={(plates) => store.setMissingPlates(plates)}
          openRequest={
            platesRequest?.entryId === entry.id ? { panel: 'plates', at: platesRequest.at } : null
          }
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
          onShowDetail={() => setSelected({ entry, block })}
          onKnowMax={knowMaxFor(entry, block)}
          restStyle={profile.restStyle}
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
            onShowDetail={() => setSelected({ entry, block })}
            onKnowMax={knowMaxFor(entry, block)}
            restStyle={profile.restStyle}
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
          signals: {
            ...buildRankingSignals({
              profile,
              history,
              now: new Date().toISOString(),
              sessionPainJoints: session.constraints.painJoints,
              coachRoutes,
              currentExerciseId: selectedExercise.id,
            }),
            capLimited: capLimitedFor(selected.entry, selectedExercise),
          },
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
        <AdaptiveCoachCard
          card={coach.card}
          fatigue={coach.fatigue}
          policy={coach.policy}
          onAction={onCoachAction}
          onDismiss={(signal) => void store.dismissCoachSignal(signal)}
        />
      ) : null}

      {session.rest && position ? (
        <RestTimer
          rest={session.rest}
          paused={paused}
          onAdjust={(delta) => store.adjustRest(delta)}
          onSkip={() => store.skipRest()}
        />
      ) : null}

      {saveProblem ? (
        <div className={styles.summary} role="alert" data-testid="save-problem">
          <p className={styles.summaryText}>{saveProblem}</p>
          <div className={styles.summaryActions}>
            <button
              type="button"
              className={styles.smallButton}
              onClick={() => {
                setSaveProblem(null);
                setFinishing('rating');
              }}
              data-testid="save-retry"
            >
              Try again
            </button>
            <button
              type="button"
              className={styles.smallButton}
              onClick={() => setSaveProblem(null)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      {viewingBlock ? (
        <>
          <p className={styles.panelNote} data-testid="viewing-note">
            Viewing {viewingBlock.label}.{' '}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => setViewingBlockId(null)}
              data-testid="back-to-current"
            >
              Back to the current set
            </button>
          </p>
          {renderBlock(viewingBlock)}
        </>
      ) : null}

      {currentBlock ? (
        viewingBlock ? null : (
          renderBlock(currentBlock)
        )
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
                  aria-pressed={viewingBlockId === block.id}
                  onClick={() => setViewingBlockId(current ? null : block.id)}
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
                skipDisabledReason: skipReasonFor(selected.entry),
                onPain: (joint) => act({ type: 'pain', entryId: selected.entry.id, joint }),
                onUseAlternative: (exerciseId) =>
                  act({ type: 'replace', entryId: selected.entry.id, exerciseId }),
              }
            : undefined
        }
        editActions={editActions}
        maxAction={
          selected && selectedExercise && startRatio(selectedExercise) !== null
            ? {
                line: (() => {
                  const saved = strengthMaxes.maxes[selectedExercise.id];
                  return saved
                    ? `${Math.round(saved.e1rm)} ${saved.units}, entered ${new Date(saved.enteredAt).toLocaleDateString()}.`
                    : 'None entered. The target comes from your logged sets.';
                })(),
                label: strengthMaxes.maxes[selectedExercise.id]
                  ? 'Update your max'
                  : 'Enter your max',
                onOpen: () => {
                  setMaxOffer(false);
                  setMaxFor(selected);
                  setSelected(null);
                },
              }
            : undefined
        }
      />

      {maxFor ? (
        <MaxSheet
          key={maxFor.entry.id}
          exercise={requireExercise(maxFor.entry.exerciseId)}
          entry={maxFor.entry}
          units={units}
          open
          offer={maxOffer}
          onClose={() => setMaxFor(null)}
        />
      ) : null}

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
        onDiscard={() => setFinishing('discard')}
      />
      <Sheet
        open={finishing === 'discard'}
        title="Discard this workout?"
        onClose={() => setFinishing('rating')}
        footer={
          <div className={styles.ratingActions}>
            <Button
              variant="secondary"
              onClick={() => setFinishing('rating')}
              data-testid="discard-cancel"
            >
              Keep workout
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setFinishing('idle');
                store.discardWorkout();
                toast.show('Workout discarded · nothing was saved', 'success');
              }}
              data-testid="discard-confirm"
            >
              Discard workout
            </Button>
          </div>
        }
      >
        <p className={styles.panelNote}>
          Nothing from this session will be saved: no sets, no records, no progress. This cannot be
          undone.
        </p>
      </Sheet>
    </>
  );
}
