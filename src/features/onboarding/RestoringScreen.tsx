import { useEffect, useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { CLOUD_OFFLINE } from '../../core/state/appStore';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';

/**
 * In place of setup while a phone with a cloud copy and an empty database waits for its first walk
 * of the copy (Maintenance 25, the tenth review). Setup made during that walk could be pushed over
 * the history it stands in for; so it waits. Offline, or with a copy that cannot be reached, the
 * lifter may set up anyway, and the copy's records replace what they set up once it is reached.
 */
/** How long a walk runs before setting up anyway is offered all the same. */
export const RESTORING_PATIENCE_MS = 20_000;

export function RestoringScreen() {
  const store = useAppStore();
  const cloud = useAppSelector((state) => state.cloud);
  const offline = cloud.lastError === CLOUD_OFFLINE;
  const failed = cloud.lastError !== null && !offline;
  // A walk that takes long (a slow or silent connection) need not hold the lifter: a record set
  // up meanwhile gives way to the cloud's at the end of the walk. Finish waits for the sync under
  // way and the one queued behind it; a copy that does not answer fails the sync's first request
  // after CLOUD_REQUEST_TIMEOUT_MS, and a slow one is waited for (CLOUD_TRANSFER_TIMEOUT_MS).
  const [long, setLong] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setLong(true), RESTORING_PATIENCE_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <Card eyebrow="Cloud copy" title="Bringing your data back">
      <div data-testid="restoring-screen" role="status">
        <p style={{ color: 'var(--color-text-muted)' }}>
          {offline
            ? 'This phone is offline. Your profile, places and history come back from your cloud copy once it is online.'
            : failed
              ? `Your cloud copy could not be reached (${cloud.lastError}). It tries again by itself.`
              : 'Your profile, places and history are coming back from your cloud copy.'}
        </p>
      </div>
      {offline || failed || long ? (
        <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
          <Button
            variant="primary"
            onClick={() => void store.syncNow({ pull: true, force: true })}
            data-testid="restoring-retry"
          >
            Try again
          </Button>
          <Button
            variant="secondary"
            onClick={() => store.skipRestoring()}
            data-testid="restoring-skip"
          >
            Set up anyway
          </Button>
          <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>
            What you set up now is replaced by your cloud copy once it is reached.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
