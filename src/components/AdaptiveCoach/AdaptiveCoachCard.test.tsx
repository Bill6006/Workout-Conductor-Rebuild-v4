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
});
