import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { HowToSheet } from './HowToSheet';

vi.mock('../../features/library/useCustomMedia', () => ({ useCustomMedia: () => null }));

/**
 * Maintenance 25, item 7: How to teaches the exercise and nothing else. The demonstration first,
 * then Setup, Do it, Key cues, Avoid and, where it matters, How far, in the catalog's words.
 */

const headings = () =>
  screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);

describe('How to', () => {
  it('shows the demonstration, then the setup, the steps, the cues and what to avoid', () => {
    const bench = requireExercise('barbell-bench-press');
    render(<HowToSheet exercise={bench} onClose={vi.fn()} />);
    const sheet = screen.getByRole('dialog', { name: 'How to: Barbell Bench Press' });
    const demo = within(sheet).getByTestId('exercise-demo');
    const text = within(sheet).getByTestId('how-to-text');
    // The demonstration comes first, large.
    expect(demo.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(headings()).toEqual(['Setup', 'Do it', 'Key cues', 'Avoid']);
    for (const line of [
      ...bench.instructions.setup,
      ...bench.instructions.execution,
      ...bench.instructions.cues,
      ...bench.instructions.mistakes,
    ]) {
      expect(within(text).getByText(line)).toBeInTheDocument();
    }
    // The steps are numbered; the rest are lists.
    expect(within(text).getAllByRole('list')[1]?.tagName).toBe('OL');
    // It teaches: nothing of the session's own.
    expect(within(sheet).queryByTestId('progression-evidence')).toBeNull();
    expect(within(sheet).queryByTestId('equipment-busy')).toBeNull();
    expect(within(sheet).getByTestId('demo-credit')).toHaveTextContent('FitnessScape');
  });

  it('says how far to go where that matters', () => {
    const exercise = requireExercise('dumbbell-bench-press');
    expect(exercise.instructions.range).toBeTruthy();
    render(<HowToSheet exercise={exercise} onClose={vi.fn()} />);
    expect(headings()).toEqual(['Setup', 'Do it', 'Key cues', 'Avoid', 'How far']);
    expect(screen.getByText(exercise.instructions.range as string)).toBeInTheDocument();
  });

  it("puts the lifter's own setup and steps in place of the catalog's, and their cues after", () => {
    const bench = requireExercise('barbell-bench-press');
    render(
      <HowToSheet
        exercise={bench}
        onClose={vi.fn()}
        own={{
          setup: ['Two pads under the bench feet.'],
          execution: [],
          cues: ['Push the floor away'],
        }}
      />,
    );
    expect(screen.getByText('Two pads under the bench feet.')).toBeInTheDocument();
    expect(screen.queryByText(bench.instructions.setup[0] as string)).toBeNull();
    // No steps of their own: the catalog's stand.
    expect(screen.getByText(bench.instructions.execution[0] as string)).toBeInTheDocument();
    expect(headings()).toEqual(['Setup', 'Do it', 'Key cues', 'Avoid', 'Your cues']);
    expect(screen.getByText('Push the floor away')).toBeInTheDocument();
  });

  it('shows the diagram for an exercise with no demonstration of its own, and still teaches it', () => {
    const pullApart = requireExercise('band-pull-apart');
    render(<HowToSheet exercise={pullApart} onClose={vi.fn()} />);
    expect(screen.getByTestId('exercise-demo').getAttribute('src')).toMatch(/placeholders/);
    expect(screen.getByText(pullApart.instructions.execution[0] as string)).toBeInTheDocument();
    expect(screen.queryByTestId('media-credit')).toBeNull();
  });

  it('renders nothing while closed', () => {
    const { container } = render(<HowToSheet exercise={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
