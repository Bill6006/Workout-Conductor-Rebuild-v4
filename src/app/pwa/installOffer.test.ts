import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type InstallOffer,
  installApp,
  installOffered,
  resetInstallOfferForTests,
  useInstallOffer,
  watchInstallOffer,
} from './installOffer';

/**
 * Installing from the app's own page (2026-10-24, Life Mirror's fix of 2026-10-03): the browser's
 * offer is held from start-up, used once by Install the app, and let go once the app is installed.
 */

/** A stand-in for the browser's offer: its prompt() recorded, its answer the one given. */
function browserOffer(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(async () => undefined);
  Object.defineProperty(event, 'prompt', { value: prompt });
  Object.defineProperty(event, 'userChoice', {
    value: Promise.resolve({ outcome, platform: 'web' }),
  });
  return { event: event as InstallOffer, prompt };
}

afterEach(() => {
  resetInstallOfferForTests();
});

describe('the install offer', () => {
  it('is held from the moment the browser makes it, with the browser’s own prompt held back', () => {
    const target = new EventTarget();
    const stop = watchInstallOffer(target);
    expect(installOffered()).toBe(false);
    const { event } = browserOffer();
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(installOffered()).toBe(true);
    stop();
  });

  it('asks once when tapped: prompt(), then the answer read, then the offer cleared', async () => {
    const target = new EventTarget();
    const stop = watchInstallOffer(target);
    const { event, prompt } = browserOffer('accepted');
    target.dispatchEvent(event);
    expect(await installApp()).toBe('accepted');
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(installOffered()).toBe(false);
    // Used: a second tap asks nothing until the browser offers again.
    expect(await installApp()).toBe('none');
    expect(prompt).toHaveBeenCalledTimes(1);
    stop();
  });

  it('keeps the offer while the browser’s dialog is open, and a second tap then asks nothing', async () => {
    const target = new EventTarget();
    const stop = watchInstallOffer(target);
    let answer: (value: { outcome: 'dismissed' }) => void = () => undefined;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    const prompt = vi.fn(async () => undefined);
    Object.defineProperty(event, 'prompt', { value: prompt });
    Object.defineProperty(event, 'userChoice', {
      value: new Promise((resolve) => {
        answer = resolve;
      }),
    });
    target.dispatchEvent(event);
    const { result } = renderHook(() => useInstallOffer());
    let first: Promise<string> = Promise.resolve('');
    act(() => {
      first = installApp();
    });
    expect(result.current).toBe('asking');
    expect(installOffered()).toBe(true);
    // A second tap while the dialog is open asks nothing: no second prompt().
    const second = installApp();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(await second).toBe('none');
    await act(async () => {
      answer({ outcome: 'dismissed' });
      expect(await first).toBe('dismissed');
    });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(result.current).toBe('none');
    stop();
  });

  it('keeps an offer the browser makes while its dialog is open, for the next tap', async () => {
    const target = new EventTarget();
    const stop = watchInstallOffer(target);
    let answer: (value: { outcome: 'dismissed' }) => void = () => undefined;
    const first = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperty(first, 'prompt', { value: vi.fn(async () => undefined) });
    Object.defineProperty(first, 'userChoice', {
      value: new Promise((resolve) => {
        answer = resolve;
      }),
    });
    target.dispatchEvent(first);
    const asked = installApp();
    const { event: second, prompt } = browserOffer('accepted');
    target.dispatchEvent(second);
    answer({ outcome: 'dismissed' });
    expect(await asked).toBe('dismissed');
    // Only the offer used is cleared: the new one stands.
    expect(installOffered()).toBe(true);
    expect(await installApp()).toBe('accepted');
    expect(prompt).toHaveBeenCalledTimes(1);
    stop();
  });

  it('reads a dismissal as one, and clears the offer either way', async () => {
    const target = new EventTarget();
    const stop = watchInstallOffer(target);
    target.dispatchEvent(browserOffer('dismissed').event);
    expect(await installApp()).toBe('dismissed');
    expect(installOffered()).toBe(false);
    stop();
  });

  it('clears the offer even when the prompt fails, so a stale offer never stays on screen', async () => {
    const target = new EventTarget();
    const stop = watchInstallOffer(target);
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperty(event, 'prompt', {
      value: vi.fn(async () => {
        throw new DOMException('already used', 'InvalidStateError');
      }),
    });
    Object.defineProperty(event, 'userChoice', { value: new Promise(() => undefined) });
    target.dispatchEvent(event);
    await expect(installApp()).rejects.toThrow('already used');
    expect(installOffered()).toBe(false);
    stop();
  });

  it('lets the offer go once the app is installed, however it was installed', () => {
    const target = new EventTarget();
    const stop = watchInstallOffer(target);
    target.dispatchEvent(browserOffer().event);
    expect(installOffered()).toBe(true);
    target.dispatchEvent(new Event('appinstalled'));
    expect(installOffered()).toBe(false);
    stop();
  });

  it('follows the offer on screen as it comes and goes', () => {
    const target = new EventTarget();
    const stop = watchInstallOffer(target);
    const { result } = renderHook(() => useInstallOffer());
    expect(result.current).toBe('none');
    act(() => {
      target.dispatchEvent(browserOffer().event);
    });
    expect(result.current).toBe('offered');
    act(() => {
      target.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.current).toBe('none');
    stop();
  });

  it('stops listening for installs too once told to stop', () => {
    const target = new EventTarget();
    const stop = watchInstallOffer(target);
    target.dispatchEvent(browserOffer().event);
    stop();
    target.dispatchEvent(new Event('appinstalled'));
    expect(installOffered()).toBe(true);
  });

  it('stops watching when told: an offer after that is the browser’s own', () => {
    const target = new EventTarget();
    const stop = watchInstallOffer(target);
    stop();
    const { event } = browserOffer();
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(installOffered()).toBe(false);
  });
});
