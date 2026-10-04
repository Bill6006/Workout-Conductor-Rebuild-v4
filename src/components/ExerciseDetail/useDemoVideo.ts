import { useCallback, useEffect, useState } from 'react';

export interface DemoVideo {
  /** A local address for the whole clip, once it has arrived. */
  src: string | null;
  /** The clip could not be fetched: offline before it was ever kept, or the network failed. */
  failed: boolean;
  /** Asked for again after it could not be fetched, and not yet answered. */
  retrying: boolean;
  /** Asks again for a clip that could not be fetched. */
  retry: () => void;
}

/**
 * A demonstration clip fetched whole (Maintenance 25, item 7). The service worker keeps each clip
 * the first time it is fetched, so it plays offline afterwards; fetched whole, playback never
 * depends on a range request the cache could not answer. Null asks for nothing (reduced motion,
 * or a still in its place). A clip that could not be fetched is asked for again when the phone
 * comes back online, as the still under it says (the tenth review), or when retry() is called.
 */
interface DemoVideoState {
  url: string | null;
  src: string | null;
  failed: boolean;
  retrying: boolean;
}

const EMPTY: DemoVideoState = { url: null, src: null, failed: false, retrying: false };

export function useDemoVideo(url: string | null): DemoVideo {
  const [state, setState] = useState<DemoVideoState>(EMPTY);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!url) return undefined;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url, src: objectUrl, failed: false, retrying: false });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ url, src: null, failed: true, retrying: false });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, attempt]);
  // A clip let go is fetched afresh when it is wanted again, never shown from the address freed
  // with it (the review of the phone review: a card paused and played again did, for a moment).
  // Only a change of clip lets go; a retry of the same clip keeps its state.
  useEffect(
    () => () => {
      setState((current) => (current.url === url ? EMPTY : current));
    },
    [url],
  );
  const retry = useCallback(() => {
    // Loading again, not failed, until the new answer comes.
    setState((current) => ({ ...current, failed: false, retrying: current.failed }));
    setAttempt((count) => count + 1);
  }, []);
  // A state from another clip says nothing about this one.
  const mine = state.url === url && url !== null;
  const failed = mine && state.failed;
  useEffect(() => {
    if (!failed) return undefined;
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [failed, retry]);
  return mine
    ? { src: state.src, failed, retrying: state.retrying, retry }
    : { src: null, failed: false, retrying: false, retry };
}
