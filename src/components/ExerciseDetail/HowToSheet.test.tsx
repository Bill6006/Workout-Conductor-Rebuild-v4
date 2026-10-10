import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { HowToSheet } from './HowToSheet';

vi.mock('../../features/library/useCustomMedia', () => ({ useCustomMedia: () => null }));
// How to sets the lifter's own demonstration too (Maintenance 26, item 50): none here.
const picked = vi.hoisted(() => [] as File[]);
vi.mock('../../features/library/useOwnDemonstration', () => ({
  useOwnDemonstration: () => ({
    media: null,
    busy: false,
    pick: (file: File) => picked.push(file),
    remove: () => undefined,
  }),
}));

/**
 * Maintenance 25, item 7: How to teaches the exercise, with nothing of the session's own. The
 * demonstration first, then Setup, Do it, Key cues, Avoid and, where it matters, How far, in the
 * catalog's words; since Maintenance 26, item 50, the demonstration also sets the lifter's own.
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

  it("sets the lifter's own demonstration: a tap on it, or Your GIF, picks a file (Maintenance 26, item 50)", () => {
    const bench = requireExercise('barbell-bench-press');
    render(<HowToSheet exercise={bench} onClose={vi.fn()} />);
    const sheet = screen.getByRole('dialog', { name: 'How to: Barbell Bench Press' });
    expect(within(sheet).getByTestId('demo-pick')).toBeInTheDocument();
    expect(within(sheet).getByTestId('demo-your-gif')).toBeInTheDocument();
    const file = new File(['GIF89a'], 'mine.gif', { type: 'image/gif' });
    fireEvent.change(within(sheet).getByTestId('demo-file-input'), { target: { files: [file] } });
    expect(picked).toEqual([file]);
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

describe('How to after the third pass of item 50', () => {
  it('gives each exercise a demonstration of its own: a Play pressed on one moves no other', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    try {
      const pullApart = requireExercise('band-pull-apart');
      const rollout = requireExercise('ab-wheel-rollout');
      const { rerender } = render(<HowToSheet exercise={pullApart} onClose={vi.fn()} />);
      fireEvent.click(screen.getByTestId('demo-play'));
      expect(screen.getByTestId('exercise-demo').getAttribute('src')).toContain('-loop.svg');
      rerender(<HowToSheet exercise={rollout} onClose={vi.fn()} />);
      expect(screen.getByTestId('exercise-demo').getAttribute('src')).not.toContain('-loop');
      expect(screen.getByTestId('demo-play')).toHaveTextContent('Play');
    } finally {
      // @ts-expect-error jsdom has no matchMedia; this test defined it
      delete window.matchMedia;
    }
  });
});
