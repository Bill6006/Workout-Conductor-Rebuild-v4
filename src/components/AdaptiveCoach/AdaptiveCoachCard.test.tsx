import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CoachCard } from '../../engine/coach/coachConductor';
import { coachingPolicy } from '../../engine/coach/experience';
import type { FatigueSignal } from '../../engine/recovery/fatigue';
import { AdaptiveCoachCard } from './AdaptiveCoachCard';

const fatigue: FatigueSignal = {
  level: 'fresh',
  evidence: ['No fatigue signals in recent sessions.'],
  sessionsLast7Days: 0,
  consecutiveDays: 0,
  hardRatings: 0,
} as FatigueSignal;

function card(level: 'beginner' | 'advanced'): CoachCard {
  const policy = coachingPolicy(level);
  return {
    policy,
    considered: 3,
    domains: ['plateau'],
    signal: {
      domain: 'plateau',
      headline: 'Barbell Bench Press has stalled for 4 exposures at the prescribed effort',
      why: [
        'Best estimated max 215.8 lb then, 215.8 lb now.',
        'Route: 1 shift the rep range (now).',
        'Step 1 explained.',
      ].slice(0, policy.whyLines),
      action: {
        kind: 'recalibrate',
        trigger: { type: 'rep-range', entryId: 'e1', reps: [6, 10] },
        label: 'Shift to 6-10 reps for two weeks',
        route: { exerciseId: 'barbell-bench-press', step: 0, baselineE1rm: 215.8 },
      },
      confidence: 'high',
      severity: 2,
      source: 'stall: route',
    },
  };
}

describe('AdaptiveCoachCard', () => {
  it('shows one quiet line to intermediate and advanced lifters when nothing outranks the plan', () => {
    render(
      <AdaptiveCoachCard
        card={null}
        fatigue={fatigue}
        policy={coachingPolicy('advanced')}
        onAction={vi.fn()}
      />,
    );
    const section = screen.getByTestId('coach-card');
    expect(section).toHaveAttribute('data-tone', 'brief');
    expect(section).toHaveAttribute('data-domain', 'clear');
    expect(screen.getByTestId('coach-headline')).toHaveTextContent(
      'No signal outranks the plan today · fatigue fresh',
    );
    expect(screen.queryByRole('list', { name: 'Why' })).toBeNull();
  });

  it('keeps the explained all-clear card for beginners', () => {
    render(
      <AdaptiveCoachCard
        card={null}
        fatigue={fatigue}
        policy={coachingPolicy('beginner')}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByTestId('coach-headline')).toHaveTextContent('Follow today’s plan');
    expect(screen.getByRole('list', { name: 'Why' })).toBeInTheDocument();
    expect(screen.getByText(/No signal outranks the plan today/)).toBeInTheDocument();
  });

  it('renders a route step as the one action and passes the route reference through', () => {
    const onAction = vi.fn();
    render(
      <AdaptiveCoachCard
        card={card('advanced')}
        fatigue={fatigue}
        policy={coachingPolicy('advanced')}
        onAction={onAction}
      />,
    );
    expect(screen.getByTestId('coach-headline')).toHaveTextContent('stalled for 4 exposures');
    expect(screen.getByRole('list', { name: 'Why' }).children).toHaveLength(2);
    expect(screen.queryByText(/Checked 3 signals/)).toBeNull();
    fireEvent.click(screen.getByTestId('coach-action'));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0]![0].route).toEqual({
      exerciseId: 'barbell-bench-press',
      step: 0,
      baselineE1rm: 215.8,
    });
  });

  it('explains to beginners with three reasons and the footer', () => {
    render(
      <AdaptiveCoachCard
        card={card('beginner')}
        fatigue={fatigue}
        policy={coachingPolicy('beginner')}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByRole('list', { name: 'Why' }).children).toHaveLength(3);
    expect(screen.getByText(/Checked 3 signals across plateau/)).toBeInTheDocument();
  });

  it('offers Not now beside an action and hands the signal to onDismiss', () => {
    const onDismiss = vi.fn();
    const shown = card('advanced');
    render(
      <AdaptiveCoachCard
        card={shown}
        fatigue={fatigue}
        policy={coachingPolicy('advanced')}
        onAction={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByTestId('coach-dismiss'));
    expect(onDismiss).toHaveBeenCalledWith(shown.signal);
  });

  it('asks to confirm only the change it was started for, never the next card', () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    const base = card('advanced');
    const major = (headline: string, label: string, exerciseId: string): CoachCard => ({
      ...base,
      signal: {
        ...base.signal,
        headline,
        source: 'progression',
        exerciseId,
        action: {
          kind: 'recalibrate',
          trigger: { type: 'target-weight', entryId: 'e1', weight: 170 },
          label,
          major: true,
        },
      },
    });
    const first = major('Bench stalled', 'Deload to 170 lb this week', 'barbell-bench-press');
    const props = {
      fatigue,
      policy: coachingPolicy('advanced'),
      onAction,
      onDismiss,
    };
    const { rerender } = render(<AdaptiveCoachCard card={first} {...props} />);
    fireEvent.click(screen.getByTestId('coach-action'));
    expect(screen.getByTestId('coach-action')).toHaveTextContent('Confirm: Deload to 170 lb');

    // A different card comes up before the confirm: it starts from its own first tap.
    const next = major('Squat stalled', 'Micro-deload to 250 lb', 'barbell-back-squat');
    rerender(<AdaptiveCoachCard card={next} {...props} />);
    expect(screen.getByTestId('coach-action')).toHaveTextContent(/^Micro-deload to 250 lb$/);
    fireEvent.click(screen.getByTestId('coach-action'));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByTestId('coach-action')).toHaveTextContent('Confirm: Micro-deload');

    // A card with an ordinary tap after a pending confirm: its label, and a Not now that dismisses.
    const plain: CoachCard = { ...base, signal: { ...base.signal, source: 'extra set' } };
    rerender(<AdaptiveCoachCard card={plain} {...props} />);
    expect(screen.getByTestId('coach-action')).not.toHaveTextContent('Confirm:');
    fireEvent.click(screen.getByTestId('coach-dismiss'));
    expect(onDismiss).toHaveBeenCalledWith(plain.signal);

    // The first card back again asks for its second tap afresh: one tap never applies it.
    rerender(<AdaptiveCoachCard card={first} {...props} />);
    fireEvent.click(screen.getByTestId('coach-action'));
    rerender(<AdaptiveCoachCard card={next} {...props} />);
    rerender(<AdaptiveCoachCard card={first} {...props} />);
    expect(screen.getByTestId('coach-action')).toHaveTextContent(/^Deload to 170 lb this week$/);
    fireEvent.click(screen.getByTestId('coach-action'));
    expect(onAction).not.toHaveBeenCalled();
  });

  it('offers Not now on a card with nothing to tap, and never on the quiet or all-clear card', () => {
    const onDismiss = vi.fn();
    const shown = card('advanced');
    const note: CoachCard = { ...shown, signal: { ...shown.signal, action: null } };
    const { rerender } = render(
      <AdaptiveCoachCard
        card={note}
        fatigue={fatigue}
        policy={coachingPolicy('advanced')}
        onAction={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.queryByTestId('coach-action')).toBeNull();
    fireEvent.click(screen.getByTestId('coach-dismiss'));
    expect(onDismiss).toHaveBeenCalledWith(note.signal);

    for (const level of ['advanced', 'beginner'] as const) {
      rerender(
        <AdaptiveCoachCard
          card={null}
          fatigue={fatigue}
          policy={coachingPolicy(level)}
          onAction={vi.fn()}
          onDismiss={onDismiss}
        />,
      );
      expect(screen.queryByTestId('coach-dismiss')).toBeNull();
    }
  });
});
