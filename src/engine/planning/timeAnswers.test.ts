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
    // Five answers: two "same" and two "longer" tie among the latest four, and the newer, "longer",
    // wins; the oldest, a third "same", falls out, or "same" would lead.
    const record = answered(
      [20, 'same'],
      [22, 'same'],
      [24, 'longer'],
      [26, 'same'],
      [28, 'longer'],
    );
    expect(timePattern(record, NOW)?.pattern).toBe('has-time');
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

  it('keep the day’s showing on all day, the second day of two in seven', () => {
    const record = withShown(withShown(emptyTimeOffers(), at(25, 9)), at(26, 9));
    expect(mayShowLonger(record, at(26, 18))).toBe(true);
    expect(mayShowLonger(record, at(27, 9))).toBe(false);
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
    const record = resolvePending(taken, {
      began: at(30, 9),
      trainedMinutes: 40,
      chosenMinutes: 45,
    });
    expect(record.pending).toBeNull();
    expect(record.answers.map((answer) => answer.answer)).toEqual(['longer']);
  });

  it('says the time ran short under halfway', () => {
    const record = resolvePending(taken, {
      began: at(30, 9),
      trainedMinutes: 34,
      chosenMinutes: 45,
    });
    expect(record.answers.map((answer) => answer.answer)).toEqual(['same']);
  });

  it('says the shorter session was chosen after all where the length went back down', () => {
    const record = resolvePending(taken, {
      began: at(30, 9),
      trainedMinutes: 30,
      chosenMinutes: 30,
    });
    expect(record.answers.map((answer) => answer.answer)).toEqual(['not-now']);
  });

  it('answers one taken before midnight and trained past it, by the day the workout began', () => {
    const late: TimeOffers = {
      ...taken,
      pending: { ...taken.pending!, at: new Date(2026, 9, 30, 23, 40).toISOString() },
    };
    const record = resolvePending(late, {
      began: new Date(2026, 9, 30, 23, 45).toISOString(),
      trainedMinutes: 44,
      chosenMinutes: 45,
    });
    expect(record.answers.map((answer) => answer.answer)).toEqual(['longer']);
  });

  it('says nothing of a day whose workout never ended', () => {
    const record = resolvePending(taken, {
      began: at(31, 9),
      trainedMinutes: 50,
      chosenMinutes: 45,
    });
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
    const pending = (day: number): TimeOffers['pending'] => ({
      at: at(day, 8),
      week: localWeekKey(at(day)),
      muscles: ['chest'],
      from: 30,
      to: 45,
      choice: 45,
    });
    // The saved copy's pending older than the one shown, and the other way round.
    expect(
      mergeTimeOffers({ ...a, pending: pending(28) }, { ...b, pending: pending(30) }).pending?.at,
    ).toBe(at(30, 8));
    expect(
      mergeTimeOffers({ ...a, pending: pending(30) }, { ...b, pending: pending(28) }).pending?.at,
    ).toBe(at(30, 8));
  });

  it('keeps one answer a suggestion: a second for it takes its place', () => {
    const one = {
      at: at(29),
      week: localWeekKey(at(29)),
      muscles: ['chest' as const],
      from: 30,
      to: 45,
    };
    const record = withAnswer(withAnswer(emptyTimeOffers(), { ...one, answer: 'same' }), {
      ...one,
      answer: 'longer',
    });
    expect(record.answers.map((answer) => answer.answer)).toEqual(['longer']);
  });

  it('drops a pending suggestion either copy has answered', () => {
    const asked = {
      at: at(30, 8),
      week: localWeekKey(at(30)),
      muscles: ['chest' as const],
      from: 30,
      to: 45,
    };
    const waiting: TimeOffers = { ...emptyTimeOffers(), pending: { ...asked, choice: 45 } };
    const answeredCopy = withAnswer(emptyTimeOffers(), { ...asked, answer: 'longer' });
    expect(mergeTimeOffers(waiting, answeredCopy).pending).toBeNull();
    expect(mergeTimeOffers(answeredCopy, waiting).pending).toBeNull();
    expect(mergeTimeOffers(waiting, emptyTimeOffers()).pending).toEqual(waiting.pending);
  });

  it('keeps an answer only for the weeks a pattern reads', () => {
    const old = new Date(2026, 7, 1, 12).toISOString();
    const record = withAnswer(
      withAnswer(emptyTimeOffers(), {
        at: old,
        week: localWeekKey(old),
        muscles: ['chest'],
        from: 30,
        to: 45,
        answer: 'not-now',
      }),
      {
        at: at(31),
        week: localWeekKey(at(31)),
        muscles: ['chest'],
        from: 30,
        to: 45,
        answer: 'longer',
      },
    );
    expect(record.answers.map((answer) => answer.at)).toEqual([at(31)]);
  });

  it('drops alone a showing it cannot read, and a pending one', () => {
    const record = withShown(answered([27, 'not-now']), at(27));
    const raw = JSON.parse(JSON.stringify(record));
    raw.shown = ['yesterday', ...raw.shown];
    raw.pending = { at: at(30), week: 'soon', muscles: ['chest'], from: 30, to: 45, choice: 20 };
    const read = parseTimeOffers(raw);
    expect(read?.shown).toEqual([at(27)]);
    expect(read?.pending).toBeNull();
    expect(read?.answers.map((answer) => answer.answer)).toEqual(['not-now']);
  });
});
