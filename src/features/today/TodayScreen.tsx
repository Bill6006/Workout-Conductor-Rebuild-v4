import { useState } from 'react';
import { routeHref } from '../../app/navigation';
import { requireExercise } from '../../catalog/exercises/catalog';
import { AdaptiveCoachCard } from '../../components/AdaptiveCoach/AdaptiveCoachCard';
import { Card } from '../../components/Card/Card';
import { ExerciseDetailSheet } from '../../components/ExerciseDetail/ExerciseDetailSheet';
import { FactList } from '../../components/FactList/FactList';
import { ScreenHeader } from '../../components/Screen/Screen';
import { useAppState, useAppStore } from '../../core/state/useAppStore';
import { formatDayLabel, useNow } from '../../core/time/clock';
import { rankAlternatives } from '../../engine/alternatives/rankAlternatives';
import { preferredIdsOf } from '../../engine/conflicts/context';
import type { RecalibrationTrigger } from '../../engine/recalibration/types';
import { allEntries, type WorkoutBlock, type WorkoutEntry } from '../../engine/workout/types';
import type { CoachAction } from '../../engine/coach/coachConductor';
import { useCoach } from '../coach/useCoach';
import { GOAL_OPTIONS, STYLE_OPTIONS, labelFor } from '../profile/labels';
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
  const now = useNow();
  const today = useTodayWorkout();
  const [selected, setSelected] = useState<Selection | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const coach = useCoach();

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

  // Every session-only action closes the sheet and runs through the one Recalibration Engine.
  const act = (trigger: RecalibrationTrigger) => {
    setSelected(null);
    void store.recalibrate(trigger);
  };

  // Coach actions are taps the user makes; the card never applies anything itself.
  const onCoachAction = (action: CoachAction) => {
    void store.noteCoachAction(action);
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
        window.location.hash = routeHref('settings');
        break;
    }
  };
  const readiness = session.constraints.readiness;

  return (
    <>
      <ScreenHeader title="Today" intro={formatDayLabel(now)} />

      <WorkoutPreviewCard
        workout={workout}
        defaultEstimatedMinutes={defaultEstimatedMinutes}
        location={location}
        onSelect={(entry, block) => setSelected({ entry, block })}
        onDurationChange={(choice) => void store.setDurationChoice(choice)}
        summary={session.lastSummary}
        changes={session.lastChanges}
        canUndo={session.previous !== null}
        onUndo={() => store.undoRecalibration()}
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
      />

      {coach ? (
        <AdaptiveCoachCard
          card={coach.card}
          fatigue={coach.fatigue}
          policy={coach.policy}
          onAction={onCoachAction}
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
            { label: 'Style', value: labelFor(STYLE_OPTIONS, profile.trainingStyle) },
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
      />
    </>
  );
}
