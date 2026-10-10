import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Profiler, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { CustomMedia } from '../../core/validation/customExercise';
import { Sheet } from '../Sheet/Sheet';
import { ExerciseDemo, ExerciseThumb } from './ExerciseMedia';

/**
 * Maintenance 25, the phone review: the workout card's demonstration moved for five seconds, then
 * rested on its still and stayed there, even when its exercise came back in front. It now loops
 * for as long as its exercise is in front, rests where it is out of view, in the background or
 * under a sheet, and plays on once it is back; it rests on its still only under reduced motion.
 * Maintenance 26, item 50: no demonstration has a Pause, and How to sets the lifter's own GIF.
 */

const bench = requireExercise('barbell-bench-press');
const incline = requireExercise('incline-dumbbell-press');
/** An exercise with no licensed demonstration: its diagram loops. */
const pullApart = requireExercise('band-pull-apart');
const ownVideo: CustomMedia = {
  id: bench.id,
  exerciseId: bench.id,
  kind: 'video',
  mimeType: 'video/mp4',
  sizeBytes: 4,
  dataUrl: 'data:video/mp4;base64,AAAA',
  source: 'user',
  createdAt: '2026-09-04T12:00:00.000Z',
};

let plays = 0;
let refusePlay = false;
/** Plays cut short by a pause (AbortError) still to come. */
let cutShort = 0;
let visibility: DocumentVisibilityState = 'visible';
let blobs = 0;
const revoked = new Set<string>();

interface Watch {
  callback: IntersectionObserverCallback;
  elements: Set<Element>;
}
const watches: Watch[] = [];

function tell(element: Element, isIntersecting: boolean) {
  for (const watch of watches) {
    if (!watch.elements.has(element)) continue;
    const entry = { isIntersecting, target: element } as unknown as IntersectionObserverEntry;
    watch.callback([entry], {} as IntersectionObserver);
  }
}

/**
 * jsdom has no IntersectionObserver. This one, as a browser's does, sends its first entry soon
 * after it starts watching (in view, here), and is told by hand when the card leaves or comes back.
 */
class FakeIntersectionObserver {
  readonly watch: Watch;
  constructor(callback: IntersectionObserverCallback) {
    this.watch = { callback, elements: new Set() };
    watches.push(this.watch);
  }
  observe(element: Element) {
    this.watch.elements.add(element);
    queueMicrotask(() => {
      if (!this.watch.elements.has(element)) return;
      const entry = {
        isIntersecting: true,
        target: element,
      } as unknown as IntersectionObserverEntry;
      this.watch.callback([entry], {} as IntersectionObserver);
    });
  }
  unobserve(element: Element) {
    this.watch.elements.delete(element);
  }
  disconnect() {
    this.watch.elements.clear();
  }
  takeRecords() {
    return [];
  }
}

/** The page is sent to the background or brought back, as the phone does when switching apps. */
function pageBecomes(state: DocumentVisibilityState) {
  visibility = state;
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

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

/** The card's clip, once it has arrived and the app has started it. */
async function cardClip(): Promise<HTMLVideoElement> {
  const clip = await waitFor(() => {
    const found = screen.getByTestId('exercise-thumb');
    if (!(found instanceof HTMLVideoElement)) throw new Error('still the still');
    return found;
  });
  await act(async () => {
    await Promise.resolve();
  });
  return clip;
}

/** How to's clip, once the app has started it. */
async function playingHowToClip(): Promise<HTMLVideoElement> {
  const clip = await howToClip();
  await waitFor(() => expect(clip.paused).toBe(false));
  return clip;
}

/** How to's clip, once it has arrived. */
function howToClip(): Promise<HTMLVideoElement> {
  return waitFor(() => {
    const found = screen.getByTestId('exercise-demo');
    if (!(found instanceof HTMLVideoElement)) throw new Error('still the still');
    return found;
  });
}

beforeEach(() => {
  plays = 0;
  refusePlay = false;
  cutShort = 0;
  visibility = 'visible';
  blobs = 0;
  revoked.clear();
  watches.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(['mp4'], { type: 'video/mp4' }),
    })),
  );
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  URL.createObjectURL = vi.fn(() => {
    blobs += 1;
    return `blob:clip-${blobs}`;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.add(url);
  });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    const playing = !this.paused;
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
    // As a browser does: a clip that was playing tells of its pause in a task of its own, after.
    if (playing) setTimeout(() => this.dispatchEvent(new Event('pause')), 0);
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    plays += 1;
    if (refusePlay) return Promise.reject(new DOMException('refused', 'NotAllowedError'));
    if (cutShort > 0) {
      cutShort -= 1;
      return Promise.reject(new DOMException('cut short', 'AbortError'));
    }
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    return Promise.resolve();
  });
});

afterEach(() => {
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(window, 'matchMedia');
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the card keeps its demonstration moving', () => {
  it('loops on the card minute after minute, never resting on a still', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExerciseThumb exercise={bench} size="large" />);
    const clip = await cardClip();
    for (let minute = 1; minute <= 10; minute += 1) {
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.getByTestId('exercise-thumb')).toBe(clip);
      expect(clip).toHaveAttribute('loop');
      expect(clip).toHaveAttribute('data-animated', 'true');
      expect(clip.paused).toBe(false);
    }
  });

  it('moves again when its exercise comes back in front, after any time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { rerender } = render(<ExerciseThumb exercise={bench} size="large" />);
    await cardClip();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    // Another exercise in front: this card shows its still meanwhile.
    rerender(<ExerciseThumb exercise={bench} size="large" play={false} />);
    expect(screen.getByTestId('exercise-thumb').tagName).toBe('IMG');
    rerender(<ExerciseThumb exercise={bench} size="large" />);
    const again = await cardClip();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('exercise-thumb')).toBe(again);
    expect(again).toHaveAttribute('data-animated', 'true');
    expect(again.paused).toBe(false);
  });

  it('never shows the clip from an address already freed when it comes back', async () => {
    const { rerender } = render(<ExerciseThumb exercise={bench} size="large" />);
    await cardClip();
    rerender(<ExerciseThumb exercise={bench} size="large" play={false} />);
    expect(revoked.size).toBe(1);
    rerender(<ExerciseThumb exercise={bench} size="large" />);
    // At once, and once the clip is back: never on a freed address.
    const now = screen.getByTestId('exercise-thumb');
    expect(now instanceof HTMLVideoElement && revoked.has(now.getAttribute('src') ?? '')).toBe(
      false,
    );
    const again = await cardClip();
    expect(revoked.has(again.getAttribute('src') ?? '')).toBe(false);
  });

  it('is started as it comes into view, rests out of view, and plays on when it is back', async () => {
    render(<ExerciseThumb exercise={bench} size="large" />);
    const clip = await cardClip();
    expect(clip.paused).toBe(false);
    act(() => tell(clip, false));
    expect(clip.paused).toBe(true);
    act(() => tell(clip, true));
    expect(clip.paused).toBe(false);
    // The latest of several entries decides.
    act(() => {
      for (const watch of watches) {
        if (!watch.elements.has(clip)) continue;
        const entries = [true, false].map(
          (isIntersecting) =>
            ({ isIntersecting, target: clip }) as unknown as IntersectionObserverEntry,
        );
        watch.callback(entries, {} as IntersectionObserver);
      }
    });
    expect(clip.paused).toBe(true);
  });

  it('rests while the page is away and plays on when it is back, again and again', async () => {
    render(<ExerciseThumb exercise={bench} size="large" />);
    const clip = await cardClip();
    // Playing already: nothing to do.
    const playing = plays;
    pageBecomes('visible');
    expect(plays).toBe(playing);
    for (let round = 0; round < 3; round += 1) {
      pageBecomes('hidden');
      expect(clip.paused).toBe(true);
      pageBecomes('visible');
      expect(clip.paused).toBe(false);
    }
  });

  it('plays on after the browser froze the page, and after the back-forward cache', async () => {
    render(<ExerciseThumb exercise={bench} size="large" />);
    const clip = await cardClip();
    // A frozen page's media is paused by the browser, and nothing plays it on but the app.
    clip.pause();
    act(() => {
      document.dispatchEvent(new Event('resume'));
    });
    expect(clip.paused).toBe(false);
    clip.pause();
    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });
    expect(clip.paused).toBe(false);
  });

  it('rests where it is under a sheet, and plays on once the sheet closes', async () => {
    const { rerender } = render(
      <>
        <ExerciseThumb exercise={bench} size="large" />
        <Sheet open={false} title="Options" onClose={vi.fn()}>
          <p>Options</p>
        </Sheet>
      </>,
    );
    const clip = await cardClip();
    rerender(
      <>
        <ExerciseThumb exercise={bench} size="large" />
        <Sheet open title="Options" onClose={vi.fn()}>
          <p>Options</p>
        </Sheet>
      </>,
    );
    // The same element, paused where it was: no still, no reload.
    expect(screen.getByTestId('exercise-thumb')).toBe(clip);
    expect(clip.paused).toBe(true);
    rerender(
      <>
        <ExerciseThumb exercise={bench} size="large" />
        <Sheet open={false} title="Options" onClose={vi.fn()}>
          <p>Options</p>
        </Sheet>
      </>,
    );
    expect(screen.getByTestId('exercise-thumb')).toBe(clip);
    expect(clip.paused).toBe(false);
  });

  it("keeps the lifter's own video looping on the card, and plays it on when the page comes back", async () => {
    render(<ExerciseThumb exercise={bench} size="large" customMedia={ownVideo} />);
    const own = screen.getByTestId('exercise-thumb');
    if (!(own instanceof HTMLVideoElement)) throw new Error('not a video');
    await act(async () => {
      await Promise.resolve();
    });
    expect(own).toHaveAttribute('loop');
    expect(own).toHaveAttribute('data-animated', 'true');
    pageBecomes('hidden');
    expect(own.paused).toBe(true);
    pageBecomes('visible');
    expect(own.paused).toBe(false);
  });

  it("rests the lifter's own video where it is under a sheet, and plays it on once it closes", async () => {
    const view = (open: boolean) => (
      <>
        <ExerciseThumb exercise={bench} size="large" customMedia={ownVideo} />
        <Sheet open={open} title="Options" onClose={vi.fn()}>
          <p>Options</p>
        </Sheet>
      </>
    );
    const { rerender } = render(view(false));
    const own = screen.getByTestId('exercise-thumb');
    if (!(own instanceof HTMLVideoElement)) throw new Error('not a video');
    await act(async () => {
      await Promise.resolve();
    });
    expect(own.paused).toBe(false);
    rerender(view(true));
    expect(screen.getByTestId('exercise-thumb')).toBe(own);
    expect(own.paused).toBe(true);
    rerender(view(false));
    expect(own.paused).toBe(false);
  });

  it('leaves a clip the browser will not play as it is', async () => {
    render(<ExerciseThumb exercise={bench} size="large" />);
    const clip = await cardClip();
    refusePlay = true;
    pageBecomes('hidden');
    pageBecomes('visible');
    await act(async () => {
      await Promise.resolve();
    });
    expect(clip.paused).toBe(true);
    expect(clip).toHaveAttribute('data-animated', 'true');
  });

  it('stays still under reduced motion, and plays nothing when the page comes back', () => {
    mockReducedMotion(true);
    render(<ExerciseThumb exercise={bench} size="large" />);
    expect(screen.getByTestId('exercise-thumb').tagName).toBe('IMG');
    pageBecomes('hidden');
    pageBecomes('visible');
    expect(plays).toBe(0);
  });
});

describe('How to has no Pause (Maintenance 26, item 50)', () => {
  it('loops its clip with Slow alone, while the card loops beside it', async () => {
    render(
      <>
        <ExerciseThumb exercise={bench} size="large" />
        <ExerciseDemo exercise={bench} />
      </>,
    );
    const card = await cardClip();
    const demo = await playingHowToClip();
    expect(screen.queryByRole('button', { name: /pause/i })).toBeNull();
    expect(screen.queryByTestId('demo-play')).toBeNull();
    expect(screen.getByTestId('demo-slow')).toBeInTheDocument();
    expect(card).toHaveAttribute('data-animated', 'true');
    expect(demo).toHaveAttribute('data-playing', 'true');
  });

  it('a tap on the clip pauses nothing', async () => {
    render(<ExerciseDemo exercise={bench} />);
    const demo = await playingHowToClip();
    fireEvent.click(demo);
    expect(demo.paused).toBe(false);
  });

  it("plays How to's clip on when the page comes back", async () => {
    render(<ExerciseDemo exercise={bench} />);
    const demo = await howToClip();
    await act(async () => {
      await Promise.resolve();
    });
    expect(demo.paused).toBe(false);
    pageBecomes('hidden');
    expect(demo.paused).toBe(true);
    pageBecomes('visible');
    expect(demo.paused).toBe(false);
  });

  it("plays How to's own video on when the page comes back", async () => {
    render(<ExerciseDemo exercise={bench} customMedia={ownVideo} />);
    const own = screen.getByTestId('custom-demo');
    if (!(own instanceof HTMLVideoElement)) throw new Error('not a video');
    await act(async () => {
      await Promise.resolve();
    });
    expect(own.paused).toBe(false);
    pageBecomes('hidden');
    expect(own.paused).toBe(true);
    pageBecomes('visible');
    expect(own.paused).toBe(false);
  });

  it('offers Play only when the browser refuses the clip, and Play plays it', async () => {
    refusePlay = true;
    render(<ExerciseDemo exercise={bench} />);
    const demo = await howToClip();
    await waitFor(() => expect(screen.getByTestId('demo-play')).toHaveTextContent('Play'));
    expect(demo).toHaveAttribute('data-playing', 'false');
    refusePlay = false;
    await act(async () => {
      fireEvent.click(screen.getByTestId('demo-play'));
      await Promise.resolve();
    });
    expect(demo.paused).toBe(false);
    expect(screen.queryByTestId('demo-play')).toBeNull();
  });

  it('takes a play cut short by a pause for no refusal: no Play, and it plays on (the re-check)', async () => {
    // The play that starts the clip is the one cut short (a pause as it loaded out of view).
    cutShort = 1;
    render(<ExerciseDemo exercise={bench} />);
    const demo = await howToClip();
    await act(async () => {
      await Promise.resolve();
    });
    expect(cutShort).toBe(0);
    expect(screen.queryByTestId('demo-play')).toBeNull();
    expect(demo).toHaveAttribute('data-playing', 'true');
    // Back in view or on the page, it plays.
    pageBecomes('hidden');
    pageBecomes('visible');
    expect(demo.paused).toBe(false);
  });

  it('leaves a How to clip rested out of view as it loads rested when its metadata comes (the third re-check)', async () => {
    render(<ExerciseDemo exercise={bench} />);
    const demo = await howToClip();
    await act(async () => {
      await Promise.resolve();
    });
    // Nothing but the app starts it: no autoplay.
    expect(demo).not.toHaveAttribute('autoplay');
    // Scrolled down to the steps while it loaded: rested out of view.
    act(() => tell(demo, false));
    expect(demo.paused).toBe(true);
    const before = plays;
    await act(async () => {
      fireEvent.loadedMetadata(demo);
      await Promise.resolve();
    });
    expect(plays).toBe(before);
    expect(demo.paused).toBe(true);
    act(() => tell(demo, true));
    expect(demo.paused).toBe(false);
  });

  it('loops a diagram with no button; under reduced motion it waits on its still with Play, which lets it move', () => {
    const { unmount } = render(<ExerciseDemo exercise={pullApart} />);
    expect(screen.getByTestId('exercise-demo').getAttribute('src')).toContain('-loop.svg');
    expect(screen.queryByTestId('demo-play')).toBeNull();
    expect(screen.queryByRole('button', { name: /pause/i })).toBeNull();
    unmount();
    mockReducedMotion(true);
    render(<ExerciseDemo exercise={pullApart} />);
    expect(screen.getByTestId('exercise-demo').getAttribute('src')).not.toContain('-loop');
    fireEvent.click(screen.getByTestId('demo-play'));
    expect(screen.getByTestId('exercise-demo').getAttribute('src')).toContain('-loop.svg');
    expect(screen.queryByTestId('demo-play')).toBeNull();
  });

  it('plays the clip when Play is pressed under reduced motion, with nothing to pause it', async () => {
    mockReducedMotion(true);
    render(<ExerciseDemo exercise={bench} />);
    fireEvent.click(screen.getByTestId('demo-play'));
    const demo = await howToClip();
    await act(async () => {
      await Promise.resolve();
    });
    expect(demo.paused).toBe(false);
    expect(screen.queryByRole('button', { name: /pause/i })).toBeNull();
    expect(screen.getByTestId('demo-slow')).toBeInTheDocument();
  });

  it("offers Play when the browser refuses the lifter's own video in How to, and Play plays it", async () => {
    refusePlay = true;
    render(<ExerciseDemo exercise={bench} customMedia={ownVideo} />);
    const own = screen.getByTestId('custom-demo');
    // Nothing but the app starts it: no autoplay.
    expect(own).not.toHaveAttribute('autoplay');
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('demo-play')).toHaveTextContent('Play');
    expect(own).toHaveAttribute('data-playing', 'false');
    refusePlay = false;
    await act(async () => {
      fireEvent.click(screen.getByTestId('demo-play'));
      await Promise.resolve();
    });
    expect(own).toHaveAttribute('data-playing', 'true');
    expect(screen.queryByTestId('demo-play')).toBeNull();
  });

  it("leaves the lifter's own video moving in How to when its play is cut short", async () => {
    cutShort = 1;
    render(<ExerciseDemo exercise={bench} customMedia={ownVideo} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('demo-play')).toBeNull();
    expect(screen.getByTestId('custom-demo')).toHaveAttribute('data-playing', 'true');
  });
});

describe("the lifter's own GIF, set from How to (Maintenance 26, item 50)", () => {
  it('a tap on the demonstration, or on Your GIF, opens the picker, and a file picked is given over', () => {
    const picked: File[] = [];
    const opened = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(<ExerciseDemo exercise={pullApart} onPickFile={(file) => picked.push(file)} />);
    expect(screen.getByTestId('demo-credit')).toHaveTextContent(
      'Diagram · tap it to use your own GIF',
    );
    fireEvent.click(screen.getByTestId('demo-pick'));
    fireEvent.click(screen.getByTestId('demo-your-gif'));
    expect(opened).toHaveBeenCalledTimes(2);
    const file = new File(['GIF89a'], 'mine.gif', { type: 'image/gif' });
    fireEvent.change(screen.getByTestId('demo-file-input'), { target: { files: [file] } });
    expect(picked).toEqual([file]);
  });

  it('the clip itself opens the picker, and Slow beside it never does', async () => {
    const opened = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(<ExerciseDemo exercise={bench} onPickFile={() => undefined} />);
    const demo = await playingHowToClip();
    expect(demo.closest('[data-testid="demo-pick"]')).not.toBeNull();
    fireEvent.click(screen.getByTestId('demo-pick'));
    expect(opened).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('demo-slow'));
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("the lifter's own demonstration offers Replace and Remove", () => {
    const removed: string[] = [];
    const opened = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(
      <ExerciseDemo
        exercise={bench}
        customMedia={ownVideo}
        onPickFile={() => undefined}
        onRemove={() => {
          removed.push('removed');
        }}
      />,
    );
    fireEvent.click(screen.getByTestId('demo-replace'));
    expect(opened).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('demo-remove'));
    expect(removed).toEqual(['removed']);
  });
});

/** The browser stops a clip as it plays (a saver): no one here asked for it. */
async function browserStops(clip: HTMLVideoElement) {
  act(() => {
    Object.defineProperty(clip, 'paused', { configurable: true, value: true });
    clip.dispatchEvent(new Event('pause'));
  });
  // It is judged again a frame later.
  await frameDrawn();
}

/** A frame has been drawn (or the moment that stands in for one). */
async function frameDrawn() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

describe('How to after the review of item 50', () => {
  it('offers Play when the browser stops the clip as it plays, and Play plays it', async () => {
    render(<ExerciseDemo exercise={bench} />);
    const demo = await playingHowToClip();
    await browserStops(demo);
    expect(screen.getByTestId('demo-play')).toHaveTextContent('Play');
    expect(demo).toHaveAttribute('data-playing', 'false');
    await act(async () => {
      fireEvent.click(screen.getByTestId('demo-play'));
      await Promise.resolve();
    });
    expect(demo.paused).toBe(false);
    expect(screen.queryByTestId('demo-play')).toBeNull();
  });

  it("offers Play when the browser stops the lifter's own video as it plays", async () => {
    render(<ExerciseDemo exercise={bench} customMedia={ownVideo} />);
    const own = screen.getByTestId('custom-demo');
    if (!(own instanceof HTMLVideoElement)) throw new Error('not a video');
    await waitFor(() => expect(own.paused).toBe(false));
    await browserStops(own);
    expect(screen.getByTestId('demo-play')).toHaveTextContent('Play');
  });

  it('takes its own pauses for no refusal: out of view, in the background, and undone before they are told', async () => {
    render(<ExerciseDemo exercise={bench} />);
    const demo = await playingHowToClip();
    act(() => tell(demo, false));
    // A pause is judged again a frame after it is told (the re-check of item 50).
    await frameDrawn();
    expect(screen.queryByTestId('demo-play')).toBeNull();
    act(() => tell(demo, true));
    expect(demo.paused).toBe(false);
    pageBecomes('hidden');
    await frameDrawn();
    expect(screen.queryByTestId('demo-play')).toBeNull();
    pageBecomes('visible');
    expect(demo.paused).toBe(false);
    // Out of view and straight back, before the pause is told: playing again by then.
    act(() => {
      tell(demo, false);
      tell(demo, true);
    });
    await frameDrawn();
    expect(screen.queryByTestId('demo-play')).toBeNull();
    expect(demo.paused).toBe(false);
  });

  it('takes a pause told as the clip leaves the page for no refusal', async () => {
    render(<ExerciseDemo exercise={bench} />);
    const demo = await playingHowToClip();
    const stage = demo.parentElement;
    // The browser pauses a clip taken off the page, and tells of it after.
    act(() => {
      demo.remove();
    });
    await browserStops(demo);
    expect(screen.queryByTestId('demo-play')).toBeNull();
    expect(stage).not.toBeNull();
  });

  it("holds a refusal to the lifter's own video it was for: another picked plays", async () => {
    refusePlay = true;
    const { rerender } = render(<ExerciseDemo exercise={pullApart} customMedia={ownVideo} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('demo-play')).toHaveTextContent('Play');
    refusePlay = false;
    const another: CustomMedia = { ...ownVideo, createdAt: '2026-10-08T12:00:00.000Z' };
    rerender(<ExerciseDemo exercise={pullApart} customMedia={another} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('demo-play')).toBeNull();
    expect(screen.getByTestId('custom-demo')).toHaveAttribute('data-playing', 'true');
  });

  it("holds a refusal to the lifter's own video it was for: removed, the diagram loops", async () => {
    refusePlay = true;
    const { rerender } = render(<ExerciseDemo exercise={pullApart} customMedia={ownVideo} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('demo-play')).toHaveTextContent('Play');
    rerender(<ExerciseDemo exercise={pullApart} />);
    expect(screen.getByTestId('exercise-demo').getAttribute('src')).toContain('-loop.svg');
    expect(screen.queryByTestId('demo-play')).toBeNull();
  });

  it('hands the focus to Slow after Play on a clip the browser refused', async () => {
    refusePlay = true;
    render(<ExerciseDemo exercise={bench} />);
    await howToClip();
    await waitFor(() => expect(screen.getByTestId('demo-play')).toBeInTheDocument());
    refusePlay = false;
    const play = screen.getByTestId('demo-play');
    act(() => {
      play.focus();
    });
    await act(async () => {
      fireEvent.click(play);
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(screen.getByTestId('demo-slow'));
  });

  it('hands the focus to the picture after Play over it, never to its picker', () => {
    mockReducedMotion(true);
    const { unmount } = render(<ExerciseDemo exercise={pullApart} onPickFile={vi.fn()} />);
    const play = screen.getByTestId('demo-play');
    act(() => {
      play.focus();
    });
    fireEvent.click(play);
    // The frame around the picker: a second Enter opens nothing (the re-check of item 50).
    const frame = screen.getByTestId('demo-pick').parentElement;
    expect(document.activeElement).toBe(frame);
    expect(frame).toHaveAttribute('tabindex', '-1');
    unmount();
    render(<ExerciseDemo exercise={pullApart} />);
    const plain = screen.getByTestId('demo-play');
    act(() => {
      plain.focus();
    });
    fireEvent.click(plain);
    const picture = screen.getByTestId('exercise-demo').parentElement;
    expect(document.activeElement).toBe(picture);
    expect(picture).toHaveAttribute('tabindex', '-1');
  });

  it('moves no focus after a press that did not focus Play, as Safari presses', () => {
    mockReducedMotion(true);
    render(<ExerciseDemo exercise={pullApart} onPickFile={vi.fn()} />);
    fireEvent.click(screen.getByTestId('demo-play'));
    expect(document.activeElement).toBe(document.body);
  });

  it('names the picture that picks: what it shows and what it does; its file input is no stop', () => {
    const { rerender } = render(<ExerciseDemo exercise={pullApart} onPickFile={vi.fn()} />);
    expect(screen.getByTestId('demo-pick')).toHaveAccessibleName(
      `${pullApart.name} demonstration. Use your own GIF, photo, or video`,
    );
    const input = screen.getByTestId('demo-file-input');
    expect(input).toHaveAttribute('tabindex', '-1');
    expect(input).toHaveAttribute('aria-hidden', 'true');
    rerender(<ExerciseDemo exercise={pullApart} customMedia={ownVideo} onPickFile={vi.fn()} />);
    expect(screen.getByTestId('demo-pick')).toHaveAccessibleName(
      `${pullApart.name}, your demonstration. Replace your demonstration`,
    );
  });
});

describe("a video of the lifter's own replaced on the same element (the fourth re-check)", () => {
  const replaced: CustomMedia = {
    ...ownVideo,
    dataUrl: 'data:video/mp4;base64,BBBB',
    sizeBytes: 5,
    createdAt: '2026-10-03T12:00:00.000Z',
  };

  it('plays on in How to', async () => {
    const { rerender } = render(<ExerciseDemo exercise={bench} customMedia={ownVideo} />);
    const own = screen.getByTestId('custom-demo');
    if (!(own instanceof HTMLVideoElement)) throw new Error('not a video');
    await act(async () => {
      await Promise.resolve();
    });
    expect(own.paused).toBe(false);
    // A new source pauses the element as the browser loads it.
    own.pause();
    rerender(<ExerciseDemo exercise={bench} customMedia={replaced} />);
    expect(screen.getByTestId('custom-demo')).toBe(own);
    expect(own.paused).toBe(false);
  });

  it('plays on on the card', async () => {
    const { rerender } = render(
      <ExerciseThumb exercise={bench} size="large" customMedia={ownVideo} />,
    );
    const own = screen.getByTestId('exercise-thumb');
    if (!(own instanceof HTMLVideoElement)) throw new Error('not a video');
    await act(async () => {
      await Promise.resolve();
    });
    expect(own.paused).toBe(false);
    own.pause();
    rerender(<ExerciseThumb exercise={bench} size="large" customMedia={replaced} />);
    expect(screen.getByTestId('exercise-thumb')).toBe(own);
    expect(own.paused).toBe(false);
  });
});

describe('the sheets and the rows (the re-check)', () => {
  it('renders no list row again when a sheet opens or closes', () => {
    let commits = 0;
    const view = (open: boolean) => (
      <>
        <Profiler id="rows" onRender={() => (commits += 1)}>
          <ExerciseThumb exercise={bench} />
          <ExerciseThumb exercise={incline} />
          {/* The workout's other cards: large, but not the one under way. */}
          <ExerciseThumb exercise={pullApart} size="large" play={false} />
        </Profiler>
        <Sheet open={open} title="Options" onClose={vi.fn()}>
          <p>Options</p>
        </Sheet>
      </>
    );
    const { rerender } = render(view(false));
    const before = commits;
    rerender(view(true));
    rerender(view(false));
    // The rows' own parent rendering them again counts once per rerender; the sheets add nothing.
    expect(commits - before).toBe(2);
  });
});

describe('the card under an open sheet (the re-check)', () => {
  const withSheet = (open: boolean, thumb: ReactElement) => (
    <>
      {thumb}
      <Sheet open={open} title="How to" onClose={vi.fn()}>
        <p>How to</p>
      </Sheet>
    </>
  );

  it('leaves a clip that arrives under an open sheet still, and plays it once the sheet closes', async () => {
    const thumb = <ExerciseThumb exercise={bench} size="large" />;
    const { rerender } = render(withSheet(true, thumb));
    const clip = await waitFor(() => {
      const found = screen.getByTestId('exercise-thumb');
      if (!(found instanceof HTMLVideoElement)) throw new Error('still the still');
      return found;
    });
    await act(async () => {
      await Promise.resolve();
    });
    // Nothing starts it: no autoplay, and the app does not play it under the sheet.
    expect(clip).not.toHaveAttribute('autoplay');
    expect(plays).toBe(0);
    expect(clip.paused).toBe(true);
    rerender(withSheet(false, thumb));
    expect(clip.paused).toBe(false);
  });

  it("leaves the lifter's own video still when it moves again under an open sheet", async () => {
    const view = (open: boolean, play: boolean) => (
      <>
        <ExerciseThumb exercise={bench} size="large" customMedia={ownVideo} play={play} />
        <Sheet open={open} title="How to" onClose={vi.fn()}>
          <p>How to</p>
        </Sheet>
      </>
    );
    const { rerender } = render(view(true, false));
    await act(async () => {
      await Promise.resolve();
    });
    // Its exercise comes back in front under the sheet: a new element, still until it closes.
    rerender(view(true, true));
    const moving = screen.getByTestId('exercise-thumb');
    if (!(moving instanceof HTMLVideoElement)) throw new Error('not a video');
    expect(moving).toHaveAttribute('data-animated', 'true');
    expect(moving).not.toHaveAttribute('autoplay');
    await act(async () => {
      await Promise.resolve();
    });
    expect(moving.paused).toBe(true);
    rerender(view(false, true));
    expect(moving.paused).toBe(false);
  });
});

describe('How to after the re-check of item 50', () => {
  it('takes a pause the browser makes as the page hides for no refusal, though the page read visible', async () => {
    render(<ExerciseDemo exercise={bench} />);
    const demo = await playingHowToClip();
    // The browser stops the clip as the page goes, and says so before the page reads hidden.
    act(() => {
      Object.defineProperty(demo, 'paused', { configurable: true, value: true });
      demo.dispatchEvent(new Event('pause'));
    });
    visibility = 'hidden';
    await frameDrawn();
    // Back: the browser plays it on, and the page says it is in front.
    Object.defineProperty(demo, 'paused', { configurable: true, value: false });
    pageBecomes('visible');
    await frameDrawn();
    expect(screen.queryByTestId('demo-play')).toBeNull();
    expect(demo.paused).toBe(false);
  });

  it('keeps the focus on the bar through a removal: Your GIF takes it', async () => {
    const view = (media: CustomMedia | null, busy: boolean) => (
      <ExerciseDemo
        exercise={pullApart}
        customMedia={media}
        onPickFile={vi.fn()}
        onRemove={vi.fn()}
        busy={busy}
      />
    );
    const { rerender } = render(view(ownVideo, false));
    const remove = screen.getByTestId('demo-remove');
    act(() => {
      remove.focus();
    });
    fireEvent.click(remove);
    rerender(view(ownVideo, true));
    rerender(view(null, true));
    rerender(view(null, false));
    expect(document.activeElement).toBe(screen.getByTestId('demo-your-gif'));
  });

  it('gives the focus back to the bar when the browser drops it from a button disabled to save', () => {
    const view = (media: CustomMedia | null, busy: boolean) => (
      <ExerciseDemo
        exercise={pullApart}
        customMedia={media}
        onPickFile={vi.fn()}
        onRemove={vi.fn()}
        busy={busy}
      />
    );
    const { rerender } = render(view(ownVideo, false));
    const remove = screen.getByTestId('demo-remove');
    act(() => {
      remove.focus();
    });
    fireEvent.click(remove);
    rerender(view(ownVideo, true));
    // Chrome lets a focused button that is disabled lose the focus to the page (jsdom keeps it,
    // and will not blur a disabled button: a field that comes and goes leaves the page holding it).
    act(() => {
      const spot = document.createElement('input');
      document.body.append(spot);
      spot.focus();
      spot.remove();
    });
    expect(document.activeElement).toBe(document.body);
    // The save ends while the picture still shows (another exercise's is kept), then it goes.
    rerender(view(ownVideo, false));
    rerender(view(null, false));
    expect(document.activeElement).toBe(screen.getByTestId('demo-your-gif'));
  });

  it('gives the focus to the bar a frame later when a failed removal took the picture, nothing busy', async () => {
    let settle: (removed: boolean) => void = () => undefined;
    const onRemove = () =>
      new Promise<boolean>((resolve) => {
        settle = resolve;
      });
    const view = (media: CustomMedia | null) => (
      <ExerciseDemo
        exercise={pullApart}
        customMedia={media}
        onPickFile={vi.fn()}
        onRemove={onRemove}
      />
    );
    const { rerender } = render(view(ownVideo));
    const remove = screen.getByTestId('demo-remove');
    act(() => {
      remove.focus();
    });
    fireEvent.click(remove);
    // The picture went all the same, and the focus fell to the page.
    rerender(view(null));
    act(() => {
      const spot = document.createElement('input');
      document.body.append(spot);
      spot.focus();
      spot.remove();
    });
    await act(async () => {
      settle(false);
    });
    await frameDrawn();
    expect(document.activeElement).toBe(screen.getByTestId('demo-your-gif'));
  });

  it('reuses the bar through a pick: the focused Your GIF is the Replace that follows', () => {
    const { rerender } = render(<ExerciseDemo exercise={pullApart} onPickFile={vi.fn()} />);
    const yourGif = screen.getByTestId('demo-your-gif');
    act(() => {
      yourGif.focus();
    });
    rerender(<ExerciseDemo exercise={pullApart} customMedia={ownVideo} onPickFile={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByTestId('demo-replace'));
  });

  it('holds a Play to the media it was pressed for: another picked starts still', async () => {
    mockReducedMotion(true);
    const other: CustomMedia = { ...ownVideo, createdAt: '2026-10-08T12:00:00.000Z' };
    const { rerender } = render(<ExerciseDemo exercise={pullApart} customMedia={ownVideo} />);
    fireEvent.click(screen.getByTestId('demo-play'));
    expect(screen.getByTestId('custom-demo')).toHaveAttribute('data-playing', 'true');
    rerender(<ExerciseDemo exercise={pullApart} customMedia={other} />);
    expect(screen.getByTestId('custom-demo')).toHaveAttribute('data-playing', 'false');
    expect(screen.getByTestId('demo-play')).toBeInTheDocument();
    // Removed: the diagram waits on its still with its own Play.
    rerender(<ExerciseDemo exercise={pullApart} />);
    expect(screen.getByTestId('exercise-demo').getAttribute('src')).not.toContain('-loop');
  });
});
