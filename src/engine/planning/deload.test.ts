import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../../core/validation/profile';
import { RECORD_NOW, record } from '../../test/records';
import { interpretFatigue } from '../recovery/fatigue';
import { formatWindow, inDeloadWindow, nextWindow, recommendDeload, windowIsPast } from './deload';

const profile = createDefaultProfile(RECORD_NOW);

/** Eight sessions in a fortnight with maxes slipping and sets at failure. */
function heavyFortnight() {
  const sessions = [];
  for (let i = 0; i < 8; i += 1) {
    const daysAgo = 1 + i * 1.5;
    const weight = i < 2 ? 175 : 185;
    sessions.push(
      record(daysAgo, 'barbell-bench-press', [
        [5, weight, 0],
        [4, weight, 0],
        [4, weight, 0],
      ]),
    );
  }
  return sessions;
}

describe('deload week', () => {
  it('is recommended after a dense fortnight with signs of not keeping up', () => {
    const history = heavyFortnight();
    const fatigue = interpretFatigue(history, RECORD_NOW);
    expect(fatigue.performanceDrift).not.toBeNull();
    const advice = recommendDeload(history, fatigue, profile, RECORD_NOW);
    expect(advice.recommended).toBe(true);
    expect(advice.window).not.toBeNull();
    expect(advice.reasons[0]).toMatch(/sessions in the last 14 days/);
    expect(advice.reasons.some((r) => /maxes fell|closer to failure/.test(r))).toBe(true);
  });

  it('is not recommended when training is light or the body is keeping up', () => {
    const light = [record(2, 'barbell-bench-press', [[5, 185, 2]])];
    expect(
      recommendDeload(light, interpretFatigue(light, RECORD_NOW), profile, RECORD_NOW),
    ).toMatchObject({
      recommended: false,
      window: null,
    });
    const fine = Array.from({ length: 8 }, (_, i) =>
      record(1 + i * 1.5, 'barbell-bench-press', [[5, 185, 2]]),
    );
    expect(
      recommendDeload(fine, interpretFatigue(fine, RECORD_NOW), profile, RECORD_NOW).recommended,
    ).toBe(false);
  });

  it('starts on the next available training day and runs seven days', () => {
    const local = (day: number, hour = 0) => new Date(2026, 8, day, hour).toISOString();
    const window = nextWindow(
      { ...profile, schedule: { ...profile.schedule, availableDays: ['mon', 'wed', 'fri'] } },
      local(10, 15),
    );
    // Thursday Sep 10 2026: the next available day is Friday, from midnight on the device.
    expect(window.startsAt).toBe(local(11));
    expect(window.endsAt).toBe(local(18));
    expect(inDeloadWindow(window, local(11, 8))).toBe(true);
    expect(inDeloadWindow(window, local(18))).toBe(false);
    expect(windowIsPast(window, local(19))).toBe(true);
    expect(formatWindow(window)).toBe('Fri, Sep 11 to Thu, Sep 17');
  });

  it("reads the device's day, late in the evening too (Maintenance 28, item 1)", () => {
    // Thursday 23:30 on the device, which is Friday in UTC west of it: the next day is Friday.
    const late = new Date(2026, 8, 10, 23, 30).toISOString();
    const window = nextWindow(
      { ...profile, schedule: { ...profile.schedule, availableDays: ['mon', 'wed', 'fri'] } },
      late,
    );
    expect(window.startsAt).toBe(new Date(2026, 8, 11).toISOString());
    // A window kept from before, at midnight UTC, names the same calendar days.
    expect(
      formatWindow({ startsAt: '2026-09-11T00:00:00.000Z', endsAt: '2026-09-18T00:00:00.000Z' }),
    ).toBe('Fri, Sep 11 to Thu, Sep 17');
  });
});
