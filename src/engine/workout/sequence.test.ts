import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { generateWorkout } from '../workoutGenerator/generate';
import {
  blockSequence,
  currentPosition,
  nextPosition,
  restAfter,
  workoutProgress,
  workoutSequence,
} from './sequence';
import type { WorkoutBlock } from './types';

const NOW = '2026-09-03T14:00:00.000Z';
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const workout = generateWorkout({
  profile: createDefaultProfile(NOW),
  location: gym,
  history: [],
  now: NOW,
  duration: 'default',
});

describe('set sequence', () => {
  it('runs a straight block in set order with warm-ups first', () => {
    const block = workout.blocks[0] as WorkoutBlock;
    const sequence = blockSequence(block);
    expect(sequence.map((item) => item.kind)).toEqual([
      'warmup',
      'warmup',
      'working',
      'working',
      'working',
      'working',
    ]);
    expect(sequence[2]?.ordinal).toBe(1);
    expect(sequence[5]?.ordinal).toBe(4);
  });

  it('runs a superset round by round: A1, A2, rest, and never exposes one member alone', () => {
    const superset = workout.blocks.find((block) => block.kind === 'superset') as WorkoutBlock;
    const sequence = blockSequence(superset);
    const working = sequence.filter((item) => item.kind === 'working');
    const [a, b] = superset.entries.map((entry) => entry.id);
    expect(working.slice(0, 2).map((item) => item.entryId)).toEqual([a, b]);
    expect(working.every((item, index) => item.round === Math.floor(index / 2) + 1)).toBe(true);
    // Within a round: switch without rest; after the round: the block rest.
    expect(restAfter(workout, working[0]!)).toBe(0);
    expect(restAfter(workout, working[1]!)).toBe(superset.restBetweenRoundsSeconds);
    const last = working[working.length - 1]!;
    expect(last.entryId).toBe(b);
    expect(last.round).toBe(superset.rounds);
  });

  it('gives no rest before a drop set and the set rest otherwise', () => {
    const dropEntry = workout.blocks
      .flatMap((block) => block.entries)
      .find((entry) => entry.dropSet);
    expect(dropEntry).toBeDefined();
    const sequence = workoutSequence(workout);
    const beforeDrop = sequence.find(
      (item, index) =>
        item.entryId === dropEntry!.id &&
        item.kind === 'working' &&
        sequence[index + 1]?.kind === 'drop',
    );
    expect(beforeDrop).toBeDefined();
    expect(restAfter(workout, beforeDrop!)).toBe(0);
    const first = sequence[0]!;
    expect(restAfter(workout, first)).toBe(first.set.restSeconds);
  });

  it('tracks the current position, the next set, and progress from logged sets', () => {
    const done = new Set<string>();
    const isDone = (entryId: string, setIndex: number) => done.has(`${entryId}:${setIndex}`);
    const first = currentPosition(workout, isDone);
    expect(first?.entryId).toBe('e1');
    done.add(`${first!.entryId}:${first!.setIndex}`);
    const second = currentPosition(workout, isDone);
    expect(second).toEqual(nextPosition(workout, first!));
    const progress = workoutProgress(workout, isDone);
    expect(progress.done).toBe(1);
    expect(progress.total).toBe(workoutSequence(workout).length);
    expect(progress.entriesDone).toBe(0);
    for (const item of workoutSequence(workout)) done.add(`${item.entryId}:${item.setIndex}`);
    expect(currentPosition(workout, isDone)).toBeNull();
    expect(workoutProgress(workout, isDone).entriesDone).toBe(progress.entriesTotal);
  });
});
