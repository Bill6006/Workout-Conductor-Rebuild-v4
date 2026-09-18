import { describe, expect, it } from 'vitest';
import { explainSaveFailure } from './explainSaveFailure';
import { StorageUnavailableError } from './indexedDb';
import { SaveVerificationError } from './verifiedSave';

describe('a failed save explaining itself', () => {
  it('names the storage layer in plain words and always says nothing was lost', () => {
    const closing = new Error(
      "Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.",
    );
    expect(explainSaveFailure(closing)).toMatch(/browser closed the app's database/);
    expect(explainSaveFailure(closing)).toMatch(/Nothing is lost/);

    expect(explainSaveFailure(new StorageUnavailableError('nope'))).toMatch(
      /storage could not be opened/,
    );
    expect(explainSaveFailure(new SaveVerificationError('workouts', 'w1', true))).toMatch(
      /rolled back/,
    );
    const quota = Object.assign(new Error('exceeded'), { name: 'QuotaExceededError' });
    expect(explainSaveFailure(quota)).toMatch(/no storage space left/);
  });

  it('keeps an unknown message rather than hiding it', () => {
    expect(explainSaveFailure(new Error('Start the workout before finishing it.'))).toBe(
      'The workout could not be saved: Start the workout before finishing it. Nothing is lost: every set is still on this screen. Try again.',
    );
    expect(explainSaveFailure(undefined)).toMatch(/^The workout could not be saved\. Nothing/);
  });
});
