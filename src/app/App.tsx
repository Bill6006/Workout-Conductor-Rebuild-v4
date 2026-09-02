import { useEffect } from 'react';
import { AppShell } from '../components/AppShell/AppShell';
import { UpdatePrompt } from './pwa/UpdatePrompt';
import { ActiveScreen } from './routes';
import { useHashRoute } from './useHashRoute';

export function App() {
  const routeId = useHashRoute();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [routeId]);

  return (
    <AppShell activeRoute={routeId}>
      <ActiveScreen routeId={routeId} />
      <UpdatePrompt />
    </AppShell>
  );
}
