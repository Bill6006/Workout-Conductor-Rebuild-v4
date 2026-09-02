import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState, useAppStore } from '../../core/state/useAppStore';
import { structurallyEqual } from '../../core/storage/verifiedSave';
import { draftFromState, type ProfileDraft } from './draft';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface LocalDraft {
  key: string;
  draft: ProfileDraft;
}

const DEBOUNCE_MS = 450;

/**
 * Settings autosave: edits are debounced, then written with verified saves
 * (profile and any changed or removed locations). The local draft is keyed
 * by the store's update stamps so a fresh store version wins once it lands.
 */
export function useProfileEditor() {
  const store = useAppStore();
  const state = useAppState();
  const [local, setLocal] = useState<LocalDraft | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<ProfileDraft | null>(null);
  const timerRef = useRef<number | null>(null);

  const key = `${state.profile?.updatedAt ?? 'none'}|${state.locations
    .map((location) => `${location.id}:${location.updatedAt}`)
    .join(',')}`;

  const storeDraft = state.profile ? draftFromState(state.profile, state.locations) : null;
  const draft = local && local.key === key ? local.draft : storeDraft;

  const flush = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = pendingRef.current;
    pendingRef.current = null;
    if (!next) return;

    setStatus('saving');
    try {
      const current = store.getSnapshot();
      for (const location of next.locations) {
        const existing = current.locations.find((candidate) => candidate.id === location.id);
        if (!existing || !structurallyEqual(existing, location)) {
          await store.saveLocation(location);
        }
      }
      for (const existing of current.locations) {
        if (!next.locations.some((location) => location.id === existing.id)) {
          await store.deleteLocation(existing.id);
        }
      }
      if (!current.profile || !structurallyEqual(current.profile, next.profile)) {
        await store.saveProfile(next.profile);
      }
      setStatus('saved');
      setError(null);
    } catch (caught) {
      setStatus('error');
      setError(caught instanceof Error ? caught.message : 'Save failed.');
    }
  }, [store]);

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
    return () => {
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
