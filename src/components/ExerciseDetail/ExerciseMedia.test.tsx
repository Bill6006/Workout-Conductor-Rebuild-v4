import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { CustomMedia } from '../../core/validation/customExercise';
import { ExerciseDemo, ExerciseThumb } from './ExerciseMedia';

const bench = requireExercise('barbell-bench-press');
const gif: CustomMedia = {
  id: bench.id,
  exerciseId: bench.id,
  kind: 'image',
  mimeType: 'image/gif',
  sizeBytes: 43,
  dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  source: 'user',
  createdAt: '2026-09-04T12:00:00.000Z',
};

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

afterEach(() => {
  // @ts-expect-error jsdom has no matchMedia; tests define it as needed
  delete window.matchMedia;
});

describe('ExerciseThumb', () => {
  it('plays the demonstration loop on the card and keeps rows still', () => {
    const { rerender } = render(<ExerciseThumb exercise={bench} size="large" />);
    const thumb = screen.getByTestId('exercise-thumb');
    expect(thumb).toHaveAttribute('data-animated', 'true');
    expect(thumb.getAttribute('src')).toContain('-loop.svg');
    rerender(<ExerciseThumb exercise={bench} size="small" />);
    expect(screen.getByTestId('exercise-thumb')).toHaveAttribute('data-animated', 'false');
    expect(screen.getByTestId('exercise-thumb').getAttribute('src')).not.toContain('-loop');
  });

  it('shows the still poster under reduced motion', () => {
    mockReducedMotion(true);
    render(<ExerciseThumb exercise={bench} size="large" />);
    const thumb = screen.getByTestId('exercise-thumb');
    expect(thumb).toHaveAttribute('data-animated', 'false');
    expect(thumb.getAttribute('src')).not.toContain('-loop');
  });

  it("shows the user's own GIF on the card", () => {
    render(<ExerciseThumb exercise={bench} size="large" customMedia={gif} />);
    const thumb = screen.getByTestId('exercise-thumb');
    expect(thumb).toHaveAttribute('data-custom', 'true');
    expect(thumb.getAttribute('src')).toBe(gif.dataUrl);
  });
});

describe('ExerciseDemo', () => {
  it('opens the picker from the image or the button and hands the file over', () => {
    const onPickFile = vi.fn();
    render(<ExerciseDemo exercise={bench} onPickFile={onPickFile} />);
    const input = screen.getByTestId<HTMLInputElement>('demo-file-input');
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByTestId('demo-pick'));
    fireEvent.click(screen.getByRole('button', { name: 'Your GIF' }));
    expect(click).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Placeholder · tap it to use your own GIF')).toBeInTheDocument();
    const file = new File(['gif'], 'bench.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onPickFile).toHaveBeenCalledWith(file);
  });

  it('offers Replace and Remove once the user has their own demonstration', () => {
    const onRemove = vi.fn();
    render(
      <ExerciseDemo exercise={bench} customMedia={gif} onPickFile={vi.fn()} onRemove={onRemove} />,
    );
    expect(screen.getByTestId('custom-media')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('stays a plain demonstration without a picker', () => {
    render(<ExerciseDemo exercise={bench} />);
    expect(screen.queryByTestId('demo-pick')).toBeNull();
    expect(screen.queryByTestId('demo-file-input')).toBeNull();
    expect(screen.getByText('Placeholder diagram · original')).toBeInTheDocument();
  });
});
