import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import { mediaFor } from '../../catalog/media/mediaManifest';
import type { CustomMedia } from '../../core/validation/customExercise';
import { ExerciseDemo, ExerciseThumb } from './ExerciseMedia';
import { HowToSheet } from './HowToSheet';

/**
 * Maintenance 25, item 7: rules the ninth review found no test holding. The lifter's own steps,
 * GIF and cues; no clip fetched where their own demonstration stands; a play the browser refuses;
 * lazy row stills; Key cues only where there are some; the full credit's title.
 */

const own = vi.hoisted(() => ({ media: null as CustomMedia | null }));
vi.mock('../../features/library/useCustomMedia', () => ({ useCustomMedia: () => own.media }));

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

const fetched: string[] = [];
let refusePlay = false;

beforeEach(() => {
  fetched.length = 0;
  refusePlay = false;
  own.media = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      fetched.push(url);
      return { ok: true, status: 200, blob: async () => new Blob(['mp4'], { type: 'video/mp4' }) };
    }),
  );
  URL.createObjectURL = vi.fn(() => 'blob:clip');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    if (refusePlay) return Promise.reject(new DOMException('refused', 'NotAllowedError'));
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    return Promise.resolve();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('How to, as the lifter has it', () => {
  it("puts the lifter's own steps in place of the catalog's", () => {
    render(
      <HowToSheet
        exercise={bench}
        onClose={vi.fn()}
        own={{ setup: [], execution: ['Lower to the pad, press to lockout.'], cues: [] }}
      />,
    );
    const text = screen.getByTestId('how-to-text');
    expect(within(text).getByText('Lower to the pad, press to lockout.')).toBeInTheDocument();
    expect(within(text).queryByText(bench.instructions.execution[0] as string)).toBeNull();
    // No setup of their own: the catalog's stands.
    expect(within(text).getByText(bench.instructions.setup[0] as string)).toBeInTheDocument();
  });

  it('shows no Key cues heading for an exercise with none', () => {
    const plain: CatalogExercise = { ...bench, instructions: { ...bench.instructions, cues: [] } };
    render(<HowToSheet exercise={plain} onClose={vi.fn()} />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).not.toContain('Key cues');
    expect(headings).toContain('Avoid');
  });

  it("shows the lifter's own GIF in How to, and fetches no clip for it", async () => {
    own.media = gif;
    render(<HowToSheet exercise={bench} onClose={vi.fn()} />);
    const sheet = screen.getByTestId('how-to-sheet');
    expect(within(sheet).getByTestId('custom-media')).toBeInTheDocument();
    expect(within(sheet).getByRole('img', { name: /your demonstration/ })).toHaveAttribute(
      'src',
      gif.dataUrl,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetched).toEqual([]);
  });

  it('fetches no clip for a card whose exercise has the lifter’s own demonstration', async () => {
    render(<ExerciseThumb exercise={bench} size="large" customMedia={gif} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetched).toEqual([]);
    expect(screen.getByTestId('exercise-thumb')).toHaveAttribute('data-custom', 'true');
  });
});

describe('the demonstration', () => {
  it('offers Play when the browser refuses to play the clip, and again when a Play is refused', async () => {
    refusePlay = true;
    render(<ExerciseDemo exercise={bench} />);
    const video = await waitFor(() => {
      const found = screen.getByTestId('exercise-demo');
      if (!(found instanceof HTMLVideoElement)) throw new Error('still the still');
      return found;
    });
    fireEvent.loadedMetadata(video);
    await waitFor(() => expect(screen.getByTestId('demo-pause')).toHaveTextContent('Play'));
    expect(video).toHaveAttribute('data-playing', 'false');
    // Asked to play, refused again: the button still says Play.
    fireEvent.click(screen.getByTestId('demo-pause'));
    await waitFor(() => expect(screen.getByTestId('demo-pause')).toHaveTextContent('Play'));
  });

  it('loads a row’s still only as it scrolls near, and the card’s at once', () => {
    render(
      <>
        <ExerciseThumb exercise={bench} size="small" />
        <ExerciseThumb exercise={bench} size="large" play={false} />
      </>,
    );
    const [row, card] = screen.getAllByTestId('exercise-thumb');
    expect(row).toHaveAttribute('loading', 'lazy');
    expect(card).not.toHaveAttribute('loading');
  });

  it('names the original by its title in the full credit', () => {
    render(<ExerciseDemo exercise={requireExercise('push-up')} />);
    const title = mediaFor(requireExercise('push-up')).credit!.title;
    expect(screen.getByTestId('media-credit')).toHaveTextContent(`“${title}” by`);
  });
});
