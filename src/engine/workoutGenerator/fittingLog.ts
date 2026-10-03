import type { WorkoutBlock } from '../workout/types';

/**
 * The steps that fitted a plan to its length, as "Why this workout" lists them (Maintenance 25).
 * The fit runs in passes: it shortens rests a notch at a time and trims one set at a time, so the
 * same step can happen again and again. Each step has a key; a step whose key is already logged
 * counts once more on its own line, where it first happened, instead of adding another line, so
 * the list says each step once. The steps stay in the order the fit took them: a set trimmed can
 * be given back later, or its lift left out, and both steps are said.
 */
export class FittingLog {
  private readonly steps: { key: string; count: number; line: (count: number) => string }[] = [];

  /** Logs a step. `line` words it for the number of times it happened; by default the key is the line. */
  add(key: string, line: (count: number) => string = () => key): void {
    const logged = this.steps.find((step) => step.key === key);
    if (logged) logged.count += 1;
    else this.steps.push({ key, count: 1, line });
  }

  /** How many different steps were logged. */
  get size(): number {
    return this.steps.length;
  }

  lines(): string[] {
    return this.steps.map((step) => step.line(step.count));
  }
}

/** "Trimmed one set from X." or "Trimmed 2 sets from X." */
export function trimmedLine(name: string): (count: number) => string {
  return (count) =>
    count === 1 ? `Trimmed one set from ${name}.` : `Trimmed ${count} sets from ${name}.`;
}

/** "Gave X back a set: the minutes left fit it." or "Gave X back 2 sets: the minutes left fit them." */
export function gaveBackLine(name: string): (count: number) => string {
  return (count) =>
    count === 1
      ? `Gave ${name} back a set: the minutes left fit it.`
      : `Gave ${name} back ${count} sets: the minutes left fit them.`;
}

export const SHORTENED_RESTS = 'Shortened rests toward the realistic minimum.';

const TRIMMED = /^Trimmed (?:one set|(\d+) sets) from (.+)\.$/;
const GAVE_BACK = /^Gave (.+) back (?:a set|(\d+) sets): the minutes left fit (?:it|them)\.$/;

/**
 * A plan's fitting steps as stored before the log merged them (Maintenance 25): a plan saved or
 * kept from then said "Shortened rests toward the realistic minimum." once per pass and "Trimmed
 * one set from X." once per set. Read back, they are merged as the log merges them now; merging
 * steps already merged changes nothing.
 */
export function stepsOnce(steps: readonly string[]): string[] {
  const log = new FittingLog();
  for (const step of steps) {
    const trimmed = TRIMMED.exec(step);
    const gave = GAVE_BACK.exec(step);
    if (trimmed?.[2] !== undefined) {
      const name = trimmed[2];
      for (let at = 0; at < Number(trimmed[1] ?? 1); at += 1) {
        log.add(`trimmed|${name}`, trimmedLine(name));
      }
    } else if (gave?.[1] !== undefined) {
      const name = gave[1];
      for (let at = 0; at < Number(gave[2] ?? 1); at += 1) {
        log.add(`gave back|${name}`, gaveBackLine(name));
      }
    } else {
      log.add(step);
    }
  }
  return log.lines();
}

/**
 * A stored plan's lines each said once: its fitting steps merged, and no reason, compromise or line
 * of a lift's "Why this target" said twice (the empty bar named for each step, before Maintenance
 * 25).
 */
export function explanationOnce<
  T extends {
    explanation: { reasons: string[]; fittingSteps: string[] };
    compromises: string[];
    blocks?: readonly WorkoutBlock[];
  },
>(workout: T): T {
  return {
    ...workout,
    ...(workout.blocks
      ? {
          blocks: workout.blocks.map((block) => ({
            ...block,
            entries: block.entries.map((entry) =>
              entry.progression
                ? {
                    ...entry,
                    progression: {
                      ...entry.progression,
                      evidence: [...new Set(entry.progression.evidence)],
                    },
                  }
                : entry,
            ),
          })),
        }
      : {}),
    explanation: {
      ...workout.explanation,
      reasons: [...new Set(workout.explanation.reasons)],
      fittingSteps: stepsOnce(workout.explanation.fittingSteps),
    },
    compromises: [...new Set(workout.compromises)],
  };
}
