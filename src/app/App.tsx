import { useEffect, useLayoutEffect } from 'react';
import { AppShell } from '../components/AppShell/AppShell';
import { CalibrationOverlay } from '../components/CalibrationOverlay/CalibrationOverlay';
import { Card } from '../components/Card/Card';
import { UNFINISHED_NUDGE_MINUTES } from '../core/alerts/cues';
import { lastActivityAt, useWorkoutAlerts } from '../core/alerts/useWorkoutAlerts';
import { useWakeLock } from '../core/screen/useWakeLock';
import { useMomentReached, useNow } from '../core/time/clock';
import { localDayKey } from '../core/time/localDate';
import { useAppState, useAppStore } from '../core/state/useAppStore';
import { BarcodeLayer } from '../features/barcode/BarcodeLayer';
import { RestoringScreen } from '../features/onboarding/RestoringScreen';
import { type RouteId } from './navigation';
import { UpdatePrompt } from './pwa/UpdatePrompt';
import { SessionRecoveryNotice } from './SessionRecoveryNotice';
import { ActiveScreen } from './routes';
import { useHashRoute } from './useHashRoute';
import { useSetupLink } from './useSetupLink';

/**
 * Today's plan is the device's day's on every tab: a new day, or the app back in front on one, puts
 * it in place of the day before's at once (the owner's report of 2026-11-01: left on screen, it
 * went at the next save, a Home place's among them). Alone in its own component, the minute's
 * clock re-renders nothing else.
 */
function DayRefresh(): null {
  const store = useAppStore();
  const day = localDayKey(new Date(useNow() || 0).toISOString());
  useEffect(() => {
    store.refreshSession();
  }, [store, day]);
  return null;
}

export function App() {
  const routeId = useHashRoute();
  const state = useAppState();
  useSetupLink();
  useWorkoutAlerts();
  // The screen stays on while a workout runs, on any tab (Maintenance 29, the owner's item 8);
  // paused, or left half an hour with nothing logged (left open, as the alerts call it), it may
  // sleep, and the next set logged keeps it on again.
  const running = state.session?.status === 'active';
  const lastActive = running && state.session ? lastActivityAt(state.session) : null;
  const leftOpen = useMomentReached(
    lastActive ? Date.parse(lastActive) + UNFINISHED_NUDGE_MINUTES * 60_000 : null,
  );
  useWakeLock(running && !leftOpen);

  // First run (or a storage error with nothing saved) goes straight to setup.
  const needsOnboarding = state.status === 'ready' && state.profile === null;
  const effectiveRoute: RouteId = needsOnboarding ? 'onboarding' : routeId;

  // Keyed on the effective route so finishing setup (hash unchanged) also
  // starts Today at the top instead of wherever the wizard was scrolled. Before the screen's own
  // effects (Maintenance 25): a Settings row a link names then brings itself into view.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0 });
  }, [effectiveRoute]);

  if (state.status === 'loading') {
    return (
      <AppShell activeRoute={routeId} showNav={false}>
        <Card eyebrow="Loading" title="Opening your data">
          <p style={{ color: 'var(--color-text-muted)' }}>Reading local storage on this device…</p>
        </Card>
      </AppShell>
    );
  }

  const showNav = effectiveRoute !== 'onboarding';

  return (
    <AppShell activeRoute={effectiveRoute} showNav={showNav}>
      <DayRefresh />
      {state.status === 'error' ? (
        <Card eyebrow="Storage" title="Local storage is unavailable">
          <p style={{ color: 'var(--color-text-muted)' }}>{state.error}</p>
        </Card>
      ) : null}
      {showNav ? <SessionRecoveryNotice /> : null}
      {/* Setup waits while the cloud copy brings back a cleared phone's data (Maintenance 25). */}
      {needsOnboarding && state.restoring ? (
        <RestoringScreen />
      ) : (
        <ActiveScreen routeId={effectiveRoute} />
      )}
      <CalibrationOverlay />
      <UpdatePrompt />
      <BarcodeLayer />
    </AppShell>
  );
}
