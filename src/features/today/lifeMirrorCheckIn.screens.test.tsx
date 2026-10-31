import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LifeMirrorPrefill } from '../../engine/readiness/lifeMirror';
import type { Readiness } from '../../engine/recalibration/types';
import { ReadinessSheet } from './ReadinessSheet';

/**
 * Item 48 on screen: the check-in sheet fills in what today's Life Mirror check-in gave, each value
 * labelled with its time and changed with one tap, Life Mirror's stress and mood shown in its own
 * words with the switch on, and asks the rest as always. Synthetic data only.
 */

const MORNING = new Date(2026, 8, 2, 7, 40).toISOString();
const AFTERNOON = new Date(2026, 8, 2, 13, 5).toISOString();
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

const filled: LifeMirrorPrefill = {
  energy: { value: 4, at: AFTERNOON },
  sleep: { value: 2, at: MORNING },
  motivation: { value: 3, at: MORNING },
  stress: { value: 4, at: AFTERNOON },
  mood: { value: 2, at: MORNING },
};

const chosen = (group: string) =>
  within(screen.getByRole('radiogroup', { name: group }))
    .getAllByRole('radio')
    .find((option) => option.getAttribute('aria-checked') === 'true')?.textContent;
const option = (group: string, name: string) =>
  within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name });

function show(initial: Readiness | null, lifeMirror: LifeMirrorPrefill | null, on = true) {
  const onSubmit = vi.fn();
  render(
    <ReadinessSheet
      open
      initial={initial}
      lifeMirror={lifeMirror}
      lifeMirrorOn={on}
      onClose={() => undefined}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

const asked = { soreness: 2, jointDiscomfort: [], timePressure: false };

describe('the check-in with Life Mirror’s', () => {
  it('fills in energy, sleep and motivation, each labelled with its check-in’s time', () => {
    show(null, filled);
    expect(chosen('Energy')).toBe('Good');
    expect(chosen('Sleep')).toBe('Short');
    expect(chosen('Motivation')).toBe('Okay');
    expect(screen.getByTestId('from-life-mirror-energy')).toHaveTextContent(
      `From Life Mirror, ${clock(AFTERNOON)}`,
    );
    expect(screen.getByTestId('from-life-mirror-sleep')).toHaveTextContent(clock(MORNING));
    // Soreness, illness and joints are asked here, as always.
    expect(chosen('Soreness')).toBe('Slight');
    expect(chosen('Unwell')).toBe('No');
  });

  it('shows its stress and mood in its own words, each labelled (the review of item 48)', () => {
    show(null, filled);
    expect(chosen('Stress')).toBe('Wound tight');
    expect(chosen('Mood')).toBe('Down');
    expect(screen.getByTestId('from-life-mirror-stress')).toHaveTextContent(
      `From Life Mirror, ${clock(AFTERNOON)}`,
    );
    expect(screen.getByTestId('from-life-mirror-mood')).toHaveTextContent(clock(MORNING));
  });

  it('takes a tap over Life Mirror’s value, its label gone, and tells the rest as Life Mirror’s', async () => {
    const onSubmit = show(null, filled);
    const user = userEvent.setup();
    await user.click(option('Energy', 'Low'));
    expect(screen.queryByTestId('from-life-mirror-energy')).toBeNull();
    expect(screen.getByTestId('from-life-mirror-sleep')).toBeInTheDocument();
    await user.click(screen.getByTestId('readiness-apply'));
    expect(onSubmit).toHaveBeenCalledWith({
      ...asked,
      energy: 2,
      sleep: 2,
      motivation: 3,
      stress: 4,
      mood: 2,
      fromLifeMirror: { sleep: MORNING, motivation: MORNING, stress: AFTERNOON, mood: MORNING },
    });
  });

  it('makes a value the lifter’s own with any tap, Life Mirror’s own value too', async () => {
    const onSubmit = show(null, filled);
    const user = userEvent.setup();
    await user.click(option('Motivation', 'Okay'));
    await user.click(option('Stress', 'Light'));
    expect(screen.queryByTestId('from-life-mirror-motivation')).toBeNull();
    expect(screen.queryByTestId('from-life-mirror-stress')).toBeNull();
    await user.click(screen.getByTestId('readiness-apply'));
    expect(onSubmit).toHaveBeenCalledWith({
      ...asked,
      energy: 4,
      sleep: 2,
      motivation: 3,
      stress: 2,
      mood: 2,
      fromLifeMirror: { energy: AFTERNOON, sleep: MORNING, mood: MORNING },
    });
  });

  it('shows a check-in already told as told, Life Mirror’s labels kept on what it gave', () => {
    const told: Readiness = {
      energy: 3,
      soreness: 4,
      sleep: 2,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
      stress: 4,
      fromLifeMirror: { sleep: MORNING, stress: AFTERNOON },
    };
    show(told, filled);
    expect(chosen('Energy')).toBe('Okay');
    expect(chosen('Soreness')).toBe('Sore');
    expect(screen.queryByTestId('from-life-mirror-energy')).toBeNull();
    expect(screen.getByTestId('from-life-mirror-sleep')).toHaveTextContent(clock(MORNING));
    expect(chosen('Stress')).toBe('Wound tight');
    expect(screen.getByTestId('from-life-mirror-stress')).toHaveTextContent(clock(AFTERNOON));
    // Told without a mood: none shown, Life Mirror's of now not either.
    expect(screen.queryByRole('radiogroup', { name: 'Mood' })).toBeNull();
  });

  it('with the switch off, shows and tells neither its stress nor its mood', async () => {
    const told: Readiness = {
      ...asked,
      energy: 3,
      sleep: 2,
      motivation: 3,
      stress: 4,
      mood: 2,
      fromLifeMirror: { sleep: MORNING, stress: AFTERNOON, mood: MORNING },
    };
    const onSubmit = show(told, null, false);
    expect(screen.queryByRole('radiogroup', { name: 'Stress' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Mood' })).toBeNull();
    await userEvent.setup().click(screen.getByTestId('readiness-apply'));
    expect(onSubmit).toHaveBeenCalledWith({
      ...asked,
      energy: 3,
      sleep: 2,
      motivation: 3,
      fromLifeMirror: { sleep: MORNING },
    });
  });

  it('asks as always with nothing from Life Mirror', async () => {
    const onSubmit = show(null, null);
    expect(chosen('Energy')).toBe('Okay');
    expect(screen.queryByTestId('from-life-mirror-energy')).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Stress' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Mood' })).toBeNull();
    await userEvent.setup().click(screen.getByTestId('readiness-apply'));
    expect(onSubmit).toHaveBeenCalledWith({
      ...asked,
      energy: 3,
      sleep: 3,
      motivation: 3,
    });
  });
});
