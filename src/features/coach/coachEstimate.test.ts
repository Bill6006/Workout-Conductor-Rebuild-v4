import { describe, expect, it, vi } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { conductCoach } from '../../engine/coach/coachConductor';
import type { ReserveEstimate } from '../../engine/progression/reserveCheck';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { coachContextOf } from './useCoach';

vi.mock('../../engine/coach/coachConductor', async (original) => ({
  ...(await original<typeof import('../../engine/coach/coachConductor')>()),
  conductCoach: vi.fn(() => null),
}));

/**
 * The second review of Maintenance 33: the coach reads today's sets as the rules read the log, so it
 * is given the reserve-check estimate the log is read through (`readEstimate`). Synthetic data only.
 */

describe('the coach’s reading of today’s sets', () => {
  it('is given the estimate the log is read through', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const estimate: ReserveEstimate = {
      readings: 4,
      scatter: 0.5,
      mean: 1,
      bias: 1,
      sd: 0.3,
      usable: true,
      correction: 1,
      band: [8, 14],
    };
    coachContextOf(
      { ...store.getSnapshot(), lastExportAt: TEST_NOW, readEstimate: estimate },
      Date.parse(TEST_NOW),
    );
    expect(vi.mocked(conductCoach)).toHaveBeenCalledWith(
      expect.objectContaining({ reserveEstimate: estimate }),
    );
  });
});
