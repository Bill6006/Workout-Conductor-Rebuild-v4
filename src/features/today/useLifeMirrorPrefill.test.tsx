import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LifeMirrorPrefill } from '../../engine/readiness/lifeMirror';
import { Providers, createTestStore } from '../../test/testStore';
import { PREFILL_WAIT_MS, useLifeMirrorPrefill } from './useLifeMirrorPrefill';

/**
 * Item 48: the check-in waits for Life Mirror's read three seconds at most, and a read that comes
 * after the wait, or after the sheet closed, changes nothing on it (the review of item 48: values
 * the lifter had looked at changed under them). Synthetic data only.
 */

const filled: LifeMirrorPrefill = { energy: { value: 4, at: '2026-09-02T09:00:00.000Z' } };

afterEach(() => {
  vi.useRealTimers();
});

/** The hook over a store whose reads answer only when told to, the latest first. */
function reading() {
  vi.useFakeTimers();
  const { store } = createTestStore();
  const answers: ((read: LifeMirrorPrefill | null) => void)[] = [];
  const read = vi.spyOn(store, 'lifeMirrorPrefill').mockImplementation(
    () =>
      new Promise((resolve) => {
        answers.push(resolve);
      }),
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Providers store={store}>{children}</Providers>
  );
  const hook = renderHook(({ open }: { open: boolean }) => useLifeMirrorPrefill(open), {
    initialProps: { open: true },
    wrapper,
  });
  const answer = (value: LifeMirrorPrefill | null) =>
    act(async () => {
      answers[answers.length - 1]!(value);
    });
  return { hook, read, answer };
}

describe('the wait for Life Mirror’s check-in', () => {
  it('takes a read within three seconds', async () => {
    const { hook, answer } = reading();
    await act(async () => {
      vi.advanceTimersByTime(PREFILL_WAIT_MS - 1);
    });
    await answer(filled);
    expect(hook.result.current).toEqual(filled);
  });

  it('lets a later read go', async () => {
    const { hook, answer } = reading();
    await act(async () => {
      vi.advanceTimersByTime(PREFILL_WAIT_MS);
    });
    await answer(filled);
    expect(hook.result.current).toBeNull();
  });

  it('lets a read go once the sheet closes, and reads again as it opens', async () => {
    const { hook, read, answer } = reading();
    hook.rerender({ open: false });
    await answer(filled);
    expect(hook.result.current).toBeNull();
    hook.rerender({ open: true });
    expect(read).toHaveBeenCalledTimes(2);
    await answer(filled);
    expect(hook.result.current).toEqual(filled);
  });
});
