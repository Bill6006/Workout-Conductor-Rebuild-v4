import { useState } from 'react';
import { routeHref } from '../../app/navigation';
import { requireExercise } from '../../catalog/exercises/catalog';
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
import { GOAL_OPTIONS, STYLE_OPTIONS, labelFor } from '../profile/labels';
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
      />

      <Card eyebrow="Readiness" title="Quick check-in arrives in Phase 6">
        <p className={styles.body}>
          The recalibration engine already turns energy, soreness, sleep, joint discomfort, and time
          pressure into fewer sets, more reps in reserve, gentler picks, or a shorter session. The
          check-in screen that feeds it arrives with the adaptive coach.
        </p>
      </Card>

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
