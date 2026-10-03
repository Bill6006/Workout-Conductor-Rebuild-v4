import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { FactList } from '../../components/FactList/FactList';
import formStyles from '../../components/Form/Form.module.css';
import { useToast } from '../../components/Toast/useToast';
import { CLOUD_OFFLINE, CloudOccupiedError } from '../../core/state/appStore';
import { useAppState, useAppStore } from '../../core/state/useAppStore';
import { formatDateTime } from '../../core/time/clock';
import styles from './Settings.module.css';

/**
 * Settings > Cloud copy. One database per person: the address and the token are
 * both kept in the app's own storage on this device, never in a backup and
 * never in the built files. Off until both are set. Before this device commits
 * to a database it has not used, the app checks the tables are there and that
 * the database is not already carrying somebody else's history.
 */
/**
 * A reason as a sentence of its own: some end on the words of the database's reply ("Failed to
 * fetch") or on an address, with no stop, and another sentence follows (the fourth review).
 */
function asSentence(text: string): string {
  return /[.!?…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

export function CloudCopyCard() {
  const store = useAppStore();
  const state = useAppState();
  const toast = useToast();
  const cloud = state.cloud;
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(cloud.url);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [occupied, setOccupied] = useState<string | null>(null);

  const open = !cloud.configured || editing;
  // What the cloud copy never holds, so "0 changes waiting" is not read as covering it
  // (Maintenance 25): the barcodes, each said to have a second copy only where one reads back,
  // and your own demonstrations.
  const phoneOnly = [
    ...state.barcodes.flatMap((barcode) => {
      const place = state.locations.find((location) => location.id === barcode.locationId);
      if (!place) return [];
      const copy = state.barcodeCopies[barcode.id] ?? 'none';
      return [
        copy === 'none'
          ? `${place.name} barcode, on this phone once (too big for a second copy)`
          : `${place.name} barcode, with a second copy on this phone`,
      ];
    }),
    ...(state.customCounts.media > 0
      ? [
          `${state.customCounts.media} ${
            state.customCounts.media === 1 ? 'demonstration' : 'demonstrations'
          } of your own, in backups you export`,
        ]
      : []),
  ];

  const save = async (acceptExisting = false) => {
    setBusy(true);
    try {
      await store.setCloudCredentials({ url, token, acceptExisting });
      setToken('');
      setEditing(false);
      setOccupied(null);
      toast.show('Cloud copy saved on this device', 'success');
    } catch (error) {
      if (error instanceof CloudOccupiedError) {
        setOccupied(error.message);
      } else {
        toast.show(error instanceof Error ? error.message : 'Could not save', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await store.clearCloudToken();
      setEditing(false);
      setOccupied(null);
      toast.show('Token removed; the cloud copy is off', 'success');
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    // The button walks the whole history, so a record this device lost comes back.
    const outcome = await store.syncNow({ pull: true, force: true, full: true });
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

  // A problem with the copy, from its last attempt.
  const status = cloud.syncing
    ? 'Syncing…'
    : cloud.lastError
      ? cloud.configured && cloud.lastError !== CLOUD_OFFLINE
        ? `Last attempt failed: ${cloud.lastError}`
        : cloud.lastError
      : !cloud.configured
        ? 'Off until you paste a token.'
        : cloud.lastSyncAt
          ? `Last sync ${formatDateTime(cloud.lastSyncAt)}.`
          : 'Waiting for the first sync.';
  const pending = `${cloud.pending} ${cloud.pending === 1 ? 'change' : 'changes'} waiting`;
  // A loss of the token is said on the card, with when, rather than shown as "off".
  const notice = cloud.notice
    ? `${formatDateTime(cloud.notice.at)}${
        cloud.notice.lastSeenAt ? `, last seen ${formatDateTime(cloud.notice.lastSeenAt)}` : ''
      }: ${cloud.notice.detail}`
    : null;

  return (
    <>
      <p className={styles.body}>
        An optional copy of your data in a database of your own. It is off until you paste its
        address and token here. Both stay on this device in the app's own storage and are never part
        of a backup. This device stays the source of truth; another of your own devices gets
        everything by installing the app and pasting the same two values.
      </p>
      <FactList
        items={[
          { label: 'Database', value: cloud.url },
          {
            label: 'Token',
            value: cloud.configured
              ? 'Saved on this device'
              : cloud.notice?.kind === 'missing'
                ? 'Missing'
                : 'Not set',
          },
          { label: 'Status', value: status },
          { label: 'Pending', value: pending },
          ...(phoneOnly.length > 0
            ? [{ label: 'Not in the copy', value: phoneOnly.join(' · ') }]
            : []),
        ]}
      />
      {notice ? (
        <p className={styles.warning} role="status" data-testid="cloud-notice">
          {notice}
        </p>
      ) : null}
      {cloud.linkError ? (
        // A setup link leaves no trace in the address bar, so why it was not used is said here,
        // whether the copy is off or still going to the database it had (Maintenance 25).
        <p className={styles.warning} role="status" data-testid="cloud-link-error">
          {`The setup link was not used: ${asSentence(cloud.linkError)}${
            cloud.configured ? ' This device still uses the database above.' : ''
          }`}
        </p>
      ) : null}

      {occupied ? (
        <div className={styles.body} data-testid="cloud-occupied" role="alert">
          <p>{occupied}</p>
          <div className={styles.buttonRow}>
            <Button
              variant="danger"
              onClick={() => void save(true)}
              disabled={busy}
              data-testid="cloud-accept-existing"
            >
              Use it anyway
            </Button>
            <Button variant="secondary" onClick={() => setOccupied(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {open ? (
        <>
          <label className={styles.body} htmlFor="cloud-url">
            Database address
          </label>
          <div className={formStyles.inputRow}>
            <input
              id="cloud-url"
              className={formStyles.input}
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Paste the database address"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              data-testid="cloud-url"
            />
          </div>
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
              disabled={token.trim().length === 0 || url.trim().length === 0 || busy}
              data-testid="cloud-save-token"
            >
              Save
            </Button>
            {cloud.configured ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(false);
                  setOccupied(null);
                  setUrl(cloud.url);
                  setToken('');
                }}
                disabled={busy}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </>
      ) : (
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
            onClick={() => {
              setUrl(cloud.url);
              setEditing(true);
            }}
            disabled={busy}
            data-testid="cloud-change"
          >
            Change database
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
      )}
    </>
  );
}
