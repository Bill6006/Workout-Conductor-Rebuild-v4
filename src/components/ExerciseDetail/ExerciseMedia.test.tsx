import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { DOW_NOTICE } from '../../catalog/media/exerciseMedia';
import type { CustomMedia } from '../../core/validation/customExercise';
import { twoFrameGif } from '../../test/images';
import { loopingImage } from './animatedImage';
import { demoHoldKey, releaseAllDemos } from './demoHold';
import { ExerciseDemo, ExerciseThumb } from './ExerciseMedia';

vi.mock('./animatedImage', async (original) => ({
  ...(await original<typeof import('./animatedImage')>()),
  // jsdom has no canvas: a made first frame stands in as a fixed address.
  useFirstFrame: (dataUrl: string | null, wanted = true) =>
    dataUrl && wanted ? 'blob:first-frame' : null,
}));

const bench = requireExercise('barbell-bench-press');
/** An exercise with no licensed demonstration: it keeps its movement pattern's diagram. */
const pullApart = requireExercise('band-pull-apart');
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
/** The lifter's own GIF that moves: two frames. */
const movingGif: CustomMedia = { ...gif, dataUrl: twoFrameGif(), sizeBytes: 70 };
const ownVideo: CustomMedia = {
  ...gif,
  kind: 'video',
  mimeType: 'video/mp4',
  dataUrl: 'data:video/mp4;base64,AAAA',
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

/**
 * The network: each clip fetched answers with a small blob, fails as offline does, or answers
 * 404 for a file that is not there; a hold keeps the answer until let go.
 */
function mockClips(answer: 'ok' | 'offline' | 'missing', hold?: Promise<void>) {
  const fetched: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      fetched.push(url);
      if (hold) await hold;
      if (answer === 'offline') throw new TypeError('Failed to fetch');
      if (answer === 'missing') return { ok: false, status: 404, blob: async () => new Blob([]) };
      return { ok: true, status: 200, blob: async () => new Blob(['mp4'], { type: 'video/mp4' }) };
    }),
  );
  return fetched;
}

/** The phone's own idea of being online, as Chrome reports it. */
/**
 * The clip's hook listens for the phone coming back online from an effect, which can run a moment
 * after the failure shows: an event sent before then is missed (seen once under load).
 */
async function untilListeningForOnline(listens: { mock: { calls: unknown[][] } }) {
  await waitFor(() => expect(listens.mock.calls.some(([type]) => type === 'online')).toBe(true));
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
}

beforeEach(() => {
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
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    return Promise.resolve();
  });
});

afterEach(() => {
  setOnline(true);
  // A pause held in one test says nothing about the next.
  releaseAllDemos();
  vi.useRealTimers();
  // @ts-expect-error jsdom has no matchMedia; tests define it as needed
  delete window.matchMedia;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ExerciseThumb', () => {
  it('plays the diagram loop on the card for an exercise without a demonstration, and keeps rows still', () => {
    const { rerender } = render(<ExerciseThumb exercise={pullApart} size="large" />);
    const thumb = screen.getByTestId('exercise-thumb');
    expect(thumb).toHaveAttribute('data-animated', 'true');
    expect(thumb.getAttribute('src')).toContain('-loop.svg');
    rerender(<ExerciseThumb exercise={pullApart} size="small" />);
    expect(screen.getByTestId('exercise-thumb')).toHaveAttribute('data-animated', 'false');
    expect(screen.getByTestId('exercise-thumb').getAttribute('src')).not.toContain('-loop');
  });

  it("plays the exercise's own clip on the card once it arrives, its still until then", async () => {
    const fetched = mockClips('ok');
    render(<ExerciseThumb exercise={bench} size="large" />);
    const still = screen.getByTestId('exercise-thumb');
    expect(still.getAttribute('src')).toMatch(
      /media\/exercises\/barbell-bench-press\.[0-9a-f]{8}\.webp$/,
    );
    await waitFor(() => expect(screen.getByTestId('exercise-thumb').tagName).toBe('VIDEO'));
    expect(screen.getByTestId('exercise-thumb')).toHaveAttribute('data-animated', 'true');
    expect(fetched).toEqual([
      expect.stringMatching(/media\/exercises\/barbell-bench-press\.[0-9a-f]{8}\.mp4$/),
    ]);
  });

  it('fetches no clip for a card whose exercise is not the one under way, or for a row', () => {
    const fetched = mockClips('ok');
    render(
      <>
        <ExerciseThumb exercise={bench} size="large" play={false} />
        <ExerciseThumb exercise={bench} size="small" />
      </>,
    );
    expect(fetched).toEqual([]);
    for (const thumb of screen.getAllByTestId('exercise-thumb')) {
      expect(thumb.getAttribute('src')).toMatch(/\.webp$/);
    }
  });

  it('shows the still under reduced motion, fetching nothing', () => {
    mockReducedMotion(true);
    const fetched = mockClips('ok');
    render(<ExerciseThumb exercise={bench} size="large" />);
    const thumb = screen.getByTestId('exercise-thumb');
    expect(thumb).toHaveAttribute('data-animated', 'false');
    expect(thumb.getAttribute('src')).toMatch(/\.webp$/);
    expect(fetched).toEqual([]);
  });

  it("shows the movement's diagram when the still cannot load", () => {
    render(<ExerciseThumb exercise={bench} size="small" />);
    const thumb = screen.getByTestId('exercise-thumb');
    fireEvent.error(thumb);
    expect(screen.getByTestId('exercise-thumb').getAttribute('src')).toMatch(
      /media\/placeholders\/horizontal-push\.svg$/,
    );
    expect(screen.getByTestId('exercise-thumb')).toHaveAttribute('data-still', 'diagram');
  });

  it('keeps moving on the card long past five seconds, a clip and a diagram loop alike (the phone review)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockClips('ok');
    const { rerender } = render(<ExerciseThumb exercise={bench} size="large" />);
    await waitFor(() => expect(screen.getByTestId('exercise-thumb').tagName).toBe('VIDEO'));
    await act(async () => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    const clip = screen.getByTestId('exercise-thumb');
    expect(clip.tagName).toBe('VIDEO');
    expect(clip).toHaveAttribute('loop');
    expect(clip).toHaveAttribute('data-animated', 'true');
    rerender(<ExerciseThumb exercise={pullApart} size="large" />);
    await act(async () => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    expect(screen.getByTestId('exercise-thumb')).toHaveAttribute('data-animated', 'true');
    expect(screen.getByTestId('exercise-thumb').getAttribute('src')).toContain('-loop.svg');
  });

  it("shows the user's own GIF on the card", () => {
    render(<ExerciseThumb exercise={bench} size="large" customMedia={gif} />);
    const thumb = screen.getByTestId('exercise-thumb');
    expect(thumb).toHaveAttribute('data-custom', 'true');
    expect(thumb.getAttribute('src')).toBe(gif.dataUrl);
  });
});

describe('ExerciseDemo', () => {
  it('plays the clip large, slows it to half speed and pauses it', async () => {
    mockClips('ok');
    render(<ExerciseDemo exercise={bench} />);
    const video = await waitFor(() => {
      const found = screen.getByTestId('exercise-demo');
      if (!(found instanceof HTMLVideoElement)) throw new Error('still the still');
      return found;
    });
    expect(video).toHaveAttribute('data-playing', 'true');
    fireEvent.click(screen.getByTestId('demo-slow'));
    expect(video.playbackRate).toBe(0.5);
    expect(screen.getByTestId('demo-slow')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('demo-pause'));
    expect(video).toHaveAttribute('data-playing', 'false');
    expect(screen.getByTestId('demo-pause')).toHaveTextContent('Play');
    fireEvent.click(screen.getByTestId('demo-pause'));
    expect(video).toHaveAttribute('data-playing', 'true');
  });

  it('keeps the still and says why while offline before the clip was ever kept', async () => {
    setOnline(false);
    mockClips('offline');
    render(<ExerciseDemo exercise={bench} />);
    expect(screen.getByTestId('demo-status')).toHaveTextContent('Loading the video…');
    await waitFor(() =>
      expect(screen.getByTestId('demo-status')).toHaveTextContent(
        'Shown as a still: the video plays here once you are online.',
      ),
    );
    expect(screen.getByTestId('exercise-demo').getAttribute('src')).toMatch(/\.webp$/);
  });

  it('waits for Play under reduced motion, then fetches and plays the clip', async () => {
    mockReducedMotion(true);
    const fetched = mockClips('ok');
    render(<ExerciseDemo exercise={bench} />);
    expect(fetched).toEqual([]);
    expect(screen.getByTestId('exercise-demo').getAttribute('src')).toMatch(/\.webp$/);
    await act(async () => {
      fireEvent.click(screen.getByTestId('demo-play'));
    });
    await waitFor(() => expect(screen.getByTestId('exercise-demo').tagName).toBe('VIDEO'));
    expect(fetched).toHaveLength(1);
  });

  it('credits a clip under it, with the notice its source asks for and the full credit on request', () => {
    const pushUp = requireExercise('push-up');
    render(<ExerciseDemo exercise={pushUp} />);
    expect(screen.getByTestId('demo-credit')).toHaveTextContent(
      'Video: U.S. Marine Corps, via DVIDS · Public domain',
    );
    expect(screen.getByTestId('demo-notice')).toHaveTextContent(DOW_NOTICE);
    const credit = screen.getByTestId('media-credit');
    expect(credit).toHaveTextContent('About this video');
    expect(credit).toHaveTextContent('Capt. Matthew Holfinger');
    expect(screen.getByRole('link', { name: 'Original' })).toHaveAttribute(
      'href',
      'https://www.dvidshub.net/video/638236',
    );
  });

  it('links a share-alike licence and says what was changed', () => {
    render(<ExerciseDemo exercise={requireExercise('cable-curl')} />);
    expect(screen.getByTestId('demo-credit')).toHaveTextContent(
      'Video: Goulart, via wger · CC BY-SA 4.0',
    );
    expect(screen.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by-sa/4.0/',
    );
    expect(screen.getByTestId('media-credit')).toHaveTextContent(
      'This adaptation is shared under the same licence.',
    );
    expect(screen.queryByTestId('demo-notice')).toBeNull();
  });

  it('says where the demonstration differs in a detail from the exercise', () => {
    render(<ExerciseDemo exercise={requireExercise('dumbbell-row')} />);
    expect(screen.getByTestId('demo-note')).toHaveTextContent('Shown with a kettlebell');
  });

  it('credits drawings as drawings', () => {
    render(<ExerciseDemo exercise={requireExercise('chin-up')} />);
    expect(screen.getByTestId('demo-credit')).toHaveTextContent(
      'Drawings: Everkinetic · CC BY-SA 4.0',
    );
    expect(screen.getByTestId('media-credit')).toHaveTextContent('About this drawing');
  });

  it('opens the picker from the image or the button and hands the file over', () => {
    const onPickFile = vi.fn();
    render(<ExerciseDemo exercise={pullApart} onPickFile={onPickFile} />);
    const input = screen.getByTestId<HTMLInputElement>('demo-file-input');
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByTestId('demo-pick'));
    fireEvent.click(screen.getByRole('button', { name: 'Your GIF' }));
    expect(click).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Diagram · tap it to use your own GIF')).toBeInTheDocument();
    const file = new File(['gif'], 'pull-apart.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onPickFile).toHaveBeenCalledWith(file);
  });

  it('offers Your GIF beside a licensed clip too', () => {
    const onPickFile = vi.fn();
    render(<ExerciseDemo exercise={bench} onPickFile={onPickFile} />);
    expect(screen.queryByTestId('demo-pick')).toBeNull();
    expect(screen.getByRole('button', { name: 'Your GIF' })).toBeInTheDocument();
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
    render(<ExerciseDemo exercise={pullApart} />);
    expect(screen.queryByTestId('demo-pick')).toBeNull();
    expect(screen.queryByTestId('demo-file-input')).toBeNull();
    expect(screen.getByText('Diagram of the movement')).toBeInTheDocument();
    expect(screen.queryByText(/placeholder/i)).toBeNull();
  });

  // The ninth review.
  it('says the video could not load, rather than offline, when the phone is online', async () => {
    setOnline(true);
    mockClips('missing');
    render(<ExerciseDemo exercise={bench} />);
    await waitFor(() =>
      expect(screen.getByTestId('demo-status')).toHaveTextContent(
        'Shown as a still: the video could not load.',
      ),
    );
    expect(screen.getByTestId('demo-status')).not.toHaveTextContent('online');
  });

  it('shows no credit, note or notice under the diagram when the still could not load either', async () => {
    mockClips('missing');
    render(<ExerciseDemo exercise={requireExercise('push-up')} />);
    expect(screen.getByTestId('demo-credit')).toHaveTextContent('U.S. Marine Corps');
    fireEvent.error(screen.getByTestId('exercise-demo'));
    expect(screen.getByTestId('exercise-demo')).toHaveAttribute('data-still', 'diagram');
    await waitFor(() =>
      expect(screen.getByTestId('demo-status')).toHaveTextContent(
        'Shown as a diagram: the video could not load.',
      ),
    );
    expect(screen.getByTestId('demo-credit')).toHaveTextContent('Diagram of the movement');
    expect(screen.queryByTestId('demo-notice')).toBeNull();
    expect(screen.queryByTestId('media-credit')).toBeNull();
  });

  it('keeps focus on Play while the clip loads under reduced motion, then hands it to Pause', async () => {
    mockReducedMotion(true);
    let arrive!: () => void;
    const hold = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    mockClips('ok', hold);
    render(<ExerciseDemo exercise={bench} />);
    const play = screen.getByTestId('demo-play');
    play.focus();
    fireEvent.click(play);
    expect(screen.getByTestId('demo-play')).toHaveTextContent('Loading…');
    expect(screen.getByTestId('demo-play')).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(screen.getByTestId('demo-play'));
    await act(async () => {
      arrive();
    });
    await waitFor(() => expect(screen.getByTestId('exercise-demo').tagName).toBe('VIDEO'));
    expect(document.activeElement).toBe(screen.getByTestId('demo-pause'));
  });
});

describe('the tenth review: whatever moves can be stopped', () => {
  it('keeps an own GIF moving on the card, and rests it on its first frame while paused in How to', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const key = demoHoldKey('session-1', 'entry-1', bench.id);
    render(
      <>
        <ExerciseThumb exercise={bench} size="large" customMedia={movingGif} holdKey={key} />
        <ExerciseDemo exercise={bench} customMedia={movingGif} holdKey={key} />
      </>,
    );
    const thumb = () => screen.getByTestId('exercise-thumb');
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    // It loops for good whatever its file says (the phone review).
    const looping = loopingImage(movingGif.dataUrl);
    expect(thumb()).toHaveAttribute('data-animated', 'true');
    expect(thumb().getAttribute('src')).toBe(looping);
    fireEvent.click(screen.getByTestId('demo-pause'));
    expect(thumb()).toHaveAttribute('data-animated', 'false');
    expect(thumb().getAttribute('src')).toBe('blob:first-frame');
    fireEvent.click(screen.getByTestId('demo-pause'));
    expect(thumb()).toHaveAttribute('data-animated', 'true');
    expect(thumb().getAttribute('src')).toBe(looping);
  });

  it('shows an own GIF that moves on its first frame under reduced motion, a still photo as it is', () => {
    mockReducedMotion(true);
    const { rerender } = render(
      <ExerciseThumb exercise={bench} size="large" customMedia={movingGif} />,
    );
    expect(screen.getByTestId('exercise-thumb').getAttribute('src')).toBe('blob:first-frame');
    rerender(<ExerciseThumb exercise={bench} size="large" customMedia={gif} />);
    expect(screen.getByTestId('exercise-thumb').getAttribute('src')).toBe(gif.dataUrl);
  });

  it('pauses the diagram’s loop on its still in How to, and plays it again', () => {
    render(<ExerciseDemo exercise={pullApart} onPickFile={vi.fn()} />);
    const demo = () => screen.getByTestId('exercise-demo');
    expect(demo().getAttribute('src')).toContain('-loop.svg');
    expect(demo()).toHaveAttribute('data-playing', 'true');
    fireEvent.click(screen.getByTestId('demo-pause'));
    expect(demo().getAttribute('src')).not.toContain('-loop');
    expect(demo()).toHaveAttribute('data-playing', 'false');
    expect(screen.getByTestId('demo-pause')).toHaveTextContent('Play');
    fireEvent.click(screen.getByTestId('demo-pause'));
    expect(demo().getAttribute('src')).toContain('-loop.svg');
  });

  it('starts the diagram still under reduced motion, with Play', () => {
    mockReducedMotion(true);
    render(<ExerciseDemo exercise={pullApart} />);
    expect(screen.getByTestId('exercise-demo').getAttribute('src')).not.toContain('-loop');
    expect(screen.getByTestId('demo-pause')).toHaveTextContent('Play');
  });

  it('pauses the lifter’s own GIF on its first frame in How to, and starts there under reduced motion', () => {
    const { unmount } = render(
      <ExerciseDemo exercise={bench} customMedia={movingGif} onPickFile={vi.fn()} />,
    );
    // Moving, it loops for good whatever its file says (the phone review).
    expect(screen.getByTestId('custom-demo').getAttribute('src')).toBe(
      loopingImage(movingGif.dataUrl),
    );
    fireEvent.click(screen.getByTestId('demo-pause'));
    expect(screen.getByTestId('custom-demo').getAttribute('src')).toBe('blob:first-frame');
    expect(screen.getByTestId('demo-pause')).toHaveTextContent('Play');
    unmount();
    mockReducedMotion(true);
    render(<ExerciseDemo exercise={bench} customMedia={movingGif} />);
    expect(screen.getByTestId('custom-demo').getAttribute('src')).toBe('blob:first-frame');
    expect(screen.getByTestId('demo-pause')).toHaveTextContent('Play');
  });

  it('offers no Pause for a photo of the lifter’s own, which does not move', () => {
    render(<ExerciseDemo exercise={bench} customMedia={gif} onPickFile={vi.fn()} />);
    expect(screen.getByTestId('custom-demo').getAttribute('src')).toBe(gif.dataUrl);
    expect(screen.queryByTestId('demo-pause')).toBeNull();
  });

  it('pauses the lifter’s own video in How to, even where it can be replaced', () => {
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    render(<ExerciseDemo exercise={bench} customMedia={ownVideo} onPickFile={vi.fn()} />);
    const video = screen.getByTestId('custom-demo');
    expect(video.tagName).toBe('VIDEO');
    expect(video).toHaveAttribute('data-playing', 'true');
    pause.mockClear();
    fireEvent.click(screen.getByTestId('demo-pause'));
    expect(pause).toHaveBeenCalled();
    expect(screen.getByTestId('custom-demo')).toHaveAttribute('data-playing', 'false');
    expect(screen.getByTestId('demo-pause')).toHaveTextContent('Play');
  });

  it('keeps focus on its button when Play cannot load the clip, offers Try again, and plays it', async () => {
    mockReducedMotion(true);
    let answer: 'offline' | 'ok' = 'offline';
    const fetched: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        fetched.push(url);
        if (answer === 'offline') throw new TypeError('Failed to fetch');
        return { ok: true, status: 200, blob: async () => new Blob(['mp4']) };
      }),
    );
    render(<ExerciseDemo exercise={bench} />);
    const button = screen.getByTestId('demo-play');
    button.focus();
    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() => expect(screen.getByTestId('demo-play')).toHaveTextContent('Try again'));
    expect(document.activeElement).toBe(screen.getByTestId('demo-play'));
    expect(screen.getByTestId('demo-play')).toHaveAttribute('aria-disabled', 'false');
    answer = 'ok';
    await act(async () => {
      fireEvent.click(screen.getByTestId('demo-play'));
    });
    await waitFor(() => expect(screen.getByTestId('exercise-demo').tagName).toBe('VIDEO'));
    expect(fetched).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByTestId('demo-pause'));
  });

  it('keeps focus on Try again through a retry made on its own back online, then hands it to Pause (the re-check)', async () => {
    let answer: 'offline' | 'held' = 'offline';
    let arrive!: () => void;
    const held = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (answer === 'offline') throw new TypeError('Failed to fetch');
        await held;
        return { ok: true, status: 200, blob: async () => new Blob(['mp4']) };
      }),
    );
    const listens = vi.spyOn(window, 'addEventListener');
    render(<ExerciseDemo exercise={bench} />);
    await waitFor(() => expect(screen.getByTestId('demo-play')).toHaveTextContent('Try again'));
    await untilListeningForOnline(listens);
    act(() => {
      screen.getByTestId('demo-play').focus();
    });
    answer = 'held';
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByTestId('demo-play')).toHaveTextContent('Loading…');
    expect(document.activeElement).toBe(screen.getByTestId('demo-play'));
    await act(async () => {
      arrive();
    });
    await waitFor(() => expect(screen.getByTestId('exercise-demo').tagName).toBe('VIDEO'));
    expect(document.activeElement).toBe(screen.getByTestId('demo-pause'));
  });

  it('never takes the focus for a clip that comes after the lifter has moved on (second re-check)', async () => {
    mockReducedMotion(true);
    let answer: 'offline' | 'ok' = 'offline';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (answer === 'offline') throw new TypeError('Failed to fetch');
        return { ok: true, status: 200, blob: async () => new Blob(['mp4']) };
      }),
    );
    const listens = vi.spyOn(window, 'addEventListener');
    render(
      <>
        <ExerciseDemo exercise={bench} />
        <button type="button">Further down</button>
      </>,
    );
    const play = screen.getByTestId('demo-play');
    act(() => {
      play.focus();
    });
    await act(async () => {
      fireEvent.click(play);
    });
    await waitFor(() => expect(screen.getByTestId('demo-play')).toHaveTextContent('Try again'));
    await untilListeningForOnline(listens);
    // The lifter reads on.
    const elsewhere = screen.getByRole('button', { name: 'Further down' });
    act(() => {
      elsewhere.focus();
    });
    answer = 'ok';
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(screen.getByTestId('exercise-demo').tagName).toBe('VIDEO'));
    expect(document.activeElement).toBe(elsewhere);
  });

  it('never takes the focus after a press that did not focus the button, as Safari presses (third re-check)', async () => {
    mockReducedMotion(true);
    let arrive!: () => void;
    const hold = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    mockClips('ok', hold);
    render(
      <>
        <ExerciseDemo exercise={bench} />
        <input aria-label="Rep range low" />
      </>,
    );
    // The press leaves the focus where it was.
    await act(async () => {
      fireEvent.click(screen.getByTestId('demo-play'));
    });
    const field = screen.getByRole('textbox', { name: 'Rep range low' });
    act(() => {
      field.focus();
    });
    await act(async () => {
      arrive();
    });
    await waitFor(() => expect(screen.getByTestId('exercise-demo').tagName).toBe('VIDEO'));
    expect(document.activeElement).toBe(field);
  });

  it('offers Try again when the clip cannot load without reduced motion too', async () => {
    mockClips('missing');
    render(<ExerciseDemo exercise={bench} />);
    await waitFor(() => expect(screen.getByTestId('demo-play')).toHaveTextContent('Try again'));
  });
});
