import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Profiler, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { CustomMedia } from '../../core/validation/customExercise';
import { Sheet } from '../Sheet/Sheet';
import { demoHoldKey, holdDemo, isDemoHeld, releaseAllDemos } from './demoHold';
import { ExerciseDemo, ExerciseThumb } from './ExerciseMedia';

/**
 * Maintenance 25, the phone review: the workout card's demonstration moved for five seconds, then
 * rested on its still and stayed there, even when its exercise came back in front. It now loops
 * for as long as its exercise is in front, rests where it is out of view, in the background or
 * under a sheet, and plays on once it is back; it rests on its still only under reduced motion or
 * while the lifter has it paused in the workout's How to (the review of the fix: that pause holds
 * within the workout only).
 */

const bench = requireExercise('barbell-bench-press');
const incline = requireExercise('incline-dumbbell-press');
/** An exercise with no licensed demonstration: its diagram loops. */
const pullApart = requireExercise('band-pull-apart');
const KEY = demoHoldKey('session-1', 'entry-1', bench.id);
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

/** How to's clip, once the app has started it: a tap on its button is then a Pause. */
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
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
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
  releaseAllDemos();
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(window, 'matchMedia');
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the card keeps its demonstration moving', () => {
  it('loops on the card minute after minute, never resting on a still', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExerciseThumb exercise={bench} size="large" holdKey={KEY} />);
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
    const { rerender } = render(<ExerciseThumb exercise={bench} size="large" holdKey={KEY} />);
    await cardClip();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    // Another exercise in front: this card shows its still meanwhile.
    rerender(<ExerciseThumb exercise={bench} size="large" play={false} holdKey={KEY} />);
    expect(screen.getByTestId('exercise-thumb').tagName).toBe('IMG');
    rerender(<ExerciseThumb exercise={bench} size="large" holdKey={KEY} />);
    const again = await cardClip();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('exercise-thumb')).toBe(again);
    expect(again).toHaveAttribute('data-animated', 'true');
    expect(again.paused).toBe(false);
  });

  it('never shows the clip from an address already freed when it comes back', async () => {
    const { rerender } = render(<ExerciseThumb exercise={bench} size="large" holdKey={KEY} />);
    await cardClip();
    rerender(<ExerciseThumb exercise={bench} size="large" play={false} holdKey={KEY} />);
    expect(revoked.size).toBe(1);
    rerender(<ExerciseThumb exercise={bench} size="large" holdKey={KEY} />);
    // At once, and once the clip is back: never on a freed address.
    const now = screen.getByTestId('exercise-thumb');
    expect(now instanceof HTMLVideoElement && revoked.has(now.getAttribute('src') ?? '')).toBe(
      false,
    );
    const again = await cardClip();
    expect(revoked.has(again.getAttribute('src') ?? '')).toBe(false);
  });

  it('is started as it comes into view, rests out of view, and plays on when it is back', async () => {
    render(<ExerciseThumb exercise={bench} size="large" holdKey={KEY} />);
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
    render(<ExerciseThumb exercise={bench} size="large" holdKey={KEY} />);
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
    render(<ExerciseThumb exercise={bench} size="large" holdKey={KEY} />);
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
        <ExerciseThumb exercise={bench} size="large" holdKey={KEY} />
        <Sheet open={false} title="Options" onClose={vi.fn()}>
          <p>Options</p>
        </Sheet>
      </>,
    );
    const clip = await cardClip();
    rerender(
      <>
        <ExerciseThumb exercise={bench} size="large" holdKey={KEY} />
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
        <ExerciseThumb exercise={bench} size="large" holdKey={KEY} />
        <Sheet open={false} title="Options" onClose={vi.fn()}>
          <p>Options</p>
        </Sheet>
      </>,
    );
    expect(screen.getByTestId('exercise-thumb')).toBe(clip);
    expect(clip.paused).toBe(false);
  });

  it("keeps the lifter's own video looping on the card, and plays it on when the page comes back", async () => {
    render(<ExerciseThumb exercise={bench} size="large" customMedia={ownVideo} holdKey={KEY} />);
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
        <ExerciseThumb exercise={bench} size="large" customMedia={ownVideo} holdKey={KEY} />
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

  it("plays the lifter's own video on as its new element after a pause in How to is let go", async () => {
    render(
      <>
        <ExerciseThumb exercise={bench} size="large" customMedia={ownVideo} holdKey={KEY} />
        <ExerciseDemo exercise={bench} customMedia={ownVideo} holdKey={KEY} />
      </>,
    );
    const first = screen.getByTestId('exercise-thumb');
    fireEvent.click(screen.getByTestId('demo-pause'));
    expect(screen.getByTestId('exercise-thumb')).toHaveAttribute('data-animated', 'false');
    fireEvent.click(screen.getByTestId('demo-pause'));
    const moving = screen.getByTestId('exercise-thumb');
    if (!(moving instanceof HTMLVideoElement)) throw new Error('not a video');
    expect(moving).not.toBe(first);
    expect(moving).toHaveAttribute('data-animated', 'true');
    await act(async () => {
      await Promise.resolve();
    });
    pageBecomes('hidden');
    expect(moving.paused).toBe(true);
    pageBecomes('visible');
    expect(moving.paused).toBe(false);
  });

  it('leaves a clip the browser will not play as it is, holding no pause', async () => {
    render(<ExerciseThumb exercise={bench} size="large" holdKey={KEY} />);
    const clip = await cardClip();
    refusePlay = true;
    pageBecomes('hidden');
    pageBecomes('visible');
    await act(async () => {
      await Promise.resolve();
    });
    expect(clip.paused).toBe(true);
    expect(isDemoHeld(KEY)).toBe(false);
    expect(clip).toHaveAttribute('data-animated', 'true');
  });

  it('stays still under reduced motion, and plays nothing when the page comes back', () => {
    mockReducedMotion(true);
    render(<ExerciseThumb exercise={bench} size="large" holdKey={KEY} />);
    expect(screen.getByTestId('exercise-thumb').tagName).toBe('IMG');
    pageBecomes('hidden');
    pageBecomes('visible');
    expect(plays).toBe(0);
  });
});

describe("a pause the lifter makes in the workout's How to", () => {
  it('holds the card still, and Play there moves it again', async () => {
    render(
      <>
        <ExerciseThumb exercise={bench} size="large" holdKey={KEY} />
        <ExerciseDemo exercise={bench} holdKey={KEY} />
      </>,
    );
    await cardClip();
    await playingHowToClip();
    fireEvent.click(screen.getByTestId('demo-pause'));
    expect(screen.getByTestId('exercise-thumb').tagName).toBe('IMG');
    expect(screen.getByTestId('exercise-thumb')).toHaveAttribute('data-animated', 'false');
    expect(isDemoHeld(KEY)).toBe(true);
    // Brought back, the page leaves a held card still.
    const before = plays;
    pageBecomes('hidden');
    pageBecomes('visible');
    expect(plays).toBe(before);
    fireEvent.click(screen.getByTestId('demo-pause'));
    const again = await cardClip();
    expect(again).toHaveAttribute('data-animated', 'true');
    expect(isDemoHeld(KEY)).toBe(false);
  });

  it('opens How to paused for that exercise, while the next exercise still loops', async () => {
    const first = render(<ExerciseDemo exercise={bench} holdKey={KEY} />);
    await playingHowToClip();
    fireEvent.click(screen.getByTestId('demo-pause'));
    first.unmount();
    render(
      <>
        <ExerciseDemo exercise={bench} holdKey={KEY} />
        <ExerciseThumb
          exercise={incline}
          size="large"
          holdKey={demoHoldKey('session-1', 'entry-2', incline.id)}
        />
      </>,
    );
    const demo = await howToClip();
    expect(screen.getByTestId('demo-pause')).toHaveTextContent('Play');
    expect(demo).toHaveAttribute('data-playing', 'false');
    expect(demo).not.toHaveAttribute('autoplay');
    const before = plays;
    fireEvent.loadedMetadata(demo);
    expect(plays).toBe(before);
    const card = await cardClip();
    expect(card).toHaveAttribute('data-animated', 'true');
    // The clip itself waits on its first frame: nothing has started it.
    expect(demo.paused).toBe(true);
  });

  it("holds nothing made outside the workout's How to: the details, or another workout", async () => {
    render(
      <>
        <ExerciseThumb exercise={bench} size="large" holdKey={KEY} />
        <ExerciseDemo exercise={bench} />
      </>,
    );
    await cardClip();
    await playingHowToClip();
    // The library's, or Today's, details: a pause there is that view's own.
    fireEvent.click(screen.getByTestId('demo-pause'));
    expect(screen.getByTestId('demo-pause')).toHaveTextContent('Play');
    expect(screen.getByTestId('exercise-thumb')).toHaveAttribute('data-animated', 'true');
    // Another workout's How to.
    holdDemo(demoHoldKey('session-0', 'entry-1', bench.id), true);
    expect(screen.getByTestId('exercise-thumb')).toHaveAttribute('data-animated', 'true');
  });

  it('is not made by a play the browser refuses: the card keeps looping', async () => {
    refusePlay = true;
    render(
      <>
        <ExerciseDemo exercise={bench} holdKey={KEY} />
        <ExerciseThumb exercise={bench} size="large" holdKey={KEY} />
      </>,
    );
    // The play that starts How to's clip is refused: it offers Play.
    await howToClip();
    await waitFor(() => expect(screen.getByTestId('demo-pause')).toHaveTextContent('Play'));
    expect(isDemoHeld(KEY)).toBe(false);
    const card = await cardClip();
    expect(card).toHaveAttribute('data-animated', 'true');
  });

  it('plays a clip the browser froze when it is tapped, holding nothing', async () => {
    render(
      <>
        <ExerciseThumb exercise={bench} size="large" holdKey={KEY} />
        <ExerciseDemo exercise={bench} holdKey={KEY} />
      </>,
    );
    await cardClip();
    const demo = await howToClip();
    await act(async () => {
      await demo.play();
    });
    expect(screen.getByTestId('demo-pause')).toHaveTextContent('Pause');
    // Frozen in the background: paused by the browser, the button still saying Pause.
    demo.pause();
    fireEvent.click(demo);
    expect(demo.paused).toBe(false);
    expect(isDemoHeld(KEY)).toBe(false);
    expect(screen.getByTestId('exercise-thumb')).toHaveAttribute('data-animated', 'true');
  });

  it("plays How to's own video on when the page comes back, unless the lifter paused it", async () => {
    render(<ExerciseDemo exercise={bench} customMedia={ownVideo} holdKey={KEY} />);
    const own = screen.getByTestId('custom-demo');
    if (!(own instanceof HTMLVideoElement)) throw new Error('not a video');
    await act(async () => {
      await Promise.resolve();
    });
    expect(own.paused).toBe(false);
    pageBecomes('hidden');
    expect(own.paused).toBe(true);
    // A page the browser froze leaves it paused; brought back, it plays on.
    pageBecomes('visible');
    expect(own.paused).toBe(false);
    fireEvent.click(screen.getByTestId('demo-pause'));
    pageBecomes('hidden');
    pageBecomes('visible');
    expect(own.paused).toBe(true);
  });

  it("plays How to's clip on when the page comes back, unless the lifter paused it", async () => {
    render(<ExerciseDemo exercise={bench} holdKey={KEY} />);
    const demo = await howToClip();
    await act(async () => {
      await Promise.resolve();
    });
    expect(demo.paused).toBe(false);
    pageBecomes('hidden');
    expect(demo.paused).toBe(true);
    pageBecomes('visible');
    expect(demo.paused).toBe(false);
    fireEvent.click(screen.getByTestId('demo-pause'));
    pageBecomes('hidden');
    pageBecomes('visible');
    expect(demo.paused).toBe(true);
  });

  it("holds the card's diagram loop on its still, and Play lets it go", () => {
    render(
      <>
        <ExerciseThumb exercise={pullApart} size="large" holdKey={KEY} />
        <ExerciseDemo exercise={pullApart} holdKey={KEY} />
      </>,
    );
    const thumb = () => screen.getByTestId('exercise-thumb');
    expect(thumb().getAttribute('src')).toContain('-loop.svg');
    fireEvent.click(screen.getByTestId('demo-pause'));
    expect(thumb().getAttribute('src')).not.toContain('-loop');
    expect(thumb()).toHaveAttribute('data-animated', 'false');
    fireEvent.click(screen.getByTestId('demo-pause'));
    expect(thumb().getAttribute('src')).toContain('-loop.svg');
    expect(thumb()).toHaveAttribute('data-animated', 'true');
  });

  it('opens a diagram paused before on its still, with Play', () => {
    holdDemo(KEY, true);
    render(<ExerciseDemo exercise={pullApart} holdKey={KEY} />);
    expect(screen.getByTestId('exercise-demo').getAttribute('src')).not.toContain('-loop');
    expect(screen.getByTestId('demo-pause')).toHaveTextContent('Play');
  });

  it('lets go when Play is pressed under reduced motion', async () => {
    holdDemo(KEY, true);
    mockReducedMotion(true);
    render(<ExerciseDemo exercise={bench} holdKey={KEY} />);
    fireEvent.click(screen.getByTestId('demo-play'));
    const demo = await howToClip();
    await act(async () => {
      await Promise.resolve();
    });
    expect(demo.paused).toBe(false);
    expect(screen.getByTestId('demo-pause')).toHaveTextContent('Pause');
    expect(isDemoHeld(KEY)).toBe(false);
  });

  it('tells a screen reader that Pause holds the card too, in the workout only', async () => {
    const note = 'Pause holds this demonstration on the workout card too.';
    const { unmount } = render(<ExerciseDemo exercise={bench} holdKey={KEY} />);
    await howToClip();
    const described = screen.getByTestId('demo-pause').getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    const said = document.getElementById(described ?? '');
    expect(said).toHaveTextContent(note);
    // Hidden: read with Pause, never as text of its own (the re-check).
    expect(said).toHaveAttribute('hidden');
    unmount();
    render(<ExerciseDemo exercise={bench} />);
    await howToClip();
    expect(screen.getByTestId('demo-pause')).not.toHaveAttribute('aria-describedby');
  });

  it('says nothing of the card where there is no Pause to press (the re-check)', () => {
    mockReducedMotion(true);
    render(<ExerciseDemo exercise={bench} holdKey={KEY} />);
    // Under reduced motion, before Play, there is no Pause yet.
    expect(screen.queryByTestId('demo-pause')).toBeNull();
    expect(
      screen.queryByText('Pause holds this demonstration on the workout card too.'),
    ).toBeNull();
  });

  it('takes a play cut short by a pause for no refusal: How to plays on (the re-check)', async () => {
    // The play that starts the clip is the one cut short (a pause as it loaded out of view).
    cutShort = 1;
    render(<ExerciseDemo exercise={bench} holdKey={KEY} />);
    const demo = await howToClip();
    await act(async () => {
      await Promise.resolve();
    });
    expect(cutShort).toBe(0);
    expect(screen.getByTestId('demo-pause')).toHaveTextContent('Pause');
    expect(demo).toHaveAttribute('data-playing', 'true');
    expect(isDemoHeld(KEY)).toBe(false);
    // Back in view or on the page, it plays.
    pageBecomes('hidden');
    pageBecomes('visible');
    expect(demo.paused).toBe(false);
  });

  it('leaves a How to clip rested out of view as it loads rested when its metadata comes (the third re-check)', async () => {
    render(<ExerciseDemo exercise={bench} holdKey={KEY} />);
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
    expect(screen.getByTestId('demo-pause')).toHaveTextContent('Pause');
    act(() => tell(demo, true));
    expect(demo.paused).toBe(false);
  });
});

describe('a play cut short by a pause is no refusal (the re-check)', () => {
  it("leaves How to's button on Pause when Play is cut short", async () => {
    render(<ExerciseDemo exercise={bench} holdKey={KEY} />);
    await playingHowToClip();
    fireEvent.click(screen.getByTestId('demo-pause'));
    expect(screen.getByTestId('demo-pause')).toHaveTextContent('Play');
    cutShort = 1;
    await act(async () => {
      fireEvent.click(screen.getByTestId('demo-pause'));
      await Promise.resolve();
    });
    expect(screen.getByTestId('demo-pause')).toHaveTextContent('Pause');
    expect(isDemoHeld(KEY)).toBe(false);
  });

  it("offers Play when the browser refuses the lifter's own video in How to", async () => {
    refusePlay = true;
    render(<ExerciseDemo exercise={bench} customMedia={ownVideo} holdKey={KEY} />);
    const own = screen.getByTestId('custom-demo');
    // Nothing but the app starts it: no autoplay.
    expect(own).not.toHaveAttribute('autoplay');
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('demo-pause')).toHaveTextContent('Play');
    expect(own).toHaveAttribute('data-playing', 'false');
    expect(isDemoHeld(KEY)).toBe(false);
  });

  it("leaves the lifter's own video moving in How to when its play is cut short", async () => {
    cutShort = 1;
    render(<ExerciseDemo exercise={bench} customMedia={ownVideo} holdKey={KEY} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('demo-pause')).toHaveTextContent('Pause');
    expect(screen.getByTestId('custom-demo')).toHaveAttribute('data-playing', 'true');
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
    const { rerender } = render(
      <ExerciseDemo exercise={bench} customMedia={ownVideo} holdKey={KEY} />,
    );
    const own = screen.getByTestId('custom-demo');
    if (!(own instanceof HTMLVideoElement)) throw new Error('not a video');
    await act(async () => {
      await Promise.resolve();
    });
    expect(own.paused).toBe(false);
    // A new source pauses the element as the browser loads it.
    own.pause();
    rerender(<ExerciseDemo exercise={bench} customMedia={replaced} holdKey={KEY} />);
    expect(screen.getByTestId('custom-demo')).toBe(own);
    expect(own.paused).toBe(false);
  });

  it('plays on on the card', async () => {
    const { rerender } = render(
      <ExerciseThumb exercise={bench} size="large" customMedia={ownVideo} holdKey={KEY} />,
    );
    const own = screen.getByTestId('exercise-thumb');
    if (!(own instanceof HTMLVideoElement)) throw new Error('not a video');
    await act(async () => {
      await Promise.resolve();
    });
    expect(own.paused).toBe(false);
    own.pause();
    rerender(<ExerciseThumb exercise={bench} size="large" customMedia={replaced} holdKey={KEY} />);
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
    const thumb = <ExerciseThumb exercise={bench} size="large" holdKey={KEY} />;
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
    const view = (open: boolean) => (
      <>
        <ExerciseThumb exercise={bench} size="large" customMedia={ownVideo} holdKey={KEY} />
        <ExerciseDemo exercise={bench} customMedia={ownVideo} holdKey={KEY} />
        <Sheet open={open} title="How to" onClose={vi.fn()}>
          <p>How to</p>
        </Sheet>
      </>
    );
    const { rerender } = render(view(true));
    await act(async () => {
      await Promise.resolve();
    });
    // Held and let go under the sheet: a new element, which stays still until the sheet closes.
    fireEvent.click(screen.getByTestId('demo-pause'));
    fireEvent.click(screen.getByTestId('demo-pause'));
    const moving = screen.getByTestId('exercise-thumb');
    if (!(moving instanceof HTMLVideoElement)) throw new Error('not a video');
    expect(moving).toHaveAttribute('data-animated', 'true');
    expect(moving).not.toHaveAttribute('autoplay');
    await act(async () => {
      await Promise.resolve();
    });
    expect(moving.paused).toBe(true);
    rerender(view(false));
    expect(moving.paused).toBe(false);
  });
});
