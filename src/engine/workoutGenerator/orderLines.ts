import { requireExercise } from '../../catalog/exercises/catalog';
import { parsePushLine, pushLine } from '../planning/pushLift';
import {
  allEntries,
  isStopped,
  pushMarkOf,
  type WorkoutBlock,
  type WorkoutEntry,
} from '../workout/types';
import { mainLiftLine, mainLiftName } from './generate';

/** A main-lift line on a lift in the main lift's role, not on a plan built with none in it. */
const STRONG_LINE = / the primary strength lift,? with full rests /;

/**
 * The plan's lines that name its order, made true of the plan on the screen (Maintenance 25): the
 * main lift "leads" only while it comes first, and so does the lift to push (Maintenance 27, item
 * 44). A line never names a lift swapped out, taken out or stopped as the one that leads (the
 * owner, 2026-11-02: a lift swapped on Today was still named). The main lift's line goes to the main
 * lift as a build picks it, among the lifts still to do: the first in the main lift's role, never
 * the week's extra; in a plan built with none in that role (a catch-up, a second workout), the first
 * lift. A main lift stopped keeps its line while nothing else carries that work, since it is still
 * the day's. The lift to push's line shows only while its lift is still to do.
 *
 * In the plan as saved (`saved`), a line with no lift to name is kept as it was, so a swap back
 * finds it again (Maintenance 25; the review); the screen leaves it out.
 */
export function withOrderLines(
  reasons: readonly string[],
  blocks: readonly WorkoutBlock[],
  saved = false,
): string[] {
  const entries = allEntries(blocks);
  const inPlan = entries.filter((entry) => !isStopped(entry));
  const first = inPlan[0];
  const nameOf = (entry: WorkoutEntry) => requireExercise(entry.exerciseId).name;
  // The main lift as the build picks it (`generateWorkout`'s anchor), among the lifts still to do.
  const strong = inPlan.find((entry) => entry.role === 'primary-strength' && entry.push !== 'extra');
  return reasons.flatMap((line) => {
    const named = mainLiftName(line);
    if (named !== null) {
      const own = inPlan.find((entry) => nameOf(entry) === named);
      if (own) return [mainLiftLine(named, own.role, own === first)];
      const main = STRONG_LINE.test(line) ? strong : first;
      // One line on the main lift: never a second naming the same lift.
      if (main && !reasons.some((other) => mainLiftName(other) === nameOf(main))) {
        return [mainLiftLine(nameOf(main), main.role, main === first)];
      }
      const stopped = !main && entries.some((entry) => nameOf(entry) === named);
      return stopped || saved ? [line] : [];
    }
    const pushed = parsePushLine(line);
    if (!pushed) return [line];
    const lift = inPlan.find(
      (entry) => pushMarkOf(entry) !== undefined && nameOf(entry) === pushed.name,
    );
    if (lift) {
      return [pushLine(pushed.name, pushed.target, pushed.extra, lift === first, pushed.heavy)];
    }
    return saved ? [line] : [];
  });
}
