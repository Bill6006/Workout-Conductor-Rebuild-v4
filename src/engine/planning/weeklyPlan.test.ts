import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { RECORD_NOW, record } from '../../test/records';
import { planWeek, recoveryBalance } from './weeklyPlan';

// RECORD_NOW is a Thursday; the default profile trains Mon, Tue, Thu, Fri.
const profile = createDefaultProfile(RECORD_NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);

describe('weekly plan', () => {
  it('plans the next sessions on available days and rotates templates', () => {
    const plan = planWeek(profile, gym, [], RECORD_NOW);
    expect(plan).toHaveLength(4);
    expect(plan[0]).toMatchObject({ today: true, label: 'Today', weekday: 'thu' });
    expect(plan.map((session) => session.weekday)).toEqual(['thu', 'fri', 'mon', 'tue']);
    expect(plan.every((session) => session.focus.length > 0 && session.title.length > 0)).toBe(
      true,
    );
    expect(plan[0]?.templateId).not.toBe(plan[1]?.templateId);
    expect(new Set(plan.map((session) => session.templateId)).size).toBeGreaterThanOrEqual(3);
  });

  it('skips today once a session is logged today', () => {
    const plan = planWeek(
      profile,
      gym,
      [record(0, 'barbell-bench-press', [[5, 185, 2]])],
      RECORD_NOW,
    );
    expect(plan[0]?.today).toBe(false);
    expect(plan[0]?.weekday).toBe('fri');
  });

  it('describes recovery balance per muscle', () => {
    const history = [
      record(1, 'barbell-bench-press', [[5, 185, 2]]),
      record(3, 'back-squat', [[5, 225, 2]]),
    ];
    const rows = recoveryBalance(history, RECORD_NOW);
    expect(rows.find((row) => row.muscle === 'chest')?.state).toBe('recovering');
    expect(rows.find((row) => row.muscle === 'quads')?.state).toBe('ready');
    expect(rows.find((row) => row.muscle === 'lats')?.state).toBe('fresh');
    expect(rows[0]?.daysSince).toBe(1);
  });
});
