import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeBackup } from '../../core/backup/backup';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { BackupCard } from './BackupCard';

const downloadTextFile = vi.fn();

vi.mock('../../core/backup/download', async () => {
  const actual = await vi.importActual<typeof import('../../core/backup/download')>(
    '../../core/backup/download',
  );
  return { ...actual, downloadTextFile: (...args: unknown[]) => downloadTextFile(...args) };
});

async function seeded() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

describe('BackupCard', () => {
  beforeEach(() => {
    downloadTextFile.mockReset();
  });

  it('exports a Full Backup JSON file', async () => {
    const { store } = await seeded();
    const user = userEvent.setup();
    render(
      <Providers store={store}>
        <BackupCard />
      </Providers>,
    );
    await user.click(screen.getByRole('button', { name: 'Export Full Backup JSON' }));
    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1));
    const [filename, text] = downloadTextFile.mock.calls[0] as [string, string];
    expect(filename).toBe('workout-conductor-backup-20260902-1200.json');
    const parsed = JSON.parse(text) as { format: string; data: { locations: unknown[] } };
    expect(parsed.format).toBe('workout-conductor-backup');
    expect(parsed.data.locations).toHaveLength(2);
    expect(store.getSnapshot().localSettings.lastExportAt).toBe(TEST_NOW);
  });

  it('previews an import, then restores it with verification', async () => {
    const { store } = await seeded();
    const user = userEvent.setup();
    const backup = await store.createBackup({ version: '0.0.1' });
    const modified = structuredClone(backup);
    if (modified.data.profile) modified.data.profile.goals.primary = 'bigger-chest';
    const file = new File([serializeBackup(modified)], 'backup.json', { type: 'application/json' });

    render(
      <Providers store={store}>
        <BackupCard />
      </Providers>,
    );
    await user.upload(screen.getByTestId('import-file-input'), file);
    const dialog = await screen.findByRole('dialog', { name: 'Restore this backup?' });
    expect(dialog).toHaveTextContent('Bigger chest');
    expect(dialog).toHaveTextContent('Places2');

    await user.click(screen.getByRole('button', { name: 'Replace my data' }));
    await waitFor(() => expect(store.getSnapshot().profile?.goals.primary).toBe('bigger-chest'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(store.getSnapshot().localSettings.lastImportAt).toBe(TEST_NOW);
  });

  it('rejects a file that is not a backup', async () => {
    const { store } = await seeded();
    const user = userEvent.setup();
    render(
      <Providers store={store}>
        <BackupCard />
      </Providers>,
    );
    await user.upload(
      screen.getByTestId('import-file-input'),
      new File(['{"format":"nope"}'], 'x.json', { type: 'application/json' }),
    );
    expect(await screen.findByText(/not a Workout Conductor backup/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
