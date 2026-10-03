import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useAppSelector } from '../../core/state/useAppStore';
import { page } from './pageReload';
import styles from './UpdatePrompt.module.css';

const OFFLINE_READY_DISMISS_MS = 4000;
/** How often a page left open looks for a new release. */
export const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Safe service-worker update surface.
 *
 * A new version never takes over silently: the waiting worker is only
 * activated when the user taps Reload. During a workout the offer stays and
 * says the logged sets and timers carry on after the reload, because they do:
 * the session lives in local storage and the rest timer keeps an absolute end
 * time. A value on a dial not yet logged is not kept, so it is not promised.
 * Holding the offer back would leave a broken save with no way to receive its
 * own fix.
 *
 * An installed app on Android is mostly brought back from the background, not loaded again, and a
 * browser only looks for a new worker when a page loads. So the app looks for one itself
 * (Maintenance 25, the owner's item 6): when it comes back to the front, when the network comes
 * back, and hourly while it stays open. A release put off with Later is offered again the next time
 * the app comes back, until the page loads again: whether it still waits, or already runs the
 * service worker (it took over with no page under it, or another page let it in), so an installed
 * app never sits on an old build unnoticed.
 *
 * The plugin listens for new workers only until it sees one it takes for another page's: one found
 * a minute or more after the page registered, or any after its first. It offers that one if it
 * installs, and never sees a worker after it: a release found again after such a worker failed to
 * install, say, it never offers, and its Reload hands such a worker over without loading the page.
 * So the app listens for itself: it offers a release the moment it waits, and when another page of
 * the app let it take over; and Reload ends on the new build whether or not the plugin still
 * listens.
 */
export function UpdatePrompt() {
  const sessionStatus = useAppSelector((state) => state.session?.status ?? null);
  const inWorkout = sessionStatus === 'active' || sessionStatus === 'paused';
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  // An offer made and not taken: this page runs the old build until it loads again.
  const owedRef = useRef(false);
  // The offer, for the registration's own events: set once the hook below gives it.
  const offerRef = useRef<() => void>(() => undefined);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    // The plugin's own offer: of a release waiting, or of one it saw take over with no page under
    // it (a page no worker ran yet).
    onNeedRefresh() {
      owedRef.current = true;
    },
    onRegisteredSW(_url, registration) {
      registrationRef.current = registration ?? null;
      // A page loaded past a worker already running (a hard reload in a desktop browser) is not a
      // first visit: it came from the network, and only the plugin offers it a release, as before
      // (the fifth review: it was offered the very build it ran).
      const pastWorker =
        navigator.serviceWorker?.controller === null && Boolean(registration?.active);
      // A release found at any time is offered as soon as it installs: on a page a worker runs, or
      // beside one already active (a page no worker runs yet, where it takes over at once). The
      // first worker of a first visit is no release (the fourth review).
      registration?.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (
            worker.state === 'installed' &&
            registration.waiting === worker &&
            (navigator.serviceWorker.controller !== null ||
              (Boolean(registration.active) && !pastWorker))
          ) {
            offerRef.current();
          }
        });
      });
      // Let in by another page of the app (its Reload tapped): this page is old now.
      navigator.serviceWorker?.addEventListener('controllerchange', () => offerRef.current());
    },
    onRegisterError(error) {
      console.warn('Service worker registration failed', error);
    },
  });

  useEffect(() => {
    offerRef.current = () => {
      owedRef.current = true;
      setNeedRefresh(true);
    };
  }, [setNeedRefresh]);

  /**
   * Reload ends on the new build. A release waiting takes over when told, and the page loads again
   * once it has: as this page's worker, or, on a page no worker runs yet, once it is active. With
   * none waiting, the new release already runs the service worker (it took over with no page under
   * it, or another page let it in), and only this page is old.
   */
  const reload = () => {
    const waiting = registrationRef.current?.waiting ?? null;
    if (!waiting) {
      page.reload();
      return;
    }
    let loading = false;
    const load = () => {
      if (loading) return;
      loading = true;
      page.reload();
    };
    navigator.serviceWorker?.addEventListener('controllerchange', load, { once: true });
    waiting.addEventListener('statechange', () => {
      if (waiting.state === 'activated') load();
    });
    void updateServiceWorker(true);
  };

  useEffect(() => {
    // `offer`: a release put off with Later is offered again: one waiting, or one offered before
    // that runs the service worker now, the page still on the old build.
    const look = (offer: boolean) => {
      const registration = registrationRef.current;
      if (!registration || document.visibilityState !== 'visible') return;
      if (offer && (registration.waiting || owedRef.current)) offerRef.current();
      if (navigator.onLine === false) return;
      // A worker found this way installs, then waits, and the listener above offers it.
      registration.update().catch(() => undefined);
    };
    const onFront = () => look(true);
    // Back online, it looks; a release put off with Later waits for the app to come back.
    const onOnline = () => look(false);
    document.addEventListener('visibilitychange', onFront);
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => look(false), UPDATE_CHECK_MS);
    return () => {
      document.removeEventListener('visibilitychange', onFront);
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, [setNeedRefresh]);

  useEffect(() => {
    if (!offlineReady) {
      return;
    }
    const timer = window.setTimeout(() => setOfflineReady(false), OFFLINE_READY_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh && !offlineReady) {
    return null;
  }

  return (
    <div className={styles.toast} role="status" aria-live="polite" data-testid="update-prompt">
      {needRefresh ? (
        <>
          <div className={styles.text}>
            <strong>New version available</strong>
            <span>
              {inWorkout
                ? 'Logged sets and timers are kept on this device and carry on after the reload.'
                : 'Reload when you are ready. Nothing on this device is lost.'}
            </span>
          </div>
          <div className={styles.actions}>
            <button type="button" onClick={() => setNeedRefresh(false)}>
              Later
            </button>
            <button type="button" className={styles.primary} onClick={reload}>
              Reload
            </button>
          </div>
        </>
      ) : (
        <div className={styles.text}>
          <strong>Ready to work offline</strong>
          <span>The app shell is now cached on this device.</span>
        </div>
      )}
    </div>
  );
}
