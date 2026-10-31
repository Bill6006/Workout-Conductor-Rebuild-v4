import { describe, expect, it } from 'vitest';
import { localWeekKey } from '../../core/time/localDate';
import {
  emptyTimeOffers,
  parseTimeOffers,
  type LongerAnswer,
  type TimeOffers,
} from '../../core/validation/timeOffers';
import {
  longerPausedUntil,
  mayShowLonger,
  mergeTimeOffers,
  resolvePending,
  skippedThisWeek,
  timePattern,
  withAnswer,
  withShown,
} from './timeAnswers';

/**
 * Maintenance 34: what "Longer would help" learns from its answers (the owner, 2026-10-31): taken
 * and trained longer, the time was there; "Not now", the shorter session chosen; a pattern over time,
 * never one answer; and the suggestion's cooldowns. Every time is a clock time on this device.
 * Synthetic data only.
 */

const at = (day: number, hour = 12) => new Date(2026, 9, day, hour).toISOString();
const NOW = at(31);

function answered(...answers: [day: number, answer: LongerAnswer][]): TimeOffers {
  return answers.reduce(
    (record, [day, answer]) =>
      withAnswer(record, {
        at: at(day),
        week: localWeekKey(at(day)),
        muscles: ['chest'],
        from: 30,
        to: 45,
        answer,
      }),
    emptyTimeOffers(),
  );
}

describe('the pattern of the answers', () => {
  it('needs two answers of a kind: one never makes a pattern', () => {
    expect(timePattern(answered([29, 'not-now']), NOW)).toBeNull();
    expect(timePattern(answered([29, 'longer']), NOW)).toBeNull();
    expect(timePattern(answered([28, 'longer'], [29, 'same']), NOW)).toBeNull();
  });

  it('reads two "Not now" as choosing the shorter session', () => {
    expect(timePattern(answered([27, 'not-now'], [29, 'not-now']), NOW)?.pattern).toBe(
      'chooses-short',
    );
  });

  it('reads taken and trained longer as time there, taken and not as time running short', () => {
    expect(timePattern(answered([27, 'longer'], [29, 'longer']), NOW)?.pattern).toBe('has-time');
    expect(timePattern(answered([27, 'same'], [29, 'same']), NOW)?.pattern).toBe('limited');
  });

  it('reads only the latest four answers, and a tie as the newer kind', () => {
    // Five answers: the oldest "Not now" falls out; two "longer" and two "same" tie, the newer wins.
    const record = answered(
      [20, 'not-now'],
      [22, 'longer'],
      [24, 'same'],
      [26, 'longer'],
      [28, 'same'],
    );
    expect(timePattern(record, NOW)?.pattern).toBe('limited');
  });

  it('reads only the last eight weeks', () => {
    const old = new Date(2026, 7, 20, 12).toISOString();
    const record = withAnswer(answered([29, 'not-now']), {
      at: old,
      week: localWeekKey(old),
      muscles: ['chest'],
      from: 30,
      to: 45,
      answer: 'not-now',
    });
    expect(timePattern(record, NOW)).toBeNull();
  });
});

describe('the suggestion rests on a pattern', () => {
  it('two weeks after choosing the shorter session, four after the time ran short', () => {
    const chosen = answered([27, 'not-now'], [29, 'not-now']);
    expect(longerPausedUntil(chosen, NOW)).toBe(
      new Date(Date.parse(at(29)) + 14 * 86_400_000).toISOString(),
    );
    expect(mayShowLonger(chosen, NOW)).toBe(false);
    const limited = answered([27, 'same'], [29, 'same']);
    expect(longerPausedUntil(limited, NOW)).toBe(
      new Date(Date.parse(at(29)) + 28 * 86_400_000).toISOString(),
    );
    // The time there rests nothing.
    expect(longerPausedUntil(answered([27, 'longer'], [29, 'longer']), NOW)).toBeNull();
  });

  it('comes back once the rest is over', () => {
    const chosen = answered([1, 'not-now'], [3, 'not-now']);
    expect(longerPausedUntil(chosen, at(18))).toBeNull();
    expect(mayShowLonger(chosen, at(18))).toBe(true);
  });
});

describe('the cooldowns', () => {
  it('show it on one day at most, all that day, and on two days in seven', () => {
    let record = emptyTimeOffers();
    expect(mayShowLonger(record, at(26))).toBe(true);
    record = withShown(record, at(26, 9));
    expect(mayShowLonger(record, at(26, 18))).toBe(true);
    record = withShown(record, at(28, 9));
    expect(mayShowLonger(record, at(29))).toBe(false);
    // A week after the first showing, one of the two has fallen out.
    expect(mayShowLonger(record, at(26 + 7, 10))).toBe(true);
  });

  it('keep one showing a day', () => {
    const record = withShown(withShown(emptyTimeOffers(), at(26, 9)), at(26, 20));
    expect(record.shown).toEqual([at(26, 9)]);
  });

  it('skip a muscle "Not now" was said to until the week ends', () => {
    const record = answered([28, 'not-now']);
    expect([...skippedThisWeek(record, at(29))]).toEqual(['chest']);
    // October 28, 2026 is a Wednesday: the next Monday is November 2.
    expect([...skippedThisWeek(record, new Date(2026, 10, 2, 12).toISOString())]).toEqual([]);
  });
});

describe('a suggestion taken, answered at the workout’s end', () => {
  const taken: TimeOffers = {
    ...emptyTimeOffers(),
    pending: {
      at: at(30, 8),
      week: localWeekKey(at(30)),
      muscles: ['chest'],
      from: 30,
      to: 45,
      choice: 45,
    },
  };

  it('says the time was there past halfway to the length taken', () => {
    const record = resolvePending(taken, { at: at(30, 9), trainedMinutes: 40, chosenMinutes: 45 });
    expect(record.pending).toBeNull();
    expect(record.answers.map((answer) => answer.answer)).toEqual(['longer']);
  });

  it('says the time ran short under halfway', () => {
    const record = resolvePending(taken, { at: at(30, 9), trainedMinutes: 34, chosenMinutes: 45 });
    expect(record.answers.map((answer) => answer.answer)).toEqual(['same']);
  });

  it('says the shorter session was chosen after all where the length went back down', () => {
    const record = resolvePending(taken, { at: at(30, 9), trainedMinutes: 30, chosenMinutes: 30 });
    expect(record.answers.map((answer) => answer.answer)).toEqual(['not-now']);
  });

  it('says nothing of a day whose workout never ended', () => {
    const record = resolvePending(taken, { at: at(31, 9), trainedMinutes: 50, chosenMinutes: 45 });
    expect(record.pending).toBeNull();
    expect(record.answers).toEqual([]);
  });
});

describe('the record', () => {
  it('reads back what it wrote, and drops alone an answer it cannot read', () => {
    const record = answered([27, 'not-now'], [29, 'longer']);
    expect(parseTimeOffers(JSON.parse(JSON.stringify(record)))).toEqual(record);
    const raw = JSON.parse(JSON.stringify(record));
    raw.answers[0].answer = 'maybe';
    expect(parseTimeOffers(raw)?.answers.map((answer) => answer.answer)).toEqual(['longer']);
  });

  it('merges two copies: every showing and answer, the newer pending', () => {
    const a = withShown(answered([27, 'not-now']), at(27));
    const b = withShown(answered([29, 'longer']), at(29));
    const merged = mergeTimeOffers(a, b);
    expect(merged.shown).toEqual([at(27), at(29)]);
    expect(merged.answers.map((answer) => answer.answer)).toEqual(['not-now', 'longer']);
  });
});
