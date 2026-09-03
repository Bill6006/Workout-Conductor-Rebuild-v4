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
import { allEntries, type WorkoutBlock, type WorkoutEntry } from '../../engine/workout/types';
import { GOAL_OPTIONS, STYLE_OPTIONS, labelFor } from '../profile/labels';
import { WorkoutPreviewCard } from './WorkoutPreviewCard';
import styles from './TodayScreen.module.css';
import { useTodayWorkout } from './useTodayWorkout';

interface Selection {
  entry: WorkoutEntry;
  block: WorkoutBlock;
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

  const { profile, location, workout, defaultEstimatedMinutes, context } = today;
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

  return (
    <>
      <ScreenHeader title="Today" intro={formatDayLabel(now)} />

      <WorkoutPreviewCard
        workout={workout}
        defaultEstimatedMinutes={defaultEstimatedMinutes}
        location={location}
        onSelect={(entry, block) => setSelected({ entry, block })}
        onDurationChange={(choice) => store.setDurationChoice(choice)}
      />

      <Card eyebrow="Readiness" title="Quick check-in arrives in Phase 6">
        <p className={styles.body}>
          Energy, soreness, sleep, joint discomfort, and time pressure will adjust the session
          instead of cancelling it.
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
      />
    </>
  );
}
