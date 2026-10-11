import { useCallback, useEffect, useRef } from 'react';

function marked(marker: string): boolean {
  const state: unknown = window.history.state;
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Record<string, unknown>)[marker] === true
  );
}

/**
 * The phone's Back closes a barcode view rather than moving the screen underneath
 * it: the view adds one history entry under its own marker, and Back takes it. Its
 * own close (the X, Done, Escape) spends that entry too, so a later Back is not
 * wasted on it. A view opened over another adds its entry on top, so Back closes
 * them one at a time. Returns the close action.
 */
export function useBackCloses(marker: string, onClose: () => void): () => void {
  const onCloseRef = useRef(onClose);
  const closing = useRef(false);
  const fallback = useRef<number | undefined>(undefined);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // Only one entry, even when the view mounts twice (a replaced barcode, or StrictMode).
    if (!marked(marker)) {
      const current: unknown = window.history.state;
      const base = typeof current === 'object' && current !== null ? current : {};
      window.history.pushState({ ...base, [marker]: true }, '');
    }
    const onPop = () => {
      if (!marked(marker)) onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.clearTimeout(fallback.current);
    };
  }, [marker]);

  return useCallback(() => {
    // A second tap while Back is on its way must not go back a second screen.
    if (closing.current) return;
    closing.current = true;
    if (!marked(marker)) {
      onCloseRef.current();
      return;
    }
    window.history.back();
    // Should the Back never arrive, it closes anyway.
    fallback.current = window.setTimeout(() => onCloseRef.current(), 400);
  }, [marker]);
}
