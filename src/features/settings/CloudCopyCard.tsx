import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { FactList } from '../../components/FactList/FactList';
import formStyles from '../../components/Form/Form.module.css';
import { useToast } from '../../components/Toast/useToast';
import { useAppState, useAppStore } from '../../core/state/useAppStore';
import { formatDateTime } from '../../core/time/clock';
import styles from './Settings.module.css';

/**
 * Settings > Cloud copy. The database URL is a constant and shown; the token is
 * pasted once and kept in the app's own storage on this device. Off until a
 * token exists. One status line, one "Sync now" button.
 */
export function CloudCopyCard() {
  const store = useAppStore();
  const state = useAppState();
  const toast = useToast();
  const cloud = state.cloud;
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await store.setCloudToken(token);
      setToken('');
      toast.show('Token saved on this device', 'success');
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not save the token', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await store.clearCloudToken();
      toast.show('Token removed; the cloud copy is off', 'success');
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    const outcome = await store.syncNow({ pull: true, force: true });
    if (!outcome) return;
    if (outcome.error) {
      toast.show(outcome.error, 'error');
    } else if (outcome.ran) {
      const received = outcome.applied + outcome.removed;
      toast.show(`Synced: ${outcome.pushed} sent, ${received} received`, 'success');
    } else {
      toast.show(
        outcome.reason === 'offline'
          ? 'Offline; it will sync when you are back online'
          : 'Waiting before the next attempt',
        'success',
      );
    }
  };

  const status = !cloud.configured
    ? 'Off until you paste a token.'
    : cloud.syncing
      ? 'Syncing…'
      : cloud.lastError
        ? `Last attempt failed: ${cloud.lastError}`
        : cloud.lastSyncAt
          ? `Last sync ${formatDateTime(cloud.lastSyncAt)}.`
          : 'Waiting for the first sync.';
  const pending = `${cloud.pending} ${cloud.pending === 1 ? 'change' : 'changes'} waiting`;

  return (
    <Card eyebrow="Cloud copy" title="Cloud copy">
      <p className={styles.body}>
        An optional copy of your data in a database you run. It is off until you paste the database
        token here. The token stays on this device in the app's own storage and is never part of a
        backup. This device stays the source of truth; another device gets everything by installing
        the app and pasting the same token.
      </p>
      <FactList
        items={[
          { label: 'Database', value: cloud.url },
          { label: 'Token', value: cloud.configured ? 'Saved on this device' : 'Not set' },
          { label: 'Status', value: status },
          { label: 'Pending', value: pending },
        ]}
      />
      {cloud.configured ? (
        <div className={styles.buttonRow}>
          <Button
            onClick={() => void sync()}
            disabled={cloud.syncing || busy}
            data-testid="cloud-sync-now"
          >
            Sync now
          </Button>
          <Button
            variant="secondary"
            onClick={() => void remove()}
            disabled={busy}
            data-testid="cloud-remove-token"
          >
            Remove token
          </Button>
        </div>
      ) : (
        <>
          <label className={styles.body} htmlFor="cloud-token">
            Database token
          </label>
          <div className={formStyles.inputRow}>
            <input
              id="cloud-token"
              className={formStyles.input}
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Paste the token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              data-testid="cloud-token"
            />
          </div>
          <div className={styles.buttonRow}>
            <Button
              onClick={() => void save()}
              disabled={token.trim().length === 0 || busy}
              data-testid="cloud-save-token"
            >
              Save token
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
