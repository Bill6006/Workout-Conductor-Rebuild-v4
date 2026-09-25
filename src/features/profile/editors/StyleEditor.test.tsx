import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { TRAINING_STYLES, type UserProfile } from '../../../core/validation/profile';
import { createDraft, type ProfileDraft } from '../draft';
import { styleLabel, styleOptions } from '../labels';
import { GoalsEditor } from './GoalsEditor';
import { StyleEditor } from './StyleEditor';

const NOW = '2026-09-18T12:00:00.000Z';

/** Both editors over one draft, as Settings and setup hold them. */
function Harness({
  initial,
  onDraft,
}: {
  initial: ProfileDraft;
  onDraft: (d: ProfileDraft) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const change = (next: ProfileDraft) => {
    setDraft(next);
    onDraft(next);
  };
  return (
    <>
      <GoalsEditor draft={draft} onChange={change} />
      <StyleEditor draft={draft} onChange={change} />
    </>
  );
}

function setup(patch: Partial<UserProfile> = {}) {
  const base = createDraft(NOW);
  let latest: ProfileDraft = { ...base, profile: { ...base.profile, ...patch } };
  render(<Harness initial={latest} onDraft={(draft) => (latest = draft)} />);
  return { user: userEvent.setup(), draft: () => latest };
}

const styleGroup = () => screen.getByRole('radiogroup', { name: 'Programming style' });

describe('the Programming style control', () => {
  it('offers Auto first, then every style, each with one line', () => {
    setup();
    const radios = within(styleGroup()).getAllByRole('radio');
    expect(radios.map((radio) => radio.textContent)).toEqual([
      'AutoYour goals choose: Hypertrophy focus right now',
      'HybridA heavy lift first, then muscle-building volume',
      'Hypertrophy focusMore sets at moderate loads',
      'Strength focusHeavier loads, fewer reps, longer rests',
      'UndulatingHeavy, moderate, and light days in rotation',
      'Lean-downLosing fat: keep the muscle and the strength',
      'Light weightsLighter loads, more reps, close to failure',
      'FoundationNew to lifting: moderate loads, fewer sets, reps in reserve',
    ]);
    expect(within(styleGroup()).getByRole('radio', { name: /^Hybrid/ })).toBeChecked();
  });

  it('under Auto says what the goals came to and why, with the research folded away', async () => {
    const { user, draft } = setup();
    await user.click(within(styleGroup()).getByRole('radio', { name: /^Auto/ }));
    expect(draft().profile.programStyle).toBe('auto');
    // The original field follows along on a value an older copy of the app can read.
    expect(draft().profile.trainingStyle).toBe('hypertrophy-focus');
    expect(screen.getByTestId('style-resolved')).toHaveTextContent('Auto picked Hypertrophy focus');
    const why = screen.getByTestId('style-why');
    expect(why).toHaveTextContent('Size follows weekly sets');
    expect(why).toHaveTextContent('Strong evidence');
    const research = screen.getByTestId('style-research');
    expect(research).not.toHaveAttribute('open');
    await user.click(within(research).getByText('The research'));
    expect(research).toHaveAttribute('open');
    expect(research).toHaveTextContent('Schoenfeld, Ogborn and Krieger, 2017');
  });

  it('follows the goals as they change, and Losing fat most of all', async () => {
    const { user, draft } = setup({ programStyle: 'auto' });
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Primary goal' })).getByRole('radio', {
        name: /^Strength progress/,
      }),
    );
    // Strength with a size goal beside it: both.
    expect(screen.getByTestId('style-resolved')).toHaveTextContent('Auto picked Hybrid');
    await user.click(screen.getByRole('switch', { name: /Losing fat right now/ }));
    expect(draft().profile.goals.bodyweight).toBe('lose');
    expect(screen.getByTestId('style-resolved')).toHaveTextContent('Auto picked Lean-down');
    expect(screen.getByTestId('style-why')).toHaveTextContent('Moderate evidence');
    await user.click(screen.getByRole('switch', { name: /Losing fat right now/ }));
    expect(draft().profile.goals.bodyweight).toBe('hold');
    expect(screen.getByTestId('style-resolved')).toHaveTextContent('Auto picked Hybrid');
  });

  it('a style picked by hand stands, says where the goals point, and marks mixed evidence', async () => {
    const { user, draft } = setup();
    await user.click(within(styleGroup()).getByRole('radio', { name: /^Undulating/ }));
    expect(draft().profile.programStyle).toBe('undulating');
    expect(TRAINING_STYLES).toContain(draft().profile.trainingStyle);
    const why = screen.getByTestId('style-why');
    expect(why).toHaveTextContent('Undulating');
    expect(why).toHaveTextContent('Mixed evidence');
    expect(why).toHaveTextContent('Your goals point to Hypertrophy focus.');
  });
});

describe('the Allow drop sets switch', () => {
  it('says what it plans, and that Lean-down and Foundation plan none', () => {
    // Maintenance 23, the owner's item 5: it said "never automatic", and a drop set is planned.
    setup();
    expect(
      screen.getByText(
        'At most one a workout, on an isolation move that suits it. Lean-down and Foundation plan none.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/never automatic/)).not.toBeInTheDocument();
  });
});

describe('style labels', () => {
  it('names Auto with what it came to, and a picked style by its own name', () => {
    const profile = createDraft(NOW).profile;
    expect(styleLabel(profile)).toBe('Hybrid');
    expect(styleLabel({ ...profile, programStyle: 'auto' })).toBe('Auto · Hypertrophy focus');
    const legacy = { ...profile, trainingStyle: 'strength-focus' as const };
    delete legacy.programStyle;
    expect(styleLabel(legacy)).toBe('Strength focus');
    expect(styleOptions(profile)).toHaveLength(8);
  });
});
