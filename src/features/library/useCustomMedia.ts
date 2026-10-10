import { useEffect, useState } from 'react';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import type { CustomMedia } from '../../core/validation/customExercise';

function sameRecord(a: CustomMedia | null, b: CustomMedia | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.id === b.id &&
    a.createdAt === b.createdAt &&
    a.sizeBytes === b.sizeBytes &&
    a.mimeType === b.mimeType &&
    a.dataUrl === b.dataUrl
  );
}

/** What was read for an exercise, and at which change of the pictures it was asked for. */
interface Loaded {
  exerciseId: string;
  media: CustomMedia | null;
  revision: number;
}

/** A read of a picture that failed is tried once more this much later (the seventh pass of item 50). */
const READ_AGAIN_MS = 300;

/**
 * The user's own demonstration for an exercise, if one was added; read again whenever one is added,
 * replaced or removed (a replacement keeps the count: the review of Maintenance 26, item 50).
 */
export function useCustomMedia(exerciseId: string): CustomMedia | null {
  const store = useAppStore();
  const mediaCount = useAppSelector((state) => state.customCounts.media);
  const revision = useAppSelector((state) => state.customMediaRevision);
  // Removed this session: what was read before goes without a read of its own, and what is read
  // after shows (the eighth to tenth passes of item 50: another window's pick stayed hidden).
  const goneAt = useAppSelector((state) => state.customMediaGone[exerciseId]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (mediaCount === 0 || exerciseId === '') return undefined;
    let cancelled = false;
    let again: number | undefined;
    const read = (last: boolean) =>
      store.getCustomMedia(exerciseId).then(
        (media) => {
          if (cancelled) return;
          // The same record read again keeps the one in hand: a large picture is held once, and
          // nothing that shows it renders again (the re-check of item 50).
          setLoaded((current) =>
            current && current.exerciseId === exerciseId && sameRecord(current.media, media)
              ? current
              : { exerciseId, media, revision },
          );
        },
        () => {
          // A read that fails is tried once more a moment later, so a picture just removed does
          // not stay for a passing failure; failing again it keeps what is shown, and the next
          // change reads again (the sixth and seventh passes).
          if (!cancelled && !last) again = window.setTimeout(() => void read(true), READ_AGAIN_MS);
        },
      );
    void read(false);
    return () => {
      cancelled = true;
      window.clearTimeout(again);
    };
  }, [store, exerciseId, mediaCount, revision]);

  // None left: the one loaded goes too, so a later pick never shows it again, not even until its
  // own read lands (the third pass of item 50: a removed GIF came back for a moment).
  if (mediaCount === 0 && loaded !== null) setLoaded(null);
  const stale =
    goneAt !== undefined &&
    loaded !== null &&
    loaded.exerciseId === exerciseId &&
    loaded.revision < goneAt;
  // Read before its removal, it is let go for good, and no render shows it: the same picture read
  // back after (a backup restored) then shows as new (the ninth and tenth passes of item 50).
  if (stale && loaded.media !== null) setLoaded({ exerciseId, media: null, revision: goneAt });
  if (stale || mediaCount === 0 || !loaded || loaded.exerciseId !== exerciseId) return null;
  return loaded.media;
}
