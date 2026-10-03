import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { summarizeBackup } from '../../core/backup/backup';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { createFakeCloud } from '../../test/fakeCloud';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { RestorePreviewSheet } from './RestorePreviewSheet';

/**
 * Maintenance 25: a restore never cuts the cloud copy back, and the preview says so when the
 * cloud copy is on.
 */

async function previewWith(cloudOn: boolean) {
  const handle = createTestStore(
    cloudOn ? { cloudClient: async () => createFakeCloud().client, isOnline: () => true } : {},
  );
  const { store } = handle;
  await store.hydrate();
  await store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  if (cloudOn) await store.setCloudToken('restore-preview-token-never-real');
  const backup = await store.createBackup({ version: 'test' });
  render(
    <Providers store={store}>
      <RestorePreviewSheet
        open
        title="Restore this backup?"
        summary={summarizeBackup(backup)}
        busy={false}
        confirmLabel="Restore"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    </Providers>,
  );
  return store;
}

describe('the restore preview', () => {
  it('says nothing is deleted from the cloud copy, when it is on', async () => {
    const store = await previewWith(true);
    expect(await screen.findByTestId('restore-cloud-note')).toHaveTextContent(
      'Nothing is deleted from the cloud copy',
    );
    store.stopCloud();
  });

  it('says nothing of a cloud copy that is off', async () => {
    await previewWith(false);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('restore-cloud-note')).toBeNull();
  });
});
