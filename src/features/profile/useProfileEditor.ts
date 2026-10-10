import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ToastContext } from '../../components/Toast/toastContext';
import type { AppState } from '../../core/state/appStore';
import { useAppState, useAppStore } from '../../core/state/useAppStore';
import { structurallyEqual } from '../../core/storage/verifiedSave';
import { draftFromState, type ProfileDraft } from './draft';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface LocalDraft {
  key: string;
  draft: ProfileDraft;
}

export const DEBOUNCE_MS = 450;

/** The store's update stamps: a local draft holds while they are the ones it was made over. */
function stampsOf(state: Pick<AppState, 'profile' | 'locations'>): string {
  return `${state.profile?.updatedAt ?? 'none'}|${state.locations
    .map((location) => `${location.id}:${location.updatedAt}`)
    .join(',')}`;
}

/**
 * Settings autosave: edits are debounced, then written with verified saves
 * (profile and any changed or removed locations). The local draft is keyed
 * by the store's update stamps so a fresh store version wins once it lands.
 */
export function useProfileEditor() {
  const store = useAppStore();
  const state = useAppState();
  const toast = useContext(ToastContext);
  const [local, setLocal] = useState<LocalDraft | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  // Saves under way: meanwhile the screen shows the edit being saved, never the store half-way
  // through it, so an edit made then builds on it (the tenth review's seventh re-check).
  const [saving, setSaving] = useState(0);
  const pendingRef = useRef<ProfileDraft | null>(null);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const toastRef = useRef(toast);
  // One save at a time: a save started while another runs would read the profile before that one
  // landed, and its check would put that profile back (the tenth review's eighth re-check).
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const key = stampsOf(state);

  const storeDraft = state.profile ? draftFromState(state.profile, state.locations) : null;
  const draft = local && (local.key === key || saving > 0) ? local.draft : storeDraft;

  const saveNext = useCallback(async () => {
    const next = pendingRef.current;
    pendingRef.current = null;
    if (!next) return;

    setStatus('saving');
    setSaving((count) => count + 1);
    let deleting = false;
    try {
      const current = store.getSnapshot();
      // Deletions first: one refused (the cloud copy still coming back) or failed leaves the rest
      // of the edit unsaved, so nothing that hangs on it (the current place moved off the place)
      // is half done (the tenth review's sixth and seventh re-checks).
      deleting = true;
      for (const existing of current.locations) {
        if (!next.locations.some((location) => location.id === existing.id)) {
          await store.deleteLocation(existing.id);
        }
      }
      deleting = false;
      for (const location of next.locations) {
        const existing = current.locations.find((candidate) => candidate.id === location.id);
        if (!existing || !structurallyEqual(existing, location)) {
          await store.saveLocation(location);
        }
      }
      if (!current.profile || !structurallyEqual(current.profile, next.profile)) {
        await store.saveProfile(next.profile);
      }
      setStatus('saved');
      setError(null);
      // Saved: the screen shows the store, or an edit made meanwhile, over the new stamps.
      const stamps = stampsOf(store.getSnapshot());
      setLocal((held) =>
        !held || held.draft === next ? null : { key: stamps, draft: held.draft },
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Save failed.';
      const stamps = stampsOf(store.getSnapshot());
      // A deletion refused or failed: the screen shows what is stored again, so the next edit
      // does not try it again; an edit made meanwhile stays. Any other failure keeps the edit on
      // screen, for the next edit to save it again.
      setLocal((held) =>
        !held || (deleting && held.draft === next) ? null : { key: stamps, draft: held.draft },
      );
      setStatus('error');
      setError(message);
      // Settings has gone (left while the edit waited): a toast says what was not saved.
      if (!mountedRef.current) {
        toastRef.current?.show(`Your Settings change was not saved. ${message}`, 'error');
      }
    } finally {
      setSaving((count) => count - 1);
    }
  }, [store]);

  const flush = useCallback((): Promise<void> => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const run = queueRef.current.then(saveNext);
    queueRef.current = run.catch(() => undefined);
    return run;
  }, [saveNext]);

  const update = useCallback(
    (next: ProfileDraft) => {
      setLocal({ key, draft: next });
      pendingRef.current = next;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, DEBOUNCE_MS);
    },
    [flush, key],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (pendingRef.current) {
        void flush();
      }
    };
  }, [flush]);

  return { draft, update, flush, status, error };
}
