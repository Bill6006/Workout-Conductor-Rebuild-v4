import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { ExerciseDetailSheet } from '../../components/ExerciseDetail/ExerciseDetailSheet';
import { HowToSheet } from '../../components/ExerciseDetail/HowToSheet';
import type { CustomMedia } from '../../core/validation/customExercise';
import { ONE_FRAME_GIF, twoFrameGif } from '../../test/images';
import { Providers, createTestStore } from '../../test/testStore';
import { useCustomMedia } from './useCustomMedia';
import { useOwnDemonstration } from './useOwnDemonstration';

afterEach(() => {
  vi.restoreAllMocks();
});

/** A made-up GIF as the phone's file picker hands it over. */
function gifFile(dataUrl: string, name: string): File {
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]!), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type: 'image/gif' });
}

/** What How to shows of the lifter's own, with a pick for each file and Remove. */
function Shown({ files }: { files: File[] }) {
  const own = useOwnDemonstration('barbell-bench-press');
  return (
    <>
      <span data-testid="shown">{own.media?.dataUrl ?? 'none'}</span>
      {files.map((file) => (
        <button key={file.name} type="button" onClick={() => own.pick(file)}>
          {`Pick ${file.name}`}
        </button>
      ))}
      <button type="button" onClick={own.remove}>
        Remove
      </button>
    </>
  );
}

describe("the lifter's own demonstration, picked, replaced and removed (the review of item 50)", () => {
  it('shows a replacement at once, though the count of demonstrations stays one', async () => {
    const { store } = createTestStore();
    const second = twoFrameGif();
    render(
      <Providers store={store}>
        <Shown files={[gifFile(ONE_FRAME_GIF, 'first.gif'), gifFile(second, 'second.gif')]} />
      </Providers>,
    );
    // The provider reads the data as it mounts: picked after, as on the phone.
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    fireEvent.click(screen.getByRole('button', { name: 'Pick first.gif' }));
    await waitFor(() => expect(screen.getByTestId('shown')).toHaveTextContent(ONE_FRAME_GIF));
    // Picked again (Replace, or a tap on the demonstration): the new one shows, not the old.
    fireEvent.click(screen.getByRole('button', { name: 'Pick second.gif' }));
    await waitFor(() => expect(screen.getByTestId('shown')).toHaveTextContent(second));
    expect(store.getSnapshot().customCounts.media).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.getByTestId('shown')).toHaveTextContent('none'));
  });
});

describe("the lifter's own demonstration through a read of the data (the re-check of item 50)", () => {
  it('keeps the count of demonstrations when the data is read again across a pick', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    const reading = store.hydrate();
    await store.addCustomMedia('barbell-bench-press', {
      kind: 'image',
      mimeType: 'image/gif',
      sizeBytes: 43,
      dataUrl: ONE_FRAME_GIF,
    });
    await reading;
    expect(store.getSnapshot().customCounts.media).toBe(1);
  });
});

describe('the media hook through a read of the data (the re-check of item 50)', () => {
  it('keeps the record in hand when the same one is read again: one copy of a large picture', async () => {
    const { store } = createTestStore();
    const seen: unknown[] = [];
    function Watch() {
      const media = useCustomMedia('barbell-bench-press');
      if (media) seen.push(media);
      return null;
    }
    render(
      <Providers store={store}>
        <Watch />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    await store.addCustomMedia('barbell-bench-press', {
      kind: 'image',
      mimeType: 'image/gif',
      sizeBytes: 43,
      dataUrl: ONE_FRAME_GIF,
    });
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    const first = seen[seen.length - 1];
    await store.hydrate();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(new Set(seen)).toEqual(new Set([first]));
  });
});

/** The one-frame GIF in another colour: the same size, another picture. */
function sameSizeGif(): string {
  const bytes = atob(ONE_FRAME_GIF.split(',')[1]!);
  return `data:image/gif;base64,${btoa(bytes.slice(0, 13) + '\x11' + bytes.slice(14))}`;
}

const picture = (dataUrl: string, sizeBytes = 43) => ({
  kind: 'image' as const,
  mimeType: 'image/gif',
  sizeBytes,
  dataUrl,
});

describe("the lifter's own demonstration after the third pass of item 50", () => {
  it('keeps the count when a read of the data begins during a pick, after the pick was counted', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    const db = await store.getDatabase();
    const read = db.get.bind(db);
    let reading: Promise<void> | null = null;
    vi.spyOn(db, 'get').mockImplementation(((name: string, key: IDBValidKey) => {
      // The pick's own look for one already saved: a read of the data begins just then.
      if (name === 'customMedia' && reading === null) reading = store.hydrate();
      return read(name as never, key as never);
    }) as never);
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    expect(reading).not.toBeNull();
    await reading;
    expect(store.getSnapshot().customCounts.media).toBe(1);
  });

  it('keeps the count when a read of the data begins during a removal, after it was counted', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    const db = await store.getDatabase();
    const remove = db.delete.bind(db);
    let reading: Promise<void> | null = null;
    vi.spyOn(db, 'delete').mockImplementation(((name: string, key: IDBValidKey) => {
      // A read of the data begins as the removal is written: it counts the picture still there.
      if (name === 'customMedia' && reading === null) reading = store.hydrate();
      return remove(name as never, key as never);
    }) as never);
    await store.deleteCustomMedia('barbell-bench-press');
    expect(reading).not.toBeNull();
    await reading;
    expect(store.getSnapshot().customCounts.media).toBe(0);
  });

  it('lets a removed demonstration go: a later pick never shows it again, not even for a moment', async () => {
    const { store } = createTestStore();
    const second = twoFrameGif();
    const shown: string[] = [];
    function Watch() {
      const media = useCustomMedia('barbell-bench-press');
      shown.push(media?.dataUrl ?? 'none');
      return null;
    }
    render(
      <Providers store={store}>
        <Watch />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    await waitFor(() => expect(shown[shown.length - 1]).toBe(ONE_FRAME_GIF));
    await store.deleteCustomMedia('barbell-bench-press');
    await waitFor(() => expect(shown[shown.length - 1]).toBe('none'));
    const removedAt = shown.length;
    await store.addCustomMedia('barbell-bench-press', picture(second, 70));
    await waitFor(() => expect(shown[shown.length - 1]).toBe(second));
    expect(shown.slice(removedAt)).not.toContain(ONE_FRAME_GIF);
  });

  it('shows a replacement of the same size made at the same moment', async () => {
    // The test clock stands still: both are made at one moment, and both are 43 bytes.
    const { store } = createTestStore();
    const other = sameSizeGif();
    expect(other).not.toBe(ONE_FRAME_GIF);
    const shown: string[] = [];
    function Watch() {
      shown.push(useCustomMedia('barbell-bench-press')?.dataUrl ?? 'none');
      return null;
    }
    render(
      <Providers store={store}>
        <Watch />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    await waitFor(() => expect(shown[shown.length - 1]).toBe(ONE_FRAME_GIF));
    await store.addCustomMedia('barbell-bench-press', picture(other));
    await waitFor(() => expect(shown[shown.length - 1]).toBe(other));
  });

  it('holds only the exercise it saves for: a sheet opened on another meanwhile is free', async () => {
    const { store } = createTestStore();
    let release: () => void = () => undefined;
    vi.spyOn(store, 'addCustomMedia').mockImplementation(
      () =>
        new Promise<CustomMedia>((resolve) => {
          release = () => resolve({} as CustomMedia);
        }),
    );
    function Busy({ id }: { id: string }) {
      const demonstration = useOwnDemonstration(id);
      return (
        <>
          <span data-testid="busy">{String(demonstration.busy)}</span>
          <button
            type="button"
            onClick={() => demonstration.pick(gifFile(ONE_FRAME_GIF, 'mine.gif'))}
          >
            Pick
          </button>
        </>
      );
    }
    const { rerender } = render(
      <Providers store={store}>
        <Busy id="band-pull-apart" />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    await waitFor(() => expect(screen.getByTestId('busy')).toHaveTextContent('true'));
    rerender(
      <Providers store={store}>
        <Busy id="ab-wheel-rollout" />
      </Providers>,
    );
    expect(screen.getByTestId('busy')).toHaveTextContent('false');
    rerender(
      <Providers store={store}>
        <Busy id="band-pull-apart" />
      </Providers>,
    );
    expect(screen.getByTestId('busy')).toHaveTextContent('true');
    // Let go once the save has begun: the file is read first.
    await waitFor(() => expect(store.addCustomMedia).toHaveBeenCalledTimes(1));
    await act(async () => release());
    await waitFor(() => expect(screen.getByTestId('busy')).toHaveTextContent('false'));
  });

  it("keeps the focus on the bar after Remove, with another exercise's picture kept too", async () => {
    const { store } = createTestStore();
    render(
      <Providers store={store}>
        <HowToSheet exercise={requireExercise('barbell-bench-press')} onClose={() => undefined} />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    await store.addCustomMedia('band-pull-apart', picture(ONE_FRAME_GIF));
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    const remove = await screen.findByTestId('demo-remove');
    remove.focus();
    fireEvent.click(remove);
    await waitFor(() => expect(screen.getByTestId('demo-your-gif')).toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('demo-your-gif')));
  });
});

/** A database method run as written, its type set aside for a spy. */
type Run = (...args: unknown[]) => Promise<unknown>;

describe("the lifter's own demonstration after the fourth pass of item 50", () => {
  it('counts what the database holds once a pick is written, though the data was read meanwhile', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    const db = await store.getDatabase();
    const put = db.put.bind(db) as unknown as Run;
    let read = false;
    vi.spyOn(db, 'put').mockImplementation((async (...args: unknown[]) => {
      const done = await put(...args);
      // The data is read again in full just as the pick is written.
      if (args[0] === 'customMedia' && !read) {
        read = true;
        await store.hydrate();
      }
      return done;
    }) as never);
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    expect(read).toBe(true);
    expect(store.getSnapshot().customCounts.media).toBe(1);
  });

  it('counts what the database holds once a removal is written, though the data was read meanwhile', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.addCustomMedia('band-pull-apart', picture(ONE_FRAME_GIF));
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    const db = await store.getDatabase();
    const remove = db.delete.bind(db) as unknown as Run;
    let read = false;
    vi.spyOn(db, 'delete').mockImplementation((async (...args: unknown[]) => {
      const done = await remove(...args);
      if (args[0] === 'customMedia' && !read) {
        read = true;
        await store.hydrate();
      }
      return done;
    }) as never);
    await store.deleteCustomMedia('barbell-bench-press');
    expect(read).toBe(true);
    // The pull-apart's picture is still there, and counted.
    expect(store.getSnapshot().customCounts.media).toBe(1);
  });

  it('writes a removal and a pick one at a time, in the order asked: the picture picked stays', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    const db = await store.getDatabase();
    const put = db.put.bind(db) as unknown as Run;
    const remove = db.delete.bind(db) as unknown as Run;
    let written: () => void = () => undefined;
    const putDone = new Promise<void>((resolve) => {
      written = resolve;
    });
    vi.spyOn(db, 'put').mockImplementation((async (...args: unknown[]) => {
      const done = await put(...args);
      written();
      return done;
    }) as never);
    vi.spyOn(db, 'delete').mockImplementation((async (...args: unknown[]) => {
      // The removal is slow to write: a pick asked for after it must wait its turn.
      await Promise.race([putDone, new Promise((resolve) => setTimeout(resolve, 50))]);
      return remove(...args);
    }) as never);
    const second = twoFrameGif();
    const removing = store.deleteCustomMedia('barbell-bench-press');
    const picking = store.addCustomMedia('barbell-bench-press', picture(second, 70));
    await Promise.all([removing, picking]);
    expect((await store.getCustomMedia('barbell-bench-press'))?.dataUrl).toBe(second);
    expect(store.getSnapshot().customCounts.media).toBe(1);
  });

  it('holds each exercise whose save runs: a second save does not free the first', async () => {
    const { store } = createTestStore();
    const releases: (() => void)[] = [];
    vi.spyOn(store, 'addCustomMedia').mockImplementation(
      () =>
        new Promise<CustomMedia>((resolve) => {
          releases.push(() => resolve({} as CustomMedia));
        }),
    );
    function Busy({ id }: { id: string }) {
      const demonstration = useOwnDemonstration(id);
      return (
        <>
          <span data-testid="busy">{String(demonstration.busy)}</span>
          <button
            type="button"
            onClick={() => demonstration.pick(gifFile(ONE_FRAME_GIF, 'mine.gif'))}
          >
            Pick
          </button>
        </>
      );
    }
    const at = (id: string) => (
      <Providers store={store}>
        <Busy id={id} />
      </Providers>
    );
    const { rerender } = render(at('band-pull-apart'));
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    await waitFor(() => expect(screen.getByTestId('busy')).toHaveTextContent('true'));
    rerender(at('ab-wheel-rollout'));
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    await waitFor(() => expect(screen.getByTestId('busy')).toHaveTextContent('true'));
    rerender(at('band-pull-apart'));
    expect(screen.getByTestId('busy')).toHaveTextContent('true');
    await waitFor(() => expect(releases).toHaveLength(2));
    await act(async () => releases.forEach((release) => release()));
    await waitFor(() => expect(screen.getByTestId('busy')).toHaveTextContent('false'));
  });

  it('gives the focus back to Remove when the removal fails', async () => {
    const { store } = createTestStore();
    render(
      <Providers store={store}>
        <HowToSheet exercise={requireExercise('barbell-bench-press')} onClose={() => undefined} />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    vi.spyOn(store, 'deleteCustomMedia').mockRejectedValue(new Error('Could not remove it'));
    const remove = await screen.findByTestId('demo-remove');
    remove.focus();
    fireEvent.click(remove);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('demo-remove')));
    expect(screen.getByTestId('custom-demo')).toBeInTheDocument();
  });
});

describe("the lifter's own demonstration: a read of the data across a removal", () => {
  it('keeps the count when a read counts before a removal is written and ends after it', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    const db = await store.getDatabase();
    const count = db.count.bind(db) as unknown as Run;
    const getAll = db.getAll.bind(db) as unknown as Run;
    const remove = db.delete.bind(db) as unknown as Run;
    let counted: () => void = () => undefined;
    const countedBefore = new Promise<void>((resolve) => {
      counted = resolve;
    });
    let removed: () => void = () => undefined;
    const removalDone = new Promise<void>((resolve) => {
      removed = resolve;
    });
    let reading: Promise<void> | null = null;
    vi.spyOn(db, 'count').mockImplementation((async (...args: unknown[]) => {
      const n = await count(...args);
      if (args[0] === 'customMedia') counted();
      return n;
    }) as never);
    vi.spyOn(db, 'getAll').mockImplementation((async (...args: unknown[]) => {
      // The read ends only once the removal is written and counted.
      if (reading !== null && args[0] === 'savedWorkouts') await removalDone;
      return getAll(...args);
    }) as never);
    vi.spyOn(db, 'delete').mockImplementation((async (...args: unknown[]) => {
      if (args[0] === 'customMedia' && reading === null) {
        // A read of the data begins once the removal has begun, and counts before it is written.
        reading = store.hydrate();
        await countedBefore;
      }
      return remove(...args);
    }) as never);
    await store.deleteCustomMedia('barbell-bench-press');
    removed();
    expect(reading).not.toBeNull();
    await reading;
    expect(store.getSnapshot().customCounts.media).toBe(0);
  });
});

describe("the lifter's own demonstration after the fifth pass of item 50", () => {
  it('takes a picture off the screen that another window removed: Remove here brings it up to date', async () => {
    const here = createTestStore();
    const there = createTestStore({ factory: here.factory });
    render(
      <Providers store={here.store}>
        <HowToSheet exercise={requireExercise('barbell-bench-press')} onClose={() => undefined} />
      </Providers>,
    );
    await waitFor(() => expect(here.store.getSnapshot().status).toBe('ready'));
    await here.store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    await screen.findByTestId('custom-demo');
    await there.store.hydrate();
    await there.store.deleteCustomMedia('barbell-bench-press');
    fireEvent.click(screen.getByTestId('demo-remove'));
    await waitFor(() => expect(screen.queryByTestId('custom-demo')).toBeNull());
    expect(here.store.getSnapshot().customCounts.media).toBe(0);
  });

  it('shows what the database holds after a replacement that failed while the data was read', async () => {
    const { store } = createTestStore();
    const shown: string[] = [];
    function Watch() {
      shown.push(useCustomMedia('barbell-bench-press')?.dataUrl ?? 'none');
      return null;
    }
    render(
      <Providers store={store}>
        <Watch />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    await waitFor(() => expect(shown[shown.length - 1]).toBe(ONE_FRAME_GIF));
    const second = twoFrameGif();
    const db = await store.getDatabase();
    const read = db.get.bind(db) as unknown as Run;
    let calls = 0;
    vi.spyOn(db, 'get').mockImplementation((async (...args: unknown[]) => {
      const found = await read(...args);
      if (args[0] !== 'customMedia') return found;
      calls += 1;
      // The replacement's read-back: the data is read meanwhile, and the check then fails.
      if (calls === 2) {
        await store.hydrate();
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { ...(found as object), dataUrl: 'data:image/gif;base64,AAAA' };
      }
      return found;
    }) as never);
    await expect(
      store.addCustomMedia('barbell-bench-press', picture(second, 70)),
    ).rejects.toThrow();
    vi.mocked(db.get).mockRestore();
    await waitFor(() => expect(shown[shown.length - 1]).toBe(ONE_FRAME_GIF));
  });

  it('gives the focus back to Remove after a failed removal, whenever the browser draws', async () => {
    const draw = window.requestAnimationFrame;
    // The browser draws at once, before the buttons are enabled again.
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(0));
      return 0;
    }) as typeof window.requestAnimationFrame;
    try {
      const { store } = createTestStore();
      render(
        <Providers store={store}>
          <HowToSheet exercise={requireExercise('barbell-bench-press')} onClose={() => undefined} />
        </Providers>,
      );
      await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
      await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
      vi.spyOn(store, 'deleteCustomMedia').mockRejectedValue(new Error('Could not remove it'));
      const remove = await screen.findByTestId('demo-remove');
      remove.focus();
      fireEvent.click(remove);
      await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('demo-remove')));
    } finally {
      window.requestAnimationFrame = draw;
    }
  });

  it('keeps no picked file in the queue once it is written', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    const queue = (store as unknown as { mediaWrites: Promise<unknown> }).mediaWrites;
    expect(await queue).toBeUndefined();
  });
});

describe("the lifter's own demonstration: a removal that fails once the picture is gone", () => {
  it('takes the picture off the screen: a removal whose check failed once it landed is a removal', async () => {
    const { store } = createTestStore();
    const shown: string[] = [];
    function Watch() {
      shown.push(useCustomMedia('barbell-bench-press')?.dataUrl ?? 'none');
      return null;
    }
    render(
      <Providers store={store}>
        <Watch />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    await waitFor(() => expect(shown[shown.length - 1]).toBe(ONE_FRAME_GIF));
    const db = await store.getDatabase();
    const read = db.get.bind(db) as unknown as Run;
    let failed = false;
    vi.spyOn(db, 'get').mockImplementation((async (...args: unknown[]) => {
      // The removal's read-back fails once, after the picture is gone.
      if (args[0] === 'customMedia' && !failed) {
        failed = true;
        throw new Error('read failed');
      }
      return read(...args);
    }) as never);
    // The store reads once more, finds none, and counts it removed (the eighth pass).
    await store.deleteCustomMedia('barbell-bench-press');
    vi.mocked(db.get).mockRestore();
    await waitFor(() => expect(shown[shown.length - 1]).toBe('none'));
  });
});

describe("the lifter's own demonstration after the sixth pass of item 50", () => {
  it('shows a picture verified written though the count after it fails', async () => {
    const { store } = createTestStore();
    const shown: string[] = [];
    function Watch() {
      shown.push(useCustomMedia('barbell-bench-press')?.dataUrl ?? 'none');
      return null;
    }
    render(
      <Providers store={store}>
        <Watch />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    const db = await store.getDatabase();
    const count = db.count.bind(db) as unknown as Run;
    vi.spyOn(db, 'count').mockImplementation((async (...args: unknown[]) => {
      if (args[0] === 'customMedia') throw new Error('count failed');
      return count(...args);
    }) as never);
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    expect(store.getSnapshot().customCounts.media).toBe(1);
    await waitFor(() => expect(shown[shown.length - 1]).toBe(ONE_FRAME_GIF));
  });

  it('gives the focus to the bar when a removal that failed took the picture all the same', async () => {
    const { store } = createTestStore();
    render(
      <Providers store={store}>
        <HowToSheet exercise={requireExercise('barbell-bench-press')} onClose={() => undefined} />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    const db = await store.getDatabase();
    const read = db.get.bind(db) as unknown as Run;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let waiting = false;
    let armed = false;
    vi.spyOn(db, 'get').mockImplementation((async (...args: unknown[]) => {
      if (armed && args[0] === 'customMedia') {
        // The removal's read-back: it waits, then fails, though the picture is gone.
        armed = false;
        waiting = true;
        await gate;
        throw new Error('read failed');
      }
      return read(...args);
    }) as never);
    const remove = await screen.findByTestId('demo-remove');
    remove.focus();
    armed = true;
    fireEvent.click(remove);
    await waitFor(() => expect(waiting).toBe(true));
    // Chrome lets the focus of a button disabled to save fall to the page.
    act(() => {
      const spot = document.createElement('input');
      document.body.append(spot);
      spot.focus();
      spot.remove();
    });
    release();
    await waitFor(() => expect(screen.queryByTestId('custom-demo')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('demo-your-gif')));
  });

  it('lets a read of a picture fail without a rejection left unhandled', async () => {
    const { store } = createTestStore();
    const unhandled: unknown[] = [];
    const listen = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', listen);
    try {
      function Watch() {
        useCustomMedia('barbell-bench-press');
        return null;
      }
      render(
        <Providers store={store}>
          <Watch />
        </Providers>,
      );
      await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
      vi.spyOn(store, 'getCustomMedia').mockRejectedValue(new Error('read failed'));
      await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', listen);
    }
  });

  it("gives the focus to the bar at the save's end when the picture went, with no frame drawn", async () => {
    // No frame is ever drawn: only the save's end can give the focus back.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    const { store } = createTestStore();
    render(
      <Providers store={store}>
        <HowToSheet exercise={requireExercise('barbell-bench-press')} onClose={() => undefined} />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    const db = await store.getDatabase();
    const read = db.get.bind(db) as unknown as Run;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let waiting = false;
    let armed = false;
    vi.spyOn(db, 'get').mockImplementation((async (...args: unknown[]) => {
      if (armed && args[0] === 'customMedia') {
        armed = false;
        waiting = true;
        await gate;
        throw new Error('read failed');
      }
      return read(...args);
    }) as never);
    const remove = await screen.findByTestId('demo-remove');
    remove.focus();
    armed = true;
    fireEvent.click(remove);
    await waitFor(() => expect(waiting).toBe(true));
    act(() => {
      const spot = document.createElement('input');
      document.body.append(spot);
      spot.focus();
      spot.remove();
    });
    release();
    await waitFor(() => expect(screen.queryByTestId('custom-demo')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('demo-your-gif')));
  });
});

describe("the lifter's own demonstration after the seventh pass of item 50", () => {
  /** Bench with a picture, and band pull-apart with one, so the count stays above none. */
  async function twoPictures() {
    const { store } = createTestStore();
    render(
      <Providers store={store}>
        <HowToSheet exercise={requireExercise('barbell-bench-press')} onClose={() => undefined} />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    await store.addCustomMedia('band-pull-apart', picture(ONE_FRAME_GIF));
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    await screen.findByTestId('custom-demo');
    return store;
  }

  it('counts a removal whose delete landed as removed: the focus stays on the bar, and says so', async () => {
    const store = await twoPictures();
    const db = await store.getDatabase();
    const read = db.get.bind(db) as unknown as Run;
    let armed = false;
    vi.spyOn(db, 'get').mockImplementation((async (...args: unknown[]) => {
      if (armed && args[0] === 'customMedia') {
        // The removal's read-back fails, though the delete landed.
        armed = false;
        throw new Error('read failed');
      }
      return read(...args);
    }) as never);
    // The picture's own read is slow: it goes after the save has ended.
    const slow = store.getCustomMedia.bind(store);
    vi.spyOn(store, 'getCustomMedia').mockImplementation(async (id: string) => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return slow(id);
    });
    const remove = await screen.findByTestId('demo-remove');
    remove.focus();
    armed = true;
    fireEvent.click(remove);
    await waitFor(() => expect(screen.queryByTestId('custom-demo')).toBeNull());
    expect(document.activeElement).toBe(screen.getByTestId('demo-your-gif'));
    expect(await screen.findByText('Removed your demonstration')).toBeInTheDocument();
    expect(screen.queryByText('read failed')).toBeNull();
  });

  it('reads a picture again a moment after a read that failed: a removed one does not stay', async () => {
    const store = await twoPictures();
    const read = store.getCustomMedia.bind(store);
    let fail = false;
    vi.spyOn(store, 'getCustomMedia').mockImplementation(async (id: string) => {
      if (fail) {
        fail = false;
        throw new Error('read failed');
      }
      return read(id);
    });
    fail = true;
    await store.deleteCustomMedia('barbell-bench-press');
    expect(store.getSnapshot().customCounts.media).toBe(1);
    await waitFor(() => expect(screen.queryByTestId('custom-demo')).toBeNull(), { timeout: 2000 });
  });
});

describe("the lifter's own demonstration after the eighth pass of item 50", () => {
  it('lets a removed picture go though every read of it fails: the store says it is gone', async () => {
    const { store } = createTestStore();
    const shown: string[] = [];
    function Watch() {
      shown.push(useCustomMedia('barbell-bench-press')?.dataUrl ?? 'none');
      return null;
    }
    render(
      <Providers store={store}>
        <Watch />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    // Another picture keeps the count above none.
    await store.addCustomMedia('band-pull-apart', picture(ONE_FRAME_GIF));
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    await waitFor(() => expect(shown[shown.length - 1]).toBe(ONE_FRAME_GIF));
    vi.spyOn(store, 'getCustomMedia').mockRejectedValue(new Error('read failed'));
    await store.deleteCustomMedia('barbell-bench-press');
    expect(store.getSnapshot().customMediaGone).toHaveProperty(['barbell-bench-press']);
    await waitFor(() => expect(shown[shown.length - 1]).toBe('none'));
    // A pick for it again shows once read: the mark lets go only what was read before it, and
    // stays (the tenth pass).
    vi.mocked(store.getCustomMedia).mockRestore();
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    expect(store.getSnapshot().customMediaGone).toHaveProperty(['barbell-bench-press']);
    await waitFor(() => expect(shown[shown.length - 1]).toBe(ONE_FRAME_GIF));
    // Reading the data again (a restore) keeps the marks; what it holds is read anew.
    await store.deleteCustomMedia('band-pull-apart');
    const marks = store.getSnapshot().customMediaGone;
    expect(Object.keys(marks).sort()).toEqual(['band-pull-apart', 'barbell-bench-press']);
    await store.hydrate();
    expect(store.getSnapshot().customMediaGone).toEqual(marks);
    await waitFor(() => expect(shown[shown.length - 1]).toBe(ONE_FRAME_GIF));
  });

  it('says a pick that did not take in plain words', async () => {
    const { store } = createTestStore();
    render(
      <Providers store={store}>
        <Shown files={[gifFile(ONE_FRAME_GIF, 'first.gif')]} />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    vi.spyOn(store, 'addCustomMedia').mockRejectedValue(
      new Error(
        'Save verification failed for customMedia/barbell-bench-press. Rollback also failed.',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pick first.gif' }));
    expect(
      await screen.findByText('Could not save your demonstration. Try again.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Save verification failed/)).toBeNull();
  });

  it('counts a pick whose check failed once it landed as saved: said so, and shown', async () => {
    const { store } = createTestStore();
    render(
      <Providers store={store}>
        <HowToSheet exercise={requireExercise('barbell-bench-press')} onClose={() => undefined} />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    const db = await store.getDatabase();
    const read = db.get.bind(db) as unknown as Run;
    let reads = 0;
    vi.spyOn(db, 'get').mockImplementation((async (...args: unknown[]) => {
      // The pick's read-back (its second read) fails, though the put landed.
      if (args[0] === 'customMedia' && (reads += 1) === 2) throw new Error('read failed');
      return read(...args);
    }) as never);
    const saved = await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    expect(saved.dataUrl).toBe(ONE_FRAME_GIF);
    vi.mocked(db.get).mockRestore();
    expect(await screen.findByTestId('custom-demo')).toBeInTheDocument();
  });

  it('says a removal that did not take in plain words', async () => {
    const { store } = createTestStore();
    render(
      <Providers store={store}>
        <HowToSheet exercise={requireExercise('barbell-bench-press')} onClose={() => undefined} />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    vi.spyOn(store, 'deleteCustomMedia').mockRejectedValue(
      new Error(
        'Save verification failed for customMedia/barbell-bench-press. Rollback also failed.',
      ),
    );
    fireEvent.click(await screen.findByTestId('demo-remove'));
    expect(
      await screen.findByText('Could not remove your demonstration. Try again.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Save verification failed/)).toBeNull();
  });
});

describe("the lifter's own demonstration: a removal whose outcome the store cannot read", () => {
  it('shows what the database holds once the screen can read it, though the removal says it failed', async () => {
    const { store } = createTestStore();
    const shown: string[] = [];
    function Watch() {
      shown.push(useCustomMedia('barbell-bench-press')?.dataUrl ?? 'none');
      return null;
    }
    render(
      <Providers store={store}>
        <Watch />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    await store.addCustomMedia('band-pull-apart', picture(ONE_FRAME_GIF));
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    await waitFor(() => expect(shown[shown.length - 1]).toBe(ONE_FRAME_GIF));
    const db = await store.getDatabase();
    const read = db.get.bind(db) as unknown as Run;
    let failing = 2;
    vi.spyOn(db, 'get').mockImplementation((async (...args: unknown[]) => {
      // The delete lands; its check and the store's own read after it both fail.
      if (args[0] === 'customMedia' && failing > 0) {
        failing -= 1;
        throw new Error('read failed');
      }
      return read(...args);
    }) as never);
    await expect(store.deleteCustomMedia('barbell-bench-press')).rejects.toThrow('read failed');
    // The screen reads again all the same, and shows none.
    await waitFor(() => expect(shown[shown.length - 1]).toBe('none'));
  });
});

describe("the lifter's own demonstration after the ninth pass of item 50", () => {
  /** Two pictures, the bench's shown; then the bench's removed. */
  async function removedOnScreen() {
    const { store } = createTestStore();
    const shown: string[] = [];
    function Watch() {
      shown.push(useCustomMedia('barbell-bench-press')?.dataUrl ?? 'none');
      return null;
    }
    render(
      <Providers store={store}>
        <Watch />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    // Another picture keeps the count above none.
    await store.addCustomMedia('band-pull-apart', picture(ONE_FRAME_GIF));
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    await waitFor(() => expect(shown[shown.length - 1]).toBe(ONE_FRAME_GIF));
    return { store, shown };
  }

  it('keeps a removed picture gone through a read of the data, though every read of it fails', async () => {
    const { store, shown } = await removedOnScreen();
    vi.spyOn(store, 'getCustomMedia').mockRejectedValue(new Error('read failed'));
    await store.deleteCustomMedia('barbell-bench-press');
    await waitFor(() => expect(shown[shown.length - 1]).toBe('none'));
    // A read of the data (a restore): the picture stays gone.
    await store.hydrate();
    expect(store.getSnapshot().customMediaGone).toHaveProperty(['barbell-bench-press']);
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(shown[shown.length - 1]).toBe('none');
  });

  it("shows another window's pick after a removal here, once the pictures are read again", async () => {
    const { store, shown } = await removedOnScreen();
    await store.deleteCustomMedia('barbell-bench-press');
    await waitFor(() => expect(shown[shown.length - 1]).toBe('none'));
    // Another window picks one for the bench, straight into the database.
    const other = twoFrameGif();
    const db = await store.getDatabase();
    await db.put('customMedia', {
      id: 'barbell-bench-press',
      exerciseId: 'barbell-bench-press',
      kind: 'image',
      mimeType: 'image/gif',
      sizeBytes: 43,
      dataUrl: other,
      source: 'user',
      createdAt: '2026-10-09T12:00:00.000Z',
    } as never);
    // A pick here for another lift reads every picture again.
    await store.addCustomMedia('band-pull-apart', picture(sameSizeGif()));
    await waitFor(() => expect(shown[shown.length - 1]).toBe(other));
  });

  it('shows a pick that landed though neither its check nor the store could read it back', async () => {
    const { store, shown } = await removedOnScreen();
    await store.deleteCustomMedia('barbell-bench-press');
    await waitFor(() => expect(shown[shown.length - 1]).toBe('none'));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    const db = await store.getDatabase();
    const read = db.get.bind(db) as unknown as Run;
    let reads = 0;
    let failing = true;
    vi.spyOn(db, 'get').mockImplementation((async (...args: unknown[]) => {
      // The pick's look for one saved passes; its read-back and the store's read after it fail.
      if (args[0] === 'customMedia' && failing && (reads += 1) >= 2) {
        throw new Error('read failed');
      }
      return read(...args);
    }) as never);
    const second = twoFrameGif();
    await expect(store.addCustomMedia('barbell-bench-press', picture(second))).rejects.toThrow(
      'read failed',
    );
    failing = false;
    await waitFor(() => expect(shown[shown.length - 1]).toBe(second));
  });
});

describe("the lifter's own demonstration after the tenth pass of item 50", () => {
  /** A sheet the workout keeps mounted, shut (no exercise) or open on the bench. */
  async function sheetOnTheBench() {
    const { store } = createTestStore();
    const shown: string[] = [];
    let setter: (id: string) => void = () => undefined;
    function Sheet({ onReady }: { onReady: (open: (id: string) => void) => void }) {
      const [id, setId] = useState('barbell-bench-press');
      useEffect(() => onReady(setId), [onReady, setId]);
      shown.push(useCustomMedia(id)?.dataUrl ?? 'none');
      return null;
    }
    const ready = (open: (id: string) => void) => {
      setter = open;
    };
    const sheet = { open: (id: string) => setter(id) };
    render(
      <Providers store={store}>
        <Sheet onReady={ready} />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    // Another picture keeps the count above none.
    await store.addCustomMedia('band-pull-apart', picture(ONE_FRAME_GIF));
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    await waitFor(() => expect(shown[shown.length - 1]).toBe(ONE_FRAME_GIF));
    // Shut, as the workout keeps it: the picture read stays in hand.
    act(() => sheet.open(''));
    return { store, shown, sheet };
  }

  it('never shows a removed picture on a sheet opened again after a read of the data', async () => {
    const { store, shown, sheet } = await sheetOnTheBench();
    await store.deleteCustomMedia('barbell-bench-press');
    await store.hydrate();
    const from = shown.length;
    act(() => sheet.open('barbell-bench-press'));
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(shown.slice(from)).not.toContain(ONE_FRAME_GIF);
    expect(shown[shown.length - 1]).toBe('none');
  });

  it('never shows a removed picture on a sheet opened again after a new pick: the new one shows', async () => {
    const { store, shown, sheet } = await sheetOnTheBench();
    await store.deleteCustomMedia('barbell-bench-press');
    const second = twoFrameGif();
    await store.addCustomMedia('barbell-bench-press', picture(second));
    const from = shown.length;
    act(() => sheet.open('barbell-bench-press'));
    await waitFor(() => expect(shown[shown.length - 1]).toBe(second));
    expect(shown.slice(from)).not.toContain(ONE_FRAME_GIF);
  });

  it('shows a removed picture again once a backup brings the very same one back', async () => {
    const { store } = createTestStore();
    const shown: string[] = [];
    function Watch() {
      shown.push(useCustomMedia('barbell-bench-press')?.dataUrl ?? 'none');
      return null;
    }
    render(
      <Providers store={store}>
        <Watch />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    await store.addCustomMedia('band-pull-apart', picture(ONE_FRAME_GIF));
    const saved = await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    await waitFor(() => expect(shown[shown.length - 1]).toBe(ONE_FRAME_GIF));
    await store.deleteCustomMedia('barbell-bench-press');
    await waitFor(() => expect(shown[shown.length - 1]).toBe('none'));
    // The backup holds the record as it was; restored, it is read anew.
    const db = await store.getDatabase();
    await db.put('customMedia', saved as never);
    await store.hydrate();
    await waitFor(() => expect(shown[shown.length - 1]).toBe(ONE_FRAME_GIF));
  });
});

describe("the lifter's own demonstration: the focus after a removal said to fail", () => {
  it('gives the focus to the bar when the picture went all the same, with no frame drawn', async () => {
    // No frame is ever drawn: only the save's end can give the focus back.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    const { store } = createTestStore();
    render(
      <Providers store={store}>
        <HowToSheet exercise={requireExercise('barbell-bench-press')} onClose={() => undefined} />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    await store.addCustomMedia('band-pull-apart', picture(ONE_FRAME_GIF));
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    const removeFor = store.deleteCustomMedia.bind(store);
    vi.spyOn(store, 'deleteCustomMedia').mockImplementation(async (id: string) => {
      // The picture goes, and the screen shows it gone; the focus falls to the page; then the
      // removal is said to have failed.
      await removeFor(id);
      await waitFor(() => expect(screen.queryByTestId('custom-demo')).toBeNull());
      act(() => {
        const spot = document.createElement('input');
        document.body.append(spot);
        spot.focus();
        spot.remove();
      });
      throw new Error('read failed');
    });
    const remove = await screen.findByTestId('demo-remove');
    remove.focus();
    fireEvent.click(remove);
    expect(
      await screen.findByText('Could not remove your demonstration. Try again.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('demo-your-gif')));
  });
});

describe("the lifter's own demonstration after the eleventh pass of item 50", () => {
  const bench = requireExercise('barbell-bench-press');
  for (const [name, sheet] of [
    [
      'How to',
      (open: boolean) => <HowToSheet exercise={open ? bench : null} onClose={() => undefined} />,
    ],
    [
      'the details sheet',
      (open: boolean) => (
        <ExerciseDetailSheet exercise={open ? bench : null} onClose={() => undefined} />
      ),
    ],
  ] as const) {
    it(`opens ${name} kept shut on the picture that replaced the one it showed`, async () => {
      const { store } = createTestStore();
      const view = render(<Providers store={store}>{sheet(true)}</Providers>);
      await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
      await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
      await waitFor(() =>
        expect(screen.getByTestId('custom-demo')).toHaveAttribute('src', ONE_FRAME_GIF),
      );
      view.rerender(<Providers store={store}>{sheet(false)}</Providers>);
      const other = sameSizeGif();
      await store.addCustomMedia('barbell-bench-press', picture(other));
      await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
      view.rerender(<Providers store={store}>{sheet(true)}</Providers>);
      // The first picture it shows is the one the lifter has now.
      expect(screen.getByTestId('custom-demo')).toHaveAttribute('src', other);
    });
  }
});

describe("the lifter's own demonstration when the data holds none, with no removal made here", () => {
  it('lets the picture go: it never shows before a later pick is read', async () => {
    const { store } = createTestStore();
    const shown: string[] = [];
    function Watch() {
      shown.push(useCustomMedia('barbell-bench-press')?.dataUrl ?? 'none');
      return null;
    }
    render(
      <Providers store={store}>
        <Watch />
      </Providers>,
    );
    await waitFor(() => expect(store.getSnapshot().status).toBe('ready'));
    await store.addCustomMedia('barbell-bench-press', picture(ONE_FRAME_GIF));
    await waitFor(() => expect(shown[shown.length - 1]).toBe(ONE_FRAME_GIF));
    // A restore with no pictures: the data holds none, and no removal was made here.
    const db = await store.getDatabase();
    await db.delete('customMedia', 'barbell-bench-press');
    await store.hydrate();
    await waitFor(() => expect(shown[shown.length - 1]).toBe('none'));
    const from = shown.length;
    // A new pick: the picture let go never shows, not even until the new one is read.
    const other = sameSizeGif();
    await store.addCustomMedia('barbell-bench-press', picture(other));
    await waitFor(() => expect(shown[shown.length - 1]).toBe(other));
    expect(shown.slice(from)).not.toContain(ONE_FRAME_GIF);
  });
});
