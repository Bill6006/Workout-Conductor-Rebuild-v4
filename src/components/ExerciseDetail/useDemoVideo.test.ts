import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDemoVideo } from './useDemoVideo';

/**
 * Maintenance 25, item 7: a demonstration clip is fetched whole, so the service worker keeps it
 * and it plays offline later; one that cannot be fetched says so, and nothing is left behind.
 */

const answers = new Map<string, (value: unknown) => void>();

beforeEach(() => {
  answers.clear();
  URL.createObjectURL = vi.fn((blob: Blob) => `blob:${blob.size}`);
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string) =>
        new Promise((resolve) => {
          answers.set(url, resolve);
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * The clip's hook listens for the phone coming back online from an effect, which can run a moment
 * after the failure shows: an event sent before then is missed (seen once under load).
 */
async function untilListeningForOnline(listens: { mock: { calls: unknown[][] } }) {
  await waitFor(() => expect(listens.mock.calls.some(([type]) => type === 'online')).toBe(true));
}

const ok = (bytes: number) => ({
  ok: true,
  status: 200,
  blob: async () => new Blob(['x'.repeat(bytes)]),
});

describe('useDemoVideo', () => {
  it('asks for nothing without a clip', () => {
    const { result } = renderHook(() => useDemoVideo(null));
    expect(result.current).toMatchObject({ src: null, failed: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches the whole clip once and frees it when the view closes', async () => {
    const { result, unmount } = renderHook(() => useDemoVideo('/media/exercises/a.mp4'));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ src: null, failed: false });
    answers.get('/media/exercises/a.mp4')?.(ok(3));
    await waitFor(() => expect(result.current).toMatchObject({ src: 'blob:3', failed: false }));
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:3');
  });

  it('says it failed when the clip cannot be fetched, as offline before it was kept', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const { result } = renderHook(() => useDemoVideo('/media/exercises/a.mp4'));
    await waitFor(() => expect(result.current).toMatchObject({ src: null, failed: true }));
  });

  it('treats a missing file as a failure too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, blob: async () => new Blob() })),
    );
    const { result } = renderHook(() => useDemoVideo('/media/exercises/gone.mp4'));
    await waitFor(() => expect(result.current).toMatchObject({ src: null, failed: true }));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('shows nothing of a clip that already arrived once the exercise changes, until its own comes', async () => {
    // Every render's answer, so even one render showing the first clip for the second is seen.
    const seen: { url: string; src: string | null }[] = [];
    const { result, rerender } = renderHook(
      ({ url }) => {
        const video = useDemoVideo(url);
        seen.push({ url, src: video.src });
        return video;
      },
      { initialProps: { url: '/media/exercises/a.mp4' } },
    );
    answers.get('/media/exercises/a.mp4')?.(ok(1));
    await waitFor(() => expect(result.current).toMatchObject({ src: 'blob:1', failed: false }));
    rerender({ url: '/media/exercises/b.mp4' });
    // The first clip's state belongs to the first clip (the ninth review), from the first render.
    expect(result.current).toMatchObject({ src: null, failed: false });
    expect(
      seen.filter((render) => render.url.endsWith('b.mp4') && render.src === 'blob:1'),
    ).toEqual([]);
    answers.get('/media/exercises/b.mp4')?.(ok(2));
    await waitFor(() => expect(result.current).toMatchObject({ src: 'blob:2', failed: false }));
  });

  it('never shows one clip for another when the exercise changes mid-fetch', async () => {
    const { result, rerender } = renderHook(({ url }) => useDemoVideo(url), {
      initialProps: { url: '/media/exercises/a.mp4' },
    });
    rerender({ url: '/media/exercises/b.mp4' });
    // The first answer arrives after the change: it is dropped.
    answers.get('/media/exercises/a.mp4')?.(ok(1));
    await Promise.resolve();
    expect(result.current).toMatchObject({ src: null, failed: false });
    answers.get('/media/exercises/b.mp4')?.(ok(2));
    await waitFor(() => expect(result.current).toMatchObject({ src: 'blob:2', failed: false }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('asks again when the phone comes back online after a clip could not be fetched (tenth review)', async () => {
    let online = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (!online) throw new TypeError('Failed to fetch');
        return ok(5);
      }),
    );
    const listens = vi.spyOn(window, 'addEventListener');
    const { result } = renderHook(() => useDemoVideo('/media/exercises/a.mp4'));
    await waitFor(() => expect(result.current).toMatchObject({ src: null, failed: true }));
    await untilListeningForOnline(listens);
    online = true;
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(result.current).toMatchObject({ src: 'blob:5', failed: false }));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
