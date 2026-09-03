import { useState } from 'react';
import { routeHref } from '../../app/navigation';
import { Card } from '../../components/Card/Card';
import { ExerciseDetailSheet } from '../../components/ExerciseDetail/ExerciseDetailSheet';
import { FactList } from '../../components/FactList/FactList';
import { ScreenHeader } from '../../components/Screen/Screen';
import { useAppState } from '../../core/state/useAppStore';
import { formatDayLabel, useNow } from '../../core/time/clock';
import { rankAlternatives } from '../../engine/alternatives/rankAlternatives';
import { buildConflictContext, preferredIdsOf } from '../../engine/conflicts/context';
import { GOAL_OPTIONS, STYLE_OPTIONS, labelFor } from '../profile/labels';
import { DemoWorkoutCard } from './DemoWorkoutCard';
import { buildDemoWorkout, type DemoExercise } from './demo/demoWorkout';
import styles from './TodayScreen.module.css';

export function TodayScreen() {
  const state = useAppState();
  const now = useNow();
  const [selected, setSelected] = useState<DemoExercise | null>(null);
  const profile = state.profile;

  if (!profile) {
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

  const location = state.locations.find((candidate) => candidate.id === profile.currentLocationId);
  const workout = buildDemoWorkout(profile, location);
  const context = buildConflictContext(profile, location);

  const alternatives = selected
    ? rankAlternatives({
        current: selected.exercise,
        context,
        otherExercises: workout.exercises
          .filter((entry) => entry.exercise.id !== selected.exercise.id)
          .map((entry) => entry.exercise),
        supersetPartner: selected.superset
          ? workout.exercises.find(
              (entry) => entry.superset && entry.superset !== selected.superset,
            )?.exercise
          : undefined,
        dropSetPlanned: selected.dropSet,
        plannedSets: { sets: selected.sets, restSeconds: selected.restSeconds },
        signals: { preferredIds: preferredIdsOf(profile) },
        limit: 6,
      })
    : null;

  return (
    <>
      <ScreenHeader title="Today" intro={formatDayLabel(now)} />

      <DemoWorkoutCard workout={workout} location={location} onSelect={setSelected} />

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
            { label: 'Units', value: profile.units },
          ]}
        />
        <a className={styles.link} href={routeHref('settings')}>
          Edit in Settings
        </a>
      </Card>

      <ExerciseDetailSheet
        exercise={selected?.exercise ?? null}
        onClose={() => setSelected(null)}
        availableEquipment={context.availableEquipment}
        alternatives={alternatives}
      />
    </>
  );
}
