/**
 * A failed save says what happened in plain words, and always says that
 * nothing was lost: the session stays on the screen until a save succeeds.
 * The raw message is kept only when nothing better is known about it.
 */
export function explainSaveFailure(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  const keep = 'Nothing is lost: every set is still on this screen. Try again.';
  if (name === 'StorageUnavailableError') {
    return `The app's storage could not be opened on this device. ${keep}`;
  }
  if (name === 'SaveVerificationError') {
    return `The workout was written but did not read back correctly, so it was rolled back. ${keep}`;
  }
  if (name === 'QuotaExceededError' || /quota/i.test(message)) {
    return `This phone has no storage space left for the app. Free some space, then try again. Nothing is lost: every set is still on this screen.`;
  }
  if (name === 'InvalidStateError' || /clos(ing|ed)/i.test(message)) {
    return `The browser closed the app's database while it was saving; it has been reopened. ${keep}`;
  }
  const detail = message.trim();
  return detail
    ? `The workout could not be saved: ${detail} ${keep}`
    : `The workout could not be saved. ${keep}`;
}
