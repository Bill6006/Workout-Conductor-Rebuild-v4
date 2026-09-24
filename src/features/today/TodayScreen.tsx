import { useState } from 'react';
import { routeHref } from '../../app/navigation';
import { getExercise, requireExercise } from '../../catalog/exercises/catalog';
import { useToast } from '../../components/Toast/useToast';
import { AdaptiveCoachCard } from '../../components/AdaptiveCoach/AdaptiveCoachCard';
import { Card } from '../../components/Card/Card';
import { ExerciseDetailSheet } from '../../components/ExerciseDetail/ExerciseDetailSheet';
import { FactList } from '../../components/FactList/FactList';
import { ScreenHeader } from '../../components/Screen/Screen';
import { undoAvailable } from '../../core/state/session';
import { useAppState, useAppSelector, useAppStore } from '../../core/state/useAppStore';
import { formatDayLabel, useNow } from '../../core/time/clock';
import { rankAlternatives } from '../../engine/alternatives/rankAlternatives';
import { buildRankingSignals } from '../../engine/alternatives/signals';
import type { RecalibrationTrigger } from '../../engine/recalibration/types';
import {
  allEntries,
  isStopped,
  planOwnExercise,
  stoppedBefore,
  type WorkoutBlock,
  type WorkoutEntry,
} from '../../engine/workout/types';
import { stoppedNote } from '../../engine/workout/setText';
import type { CoachAction, CoachSignal } from '../../engine/coach/coachConductor';
import { useCoach } from '../coach/useCoach';
import { GOAL_OPTIONS, labelFor, styleLabel } from '../profile/labels';
import { LocationSheet } from './LocationSheet';
import { ReadinessSheet } from './ReadinessSheet';
import { WorkoutPreviewCard } from './WorkoutPreviewCard';
import styles from './TodayScreen.module.css';
import { useTodayWorkout } from './useTodayWorkout';

interface Selection {
  entry: WorkoutEntry;
  block: WorkoutBlock;
}

function clockLabel(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function TodayScreen() {
  const state = useAppState();
  const store = useAppStore();
  const toast = useToast();
  const now = useNow();
  const today = useTodayWorkout();
  const [selected, setSelected] = useState<Selection | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [choosingPlace, setChoosingPlace] = useState(false);
  const coach = useCoach();
  const history = useAppSelector((state) => state.history);
  const coachRoutes = useAppSelector((state) => state.coachRoutes);
  const hasBarcode = useAppSelector((state) =>
    state.barcodes.some((item) => item.locationId === state.profile?.currentLocationId),
  );

  if (!today) {
    return (
      <>
        <ScreenHeader title="Today" intro={formatDayLabel(now)} />
        <Card eyebrow="Setup" title="No profile yet">
          <p className={styles.body}>
            {state.error ?? 'Finish setup to see your workout.'}{' '}
            <a href={routeHref('onboarding')}>Open setup</a>
          </p>
        </Card>
      </>
    );
  }

  const { profile, location, workout, session, defaultEstimatedMinutes, context } = today;
  const selectedExercise = selected ? requireExercise(selected.entry.exerciseId) : null;
  const logged: ReadonlySet<string> = new Set(
    session.completed.sets
      .filter((set) => !set.skipped)
      .map((set) => `${set.entryId}:${set.setIndex}`),
  );
  // A stopped exercise has nothing left to change: its sheet says so in place of its actions.
  const selectedStopped = selected !== null && isStopped(selected.entry);
  const alternatives =
    selected && selectedExercise && !selectedStopped
      ? rankAlternatives({
          current: selectedExercise,
          context,
          // The exercise a stand-in took over from is offered back; swapping to it picks it up.
          otherExercises: allEntries(workout.blocks)
            .filter(
              (entry) =>
                entry.id !== selected.entry.id &&
                !stoppedBefore(workout.blocks, selected.entry).includes(entry),
            )
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
          signals: buildRankingSignals({
            profile,
            history,
            now: new Date().toISOString(),
            sessionPainJoints: session.constraints.painJoints,
            coachRoutes,
            currentExerciseId: selectedExercise.id,
          }),
          limit: 6,
        })
      : null;

  // Every session-only action closes the sheet and runs through the one Recalibration Engine.
  const act = (trigger: RecalibrationTrigger) => {
    setSelected(null);
    if (trigger.type === 'skip') {
      // With logged sets the store trims the exercise instead of asking the engine to remove it.
      void store.skipExercise(trigger.entryId).catch(() => undefined);
      return;
    }
    void store.recalibrate(trigger);
  };

  // Coach actions are taps the user makes; the card never applies anything itself.
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
        window.location.hash = routeHref('settings');
        break;
      case 'finish':
        // The sheet lives on the workout screen: go there and have it open.
        store.requestFinish();
        window.location.hash = routeHref('workout');
        break;
      case 'focus':
        void store.setCoachFocus(action.muscle).then(() => {
          if (!action.route) store.acceptCoachSignal(signal);
        });
        break;
      case 'style':
        // The plan is rebuilt under the new style by the profile save itself.
        void store.setProgramStyle(action.style).catch(() => undefined);
        break;
    }
  };
  const readiness = session.constraints.readiness;

  return (
    <>
      <ScreenHeader title="Today" intro={formatDayLabel(now)} />

      <WorkoutPreviewCard
        workout={workout}
        logged={logged}
        defaultEstimatedMinutes={defaultEstimatedMinutes}
        location={location}
        onChangeLocation={() => setChoosingPlace(true)}
        onSelect={(entry, block) => setSelected({ entry, block })}
        onDurationChange={(choice) => void store.setDurationChoice(choice)}
        summary={session.lastSummary}
        changes={session.lastChanges}
        canUndo={undoAvailable(session)}
        onUndo={() => {
          store.undoRecalibration().catch((error: unknown) => {
            toast.show(error instanceof Error ? error.message : 'Undo could not finish', 'error');
          });
        }}
        onDismissSummary={() => store.dismissSummary()}
        endBy={{
          on: session.constraints.endBy !== null,
          label: clockLabel(session.constraints.endBy),
        }}
        onEndByChange={(on) => void store.setEndBy(on)}
        sessionStatus={session.status}
        onStart={() => {
          if (session.status === 'preview') store.startWorkout();
          window.location.hash = routeHref('workout');
        }}
        onShowBarcode={hasBarcode ? () => store.openBarcodeSheet() : undefined}
      />

      {coach ? (
        <AdaptiveCoachCard
          card={coach.card}
          fatigue={coach.fatigue}
          policy={coach.policy}
          onAction={onCoachAction}
          onDismiss={(signal) => void store.dismissCoachSignal(signal)}
        />
      ) : null}

      <Card eyebrow="Readiness" title={readiness ? 'Checked in for today' : 'Quick check-in'}>
        <p className={styles.body} data-testid="readiness-summary">
          {readiness
            ? `Energy ${readiness.energy}/5 · soreness ${readiness.soreness}/5 · sleep ${readiness.sleep}/5 · motivation ${readiness.motivation}/5${readiness.jointDiscomfort.length ? ` · ${readiness.jointDiscomfort.join(', ')} discomfort` : ''}${readiness.timePressure ? ' · short on time' : ''}.`
            : 'Thirty seconds on energy, soreness, sleep, motivation, joints, and time. The session adjusts instead of cancelling.'}
          {coach ? ` Fatigue ${coach.fatigue.level}: ${coach.fatigue.evidence[0]}` : ''}
        </p>
        <button
          type="button"
          className={styles.link}
          onClick={() => setCheckingIn(true)}
          data-testid="readiness-open"
        >
          {readiness ? 'Update check-in' : 'Check in'}
        </button>
      </Card>

      <LocationSheet open={choosingPlace} onClose={() => setChoosingPlace(false)} />

      <ReadinessSheet
        key={readiness ? 'set' : 'unset'}
        open={checkingIn}
        initial={readiness}
        onClose={() => setCheckingIn(false)}
        onSubmit={(next) => {
          setCheckingIn(false);
          void store.recalibrate({ type: 'readiness', readiness: next });
        }}
      />

      <Card eyebrow="Your profile" title="What the conductor knows">
        <FactList
          items={[
            { label: 'Goal', value: labelFor(GOAL_OPTIONS, profile.goals.primary) },
            { label: 'Style', value: styleLabel(profile) },
            {
              label: 'Schedule',
              value: `${profile.schedule.weeklyFrequency} × ${profile.schedule.typicalDurationMinutes} min per week`,
            },
            { label: 'History', value: `${state.history.length} logged workouts` },
          ]}
        />
        <a className={styles.link} href={routeHref('settings')}>
          Edit in Settings
        </a>
      </Card>

      <ExerciseDetailSheet
        exercise={selectedExercise}
        onClose={() => setSelected(null)}
        availableEquipment={context.availableEquipment}
        alternatives={alternatives}
        stoppedNote={
          selected && selectedStopped
            ? stoppedNote(workout.blocks, selected.entry, logged)
            : undefined
        }
        sessionActions={
          selected && !selectedStopped
            ? {
                pinned: selected.entry.pinned,
                onPin: () =>
                  act({ type: 'pin', entryId: selected.entry.id, pinned: !selected.entry.pinned }),
                onBusy: () => act({ type: 'equipment-busy', entryId: selected.entry.id }),
                onUncomfortable: () => act({ type: 'uncomfortable', entryId: selected.entry.id }),
                onSkip: () => act({ type: 'skip', entryId: selected.entry.id }),
                onPain: (joint) => act({ type: 'pain', entryId: selected.entry.id, joint }),
                onUseAlternative: (exerciseId, keep) => {
                  const entryId = selected.entry.id;
                  setSelected(null);
                  store.swapExercise(entryId, exerciseId, keep).catch((error: unknown) => {
                    toast.show(
                      error instanceof Error ? error.message : 'The swap could not be kept',
                      'error',
                    );
                  });
                },
                keepInPlaceOf: (
                  getExercise(planOwnExercise(workout.blocks, selected.entry)) ??
                  requireExercise(selected.entry.exerciseId)
                ).name,
              }
            : undefined
        }
      />
    </>
  );
}
