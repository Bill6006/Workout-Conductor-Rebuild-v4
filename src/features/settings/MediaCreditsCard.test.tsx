import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DOW_NOTICE, EXERCISE_MEDIA } from '../../catalog/media/exerciseMedia';
import { MediaCreditsCard } from './MediaCreditsCard';

/**
 * Maintenance 25, item 7: Settings, About lists who made every exercise's demonstration and on
 * what terms, each exercise linked to its original, with the notice DVIDS asks to be shown.
 */
describe('Demonstration credits', () => {
  it('names every demonstration under its maker and licence, linked to its original', () => {
    render(<MediaCreditsCard />);
    const card = screen.getByTestId('media-credits');
    const links = within(card)
      .getAllByRole('listitem')
      .map((item) => within(item).getByRole('link'));
    expect(links).toHaveLength(EXERCISE_MEDIA.length);
    for (const asset of EXERCISE_MEDIA) {
      expect(card.querySelector(`a[href="${asset.credit?.sourceUrl}"]`), asset.id).not.toBeNull();
    }
    for (const heading of [
      'Video: U.S. Marine Corps, via DVIDS · Public domain',
      'Video: Goulart, via wger · CC BY-SA 4.0 · licence',
      'Video: FitnessScape · CC BY 3.0 · licence',
      'Drawings: Everkinetic · CC BY-SA 4.0 · licence',
    ]) {
      expect(within(card).getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    // The full name where the short one leaves part out, and never a name said twice.
    expect(card).toHaveTextContent(
      'By Capt. Matthew Holfinger, U.S. Marine Corps Training and Education Command.',
    );
    expect(card).toHaveTextContent('By Greg Priday (everkinetic.com).');
    expect(card).not.toHaveTextContent('By FitnessScape.');
    expect(card).not.toHaveTextContent('By Goulart.');
    expect(within(card).getByTestId('dow-notice')).toHaveTextContent(DOW_NOTICE);
    expect(card).toHaveTextContent(
      'Adaptations of CC BY-SA originals are shared under CC BY-SA 4.0.',
    );
  });
});
