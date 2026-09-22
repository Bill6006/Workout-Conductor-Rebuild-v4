import { Button } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { useAppSelector, useAppStore } from '../core/state/useAppStore';

/**
 * Shown once, when the app opened and found a stored workout it could not read
 * back. The copy was kept aside before a fresh session was made, so nothing the
 * lifter logged is gone; this says so instead of starting over in silence.
 */
export function SessionRecoveryNotice() {
  const store = useAppStore();
  const recovery = useAppSelector((state) => state.sessionRecovery);
  if (!recovery) return null;
  const sets = recovery.setsLogged;
  const what =
    sets !== null && sets > 0
      ? `Its ${sets} logged ${sets === 1 ? 'set is' : 'sets are'}`
      : 'It is';
  return (
    <div data-testid="session-recovery">
      <Card eyebrow="Kept safe" title="A workout couldn't be reopened" tone="accent">
        <p style={{ margin: '0 0 12px', color: 'var(--color-text-muted)' }}>
          {recovery.saved
            ? `${what} kept on this phone so ${sets !== null && sets > 0 ? 'they' : 'it'} can be restored.`
            : 'It could not be kept on this phone either.'}
        </p>
        <Button
          variant="secondary"
          onClick={() => store.dismissSessionRecovery()}
          data-testid="session-recovery-dismiss"
        >
          OK
        </Button>
      </Card>
    </div>
  );
}
