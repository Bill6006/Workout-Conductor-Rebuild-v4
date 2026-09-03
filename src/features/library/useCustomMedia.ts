import { useEffect, useState } from 'react';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import type { CustomMedia } from '../../core/validation/customExercise';

/** The user's own demonstration for an exercise, if one was added. */
export function useCustomMedia(exerciseId: string): CustomMedia | null {
  const store = useAppStore();
  const mediaCount = useAppSelector((state) => state.customCounts.media);
  const [loaded, setLoaded] = useState<{ exerciseId: string; media: CustomMedia | null } | null>(
    null,
  );

  useEffect(() => {
    if (mediaCount === 0 || exerciseId === '') return undefined;
    let cancelled = false;
    void store.getCustomMedia(exerciseId).then((media) => {
      if (!cancelled) setLoaded({ exerciseId, media });
    });
    return () => {
      cancelled = true;
    };
  }, [store, exerciseId, mediaCount]);

  if (mediaCount === 0 || !loaded || loaded.exerciseId !== exerciseId) return null;
  return loaded.media;
}
