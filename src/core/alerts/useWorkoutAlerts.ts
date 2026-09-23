import { useEffect } from 'react';
import { useAppSelector } from '../state/useAppStore';
import type { WorkoutSession } from '../state/session';
import { allEntries } from '../../engine/workout/types';
import { SCHEDULE_AHEAD_SECONDS, UNFINISHED_NUDGE_MINUTES } from './cues';
import { REST_TAG, UNFINISHED_TAG, closeAlerts, notifyPermission, showAlert } from './notify';
import { holdSounds, restSounds } from './restSounds';

/** The last moment anything was logged or started in the session. */
export function lastActivityAt(session: WorkoutSession): string | null {
  const stamps = [
    session.completed.startedAt,
    session.activeSince,
    ...session.completed.sets.map((set) => set.completedAt),
  ].filter((stamp): stamp is string => typeof stamp === 'string');
  return stamps.length > 0
    ? stamps.reduce((latest, stamp) => (stamp > latest ? stamp : latest))
    : null;
}

/** "3 of 7 exercises logged", for the nudge. */
export function progressLine(session: WorkoutSession): string {
  const entries = allEntries(session.workout.blocks);
  const touched = new Set(
    session.completed.sets.filter((set) => !set.skipped).map((set) => set.entryId),
  );
  const logged = entries.filter((entry) => touched.has(entry.id)).length;
  return `${logged} of ${entries.length} exercises logged`;
}

/**
 * The workout's alerts, mounted once for the whole app so they work from any
 * tab: the rest timer's and a hold's sounds, a notification when a rest ends while the app
 * is in the background, and a nudge when a workout has been left open.
 * Everything is a plain timer against absolute times, so a change to the rest
 * or a new logged set simply replaces it. Nothing here asks for permission.
 */
export function useWorkoutAlerts(): void {
  const session = useAppSelector((state) => state.session);
  const sounds = useAppSelector((state) => state.localSettings.restSounds);
  const notifications = useAppSelector((state) => state.localSettings.notifications);

  const rest = session?.rest ?? null;
  const running = session?.status === 'active' && rest !== null && rest.pausedRemaining === null;
  const endsAt = running && rest ? rest.endsAt : null;
  const nextLabel = rest?.nextLabel ?? '';

  // Sounds: laid onto the audio clock a few seconds before the end, cancelled on any change.
  useEffect(() => {
    if (!endsAt || !sounds) return undefined;
    const lay = () => {
      const remaining = (Date.parse(endsAt) - Date.now()) / 1000;
      if (remaining > 0) restSounds.schedule(endsAt, remaining);
    };
    const wait = Date.parse(endsAt) - Date.now() - SCHEDULE_AHEAD_SECONDS * 1000;
    const timer = window.setTimeout(lay, Math.max(0, wait));
    return () => {
      window.clearTimeout(timer);
      restSounds.cancel();
    };
  }, [endsAt, sounds]);

  // A hold counting down: the same ticks and end tone, on a player of its own.
  const hold = session?.hold ?? null;
  const holdEndsAt =
    session?.status === 'active' && hold && hold.pausedRemaining === null && hold.held === null
      ? hold.endsAt
      : null;
  useEffect(() => {
    if (!holdEndsAt || !sounds) return undefined;
    const lay = () => {
      const remaining = (Date.parse(holdEndsAt) - Date.now()) / 1000;
      if (remaining > 0) holdSounds.schedule(holdEndsAt, remaining);
    };
    const wait = Date.parse(holdEndsAt) - Date.now() - SCHEDULE_AHEAD_SECONDS * 1000;
    const timer = window.setTimeout(lay, Math.max(0, wait));
    return () => {
      window.clearTimeout(timer);
      holdSounds.cancel();
    };
  }, [holdEndsAt, sounds]);

  // The rest ended while the app was in the background: say so, once.
  useEffect(() => {
    if (!endsAt || !notifications || notifyPermission() !== 'granted') return undefined;
    const wait = Date.parse(endsAt) - Date.now();
    if (wait <= 0) return undefined;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'hidden') {
        void showAlert('Rest is over', { body: nextLabel, tag: REST_TAG });
      }
    }, wait);
    return () => window.clearTimeout(timer);
  }, [endsAt, notifications, nextLabel]);

  // A workout left open: one nudge after half an hour without a logged set.
  const active = session?.status === 'active';
  const lastActivity = session && active ? lastActivityAt(session) : null;
  const progress = session && active ? progressLine(session) : '';
  useEffect(() => {
    if (!lastActivity || !notifications || notifyPermission() !== 'granted') return undefined;
    const wait = Date.parse(lastActivity) + UNFINISHED_NUDGE_MINUTES * 60_000 - Date.now();
    if (wait <= 0) return undefined;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'hidden') {
        void showAlert('Workout still open', {
          body: `${progress}. Finish it, or end it early to save the day.`,
          tag: UNFINISHED_TAG,
        });
      }
    }, wait);
    return () => window.clearTimeout(timer);
  }, [lastActivity, notifications, progress]);

  // Looking at the app makes its notifications pointless.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void closeAlerts(REST_TAG);
      void closeAlerts(UNFINISHED_TAG);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
}
