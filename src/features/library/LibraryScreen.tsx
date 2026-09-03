import { useState } from 'react';
import { routeHref } from '../../app/navigation';
import {
  EXERCISES,
  customExercises,
  exerciseEquipmentLabel,
  primaryMuscleGroups,
  searchExercises,
} from '../../catalog/exercises/catalog';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  muscleName,
  type MuscleGroup,
} from '../../catalog/muscles/muscles';
import { movementPatternName } from '../../catalog/movementPatterns/movementPatterns';
import { Card } from '../../components/Card/Card';
import { ExerciseDetailSheet } from '../../components/ExerciseDetail/ExerciseDetailSheet';
import { ExerciseThumb } from '../../components/ExerciseDetail/ExerciseMedia';
import formStyles from '../../components/Form/Form.module.css';
import { ScreenHeader } from '../../components/Screen/Screen';
import { useToast } from '../../components/Toast/useToast';
import { useAppState, useAppStore } from '../../core/state/useAppStore';
import { rankAlternatives } from '../../engine/alternatives/rankAlternatives';
import { buildConflictContext, preferredIdsOf } from '../../engine/conflicts/context';
import { checkExerciseFit, isBlocked } from '../../engine/conflicts/conflictEngine';
import { CustomExerciseSheet } from './CustomExerciseSheet';
import styles from './LibraryScreen.module.css';

type GroupFilter = MuscleGroup | 'all';

export function LibraryScreen() {
  const state = useAppState();
  const store = useAppStore();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<GroupFilter>('all');
  const [selected, setSelected] = useState<CatalogExercise | null>(null);
  const [creating, setCreating] = useState(false);
  const customCount = state.customExercises.length;

  const profile = state.profile;
  const location = state.locations.find((candidate) => candidate.id === profile?.currentLocationId);
  const context = profile ? buildConflictContext(profile, location) : null;
  const preferredIds = profile ? preferredIdsOf(profile) : new Set<string>();

  const catalogResults = searchExercises({
    query,
    muscleGroup: group === 'all' ? undefined : group,
  });
  const customMatches = customCount
    ? customExercises().filter(
        (exercise) =>
          (query.trim() === '' ||
            exercise.name.toLowerCase().includes(query.trim().toLowerCase())) &&
          (group === 'all' || primaryMuscleGroups(exercise).includes(group)),
      )
    : [];
  const results = [...customMatches, ...catalogResults];

  const alternatives =
    selected && context
      ? rankAlternatives({ current: selected, context, signals: { preferredIds }, limit: 6 })
      : null;

  async function togglePreference(exercise: CatalogExercise, kind: 'preferred' | 'disliked') {
    if (!profile) return;
    const current = profile.exercisePreferences[kind];
    const other = kind === 'preferred' ? 'disliked' : 'preferred';
    const has = current.some((name) => name.toLowerCase() === exercise.name.toLowerCase());
    const next = has
      ? current.filter((name) => name.toLowerCase() !== exercise.name.toLowerCase())
      : [...current, exercise.name];
    const otherList = profile.exercisePreferences[other].filter(
      (name) => name.toLowerCase() !== exercise.name.toLowerCase(),
    );
    try {
      await store.saveProfile({
        ...profile,
        exercisePreferences: { ...profile.exercisePreferences, [kind]: next, [other]: otherList },
      });
      toast.show(
        has ? `${exercise.name} removed from ${kind}` : `${exercise.name} marked ${kind}`,
        'success',
      );
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not save', 'error');
    }
  }

  return (
    <>
      <ScreenHeader
        title="Exercise library"
        intro={`${EXERCISES.length} exercises with structured metadata. Placeholder diagrams stand in for production demonstrations until Phase 8.`}
      />
      <div className={styles.chipRow}>
        <button
          type="button"
          className={styles.chip}
          onClick={() => setCreating(true)}
          data-testid="add-custom-exercise"
        >
          + Custom exercise{customCount ? ` (${customCount})` : ''}
        </button>
      </div>
      <CustomExerciseSheet open={creating} onClose={() => setCreating(false)} />

      <Card>
        <input
          className={formStyles.input}
          type="search"
          value={query}
          placeholder="Search by name, alias, or muscle"
          aria-label="Search exercises"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className={styles.groups} role="group" aria-label="Muscle group">
          {(['all', ...MUSCLE_GROUPS] as GroupFilter[]).map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={styles.groupChip}
              aria-pressed={group === candidate}
              onClick={() => setGroup(candidate)}
            >
              {candidate === 'all' ? 'All' : MUSCLE_GROUP_LABELS[candidate]}
            </button>
          ))}
        </div>
        <p className={styles.count} data-testid="library-count">
          {results.length} of {EXERCISES.length} exercises
        </p>
        <ul className={styles.list} aria-label="Exercises">
          {results.map((exercise) => {
            const fit = context ? checkExerciseFit(exercise, context) : [];
            const blocked = isBlocked(fit);
            return (
              <li key={exercise.id}>
                <button
                  type="button"
                  className={styles.row}
                  onClick={() => setSelected(exercise)}
                  data-testid="library-row"
                >
                  <ExerciseThumb exercise={exercise} />
                  <span className={styles.rowBody}>
                    <span className={styles.rowName}>
                      {exercise.name}
                      {preferredIds.has(exercise.id) ? (
                        <span className={styles.badge}>Preferred</span>
                      ) : null}
                      {blocked ? (
                        <span className={`${styles.badge} ${styles.badgeWarn}`}>Not here</span>
                      ) : null}
                    </span>
                    <span className={styles.rowMeta}>
                      {exercise.primaryMuscles.map(muscleName).join(', ')} ·{' '}
                      {movementPatternName(exercise.movementPattern)}
                    </span>
                    <span className={styles.rowMeta}>
                      {exerciseEquipmentLabel(exercise, context?.availableEquipment)} ·{' '}
                      {primaryMuscleGroups(exercise)
                        .map((candidate) => MUSCLE_GROUP_LABELS[candidate])
                        .join(' / ')}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {profile ? null : (
          <p className={styles.count}>
            <a href={routeHref('onboarding')}>Finish setup</a> to see what fits your places and
            limits.
          </p>
        )}
      </Card>

      <ExerciseDetailSheet
        exercise={selected}
        onClose={() => setSelected(null)}
        availableEquipment={context?.availableEquipment}
        alternatives={alternatives}
        preference={
          selected && profile
            ? {
                preferred: profile.exercisePreferences.preferred.some(
                  (name) => name.toLowerCase() === selected.name.toLowerCase(),
                ),
                disliked: profile.exercisePreferences.disliked.some(
                  (name) => name.toLowerCase() === selected.name.toLowerCase(),
                ),
                onPrefer: () => void togglePreference(selected, 'preferred'),
                onDislike: () => void togglePreference(selected, 'disliked'),
              }
            : undefined
        }
      />
    </>
  );
}
