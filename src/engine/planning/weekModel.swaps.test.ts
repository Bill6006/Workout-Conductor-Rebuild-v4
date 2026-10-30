import { describe, expect, it } from 'vitest';
import { at, gym, profileOf } from '../../test/clockDays';
import type { LastingSwap } from './lastingSwaps';
import { weekModel } from './weekModel';

/**
 * Round M's fresh review before shipping: the week's sessions still to come are read as the store
 * builds them, the lasting swaps included (`weekModel`'s `swaps`, as every plan of the day has
 * them). An EZ-bar curl works the forearms as a secondary muscle, at half; the hammer curl it is
 * swapped for works them directly. Synthetic data only.
 */

const MONDAY_MORNING = at(7, 7);
const curlToHammer: LastingSwap[] = [
  { from: 'ez-bar-curl', to: 'hammer-curl', setAt: at(6), until: at(30) },
];

describe('the week ahead with a lasting swap', () => {
  it('counts the swap-in where the week plans the lift it replaced', () => {
    const profile = profileOf();
    const plain = weekModel({ profile, location: gym, history: [], now: MONDAY_MORNING });
    const swapped = weekModel({
      profile,
      location: gym,
      history: [],
      now: MONDAY_MORNING,
      swaps: curlToHammer,
    });
    // Baseline: the week plans curls, the forearms credited at half for them.
    expect(plain.sessionsAhead).toBeGreaterThan(0);
    expect(plain.muscles.biceps.planned).toBeGreaterThan(0);
    // The hammer curls in their place work the forearms directly: more of the week's sets.
    expect(swapped.muscles.forearms.planned).toBeGreaterThan(plain.muscles.forearms.planned);
  });
});
