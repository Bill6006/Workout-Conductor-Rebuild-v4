import { useState } from 'react';
import { useToast } from '../../components/Toast/useToast';
import { useAppStore } from '../../core/state/useAppStore';
import type { CustomMedia } from '../../core/validation/customExercise';
import { customMediaFromFile } from './mediaFile';
import { useCustomMedia } from './useCustomMedia';

export interface OwnDemonstration {
  /** The lifter's own GIF, photo or video for the exercise, if they picked one. */
  media: CustomMedia | null;
  /** A pick or a removal is being saved. */
  busy: boolean;
  pick: (file: File) => void;
  /** Resolves true once removed, false when it could not be. */
  remove: () => Promise<boolean>;
}

/**
 * The lifter's own demonstration of an exercise, and picking or removing it: one way for the
 * details and for How to (Maintenance 26, item 50: How to had no way to set one).
 */
export function useOwnDemonstration(exerciseId: string): OwnDemonstration {
  const media = useCustomMedia(exerciseId);
  const store = useAppStore();
  const toast = useToast();
  // The exercises whose pick or removal is being saved, each as many times as it is: a sheet
  // opened on another meanwhile is not held by it, and a second save does not free the first
  // (the third and fourth passes of item 50).
  const [saving, setSaving] = useState<readonly string[]>([]);
  const begun = (id: string) => setSaving((current) => [...current, id]);
  const settled = (id: string) =>
    setSaving((current) => {
      const at = current.indexOf(id);
      return at < 0 ? current : [...current.slice(0, at), ...current.slice(at + 1)];
    });

  const pick = async (file: File) => {
    const id = exerciseId;
    begun(id);
    try {
      const media = await customMediaFromFile(file);
      try {
        await store.addCustomMedia(id, media);
      } catch {
        // In plain words: the storage's own message is no help here (the eighth pass of item 50).
        toast.show('Could not save your demonstration. Try again.', 'error');
        return;
      }
      toast.show('Saved your demonstration · stays on this device', 'success');
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not save that file', 'error');
    } finally {
      settled(id);
    }
  };
  const remove = async (): Promise<boolean> => {
    const id = exerciseId;
    begun(id);
    try {
      await store.deleteCustomMedia(id);
      toast.show('Removed your demonstration', 'success');
      return true;
    } catch {
      // The store reads once more after a removal whose check failed and counts one gone as
      // removed (the seventh and eighth passes of item 50); one that stands is said plainly.
      toast.show('Could not remove your demonstration. Try again.', 'error');
      return false;
    } finally {
      settled(id);
    }
  };

  return {
    media,
    busy: saving.includes(exerciseId),
    pick: (file) => void pick(file),
    remove,
  };
}
