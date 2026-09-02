import { useEffect } from 'react';
import { AppShell } from '../components/AppShell/AppShell';
import { Card } from '../components/Card/Card';
import { useAppState } from '../core/state/useAppStore';
import { type RouteId } from './navigation';
import { UpdatePrompt } from './pwa/UpdatePrompt';
import { ActiveScreen } from './routes';
import { useHashRoute } from './useHashRoute';

export function App() {
  const routeId = useHashRoute();
  const state = useAppState();

  // First run (or a storage error with nothing saved) goes straight to setup.
  const needsOnboarding = state.status === 'ready' && state.profile === null;
  const effectiveRoute: RouteId = needsOnboarding ? 'onboarding' : routeId;

  // Keyed on the effective route so finishing setup (hash unchanged) also
  // starts Today at the top instead of wherever the wizard was scrolled.
  useEffect(() => {
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
      {state.status === 'error' ? (
        <Card eyebrow="Storage" title="Local storage is unavailable">
          <p style={{ color: 'var(--color-text-muted)' }}>{state.error}</p>
        </Card>
      ) : null}
      <ActiveScreen routeId={effectiveRoute} />
      <UpdatePrompt />
    </AppShell>
  );
}
