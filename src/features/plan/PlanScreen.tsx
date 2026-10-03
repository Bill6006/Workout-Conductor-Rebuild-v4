import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { ScreenHeader } from '../../components/Screen/Screen';
import { getExercise } from '../../catalog/exercises/catalog';
import { muscleName } from '../../catalog/muscles/muscles';
import { useNow } from '../../core/time/clock';
import { durationLabel } from '../../engine/duration/duration';
import { formatWindow, inDeloadWindow, recommendDeload } from '../../engine/planning/deload';
import { swapIsPast } from '../../engine/planning/lastingSwaps';
import { describeFocus, planWeek, recoveryBalance } from '../../engine/planning/weeklyPlan';
import { interpretFatigue } from '../../engine/recovery/fatigue';
import { muscleCoverage } from '../../engine/scoring/analytics';
import { allEntries } from '../../engine/workout/types';
import { useToast } from '../../components/Toast/useToast';
import { useAppState, useAppStore } from '../../core/state/useAppStore';
import { HOME_LOCATION_ID, type LocationProfile } from '../../core/validation/location';
import { routeHref, sectionHref } from '../../app/navigation';
import { useHashSection } from '../../app/useHashRoute';
import { LOCATION_KIND_OPTIONS, labelFor } from '../profile/labels';
import { daysText } from '../settings/summaries';
import { LocationEditorSheet } from './LocationEditorSheet';
import styles from './PlanScreen.module.css';

type SheetState = { open: false } | { open: true; location: LocationProfile | null };

const BAND_TEXT = { under: 'under', in: 'in band', over: 'over' } as const;
const RECOVERY_TEXT = { recovering: 'Recovering', ready: 'Ready', fresh: 'Fresh' } as const;

export function PlanScreen() {
  const state = useAppState();
  const store = useAppStore();
  const toast = useToast();
  const [sheet, setSheet] = useState<SheetState>({ open: false });
  const [sheetKey, setSheetKey] = useState(0);

  function openSheet(location: LocationProfile | null) {
    setSheetKey((key) => key + 1);
    setSheet({ open: true, location });
  }

  const profile = state.profile;
  const nowEpoch = useNow();
  const nowIso = nowEpoch
    ? new Date(nowEpoch).toISOString()
    : (profile?.updatedAt ?? '2026-01-01T00:00:00.000Z');
  const location = state.locations.find((item) => item.id === profile?.currentLocationId);
  const week = useMemo(
    () => (profile ? planWeek(profile, location, state.history, nowIso) : []),
    [profile, location, state.history, nowIso],
  );
  const coverage = useMemo(
    () =>
      profile
        ? muscleCoverage(state.history, profile, nowIso)
            .filter((row) => row.priority)
            .slice(0, 6)
        : [],
    [profile, state.history, nowIso],
  );
  const recovery = useMemo(() => recoveryBalance(state.history, nowIso), [state.history, nowIso]);
  const deloadAdvice = useMemo(() => {
    if (!profile) return null;
    const fatigue = interpretFatigue(
      state.history,
      nowIso,
      state.session?.constraints.readiness ?? null,
    );
    return recommendDeload(state.history, fatigue, profile, nowIso);
  }, [profile, state.history, state.session, nowIso]);
  const [savedName, setSavedName] = useState('');
  // "#/plan/places" brings the places card into view: Settings links to it.
  const section = useHashSection();
  const placesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (section === 'places') placesRef.current?.scrollIntoView?.({ block: 'start' });
  }, [section]);
  const defaultSavedName = state.session
    ? `${state.session.workout.title} · ${nowIso.slice(0, 10)}`
    : '';

  return (
    <>
      <ScreenHeader title="Plan" intro="Your week, what adjusts it, and where you train." />

      <Card eyebrow="This week" title="Upcoming sessions">
        {profile ? (
          // The days are set with the rest of the schedule, in Settings (Maintenance 25).
          <p className={styles.days} data-testid="plan-days">
            <span>{daysText(profile)}</span>
            <a
              className={styles.inlineLink}
              href={sectionHref('settings', 'schedule')}
              data-testid="plan-days-link"
            >
              Change days ›
            </a>
          </p>
        ) : null}
        {week.length === 0 ? (
          <p className={styles.status} data-testid="week-empty">
            {profile && profile.schedule.availableDays.length > 0
              ? // The only day set is today, and today's session is done.
                'Today’s session is done. The next one is a week from today.'
              : 'No available days set.'}
          </p>
        ) : (
          <ol className={styles.planList} aria-label="This week's plan" data-testid="week-plan">
            {week.map((session) => (
              <li
                key={session.date}
                className={styles.planRow}
                data-today={session.today || undefined}
              >
                <span className={styles.planDay}>{session.label}</span>
                <span className={styles.planTitle}>{session.title}</span>
                <span className={styles.planFocus}>{describeFocus(session.focus)}</span>
              </li>
            ))}
          </ol>
        )}
        {/* The week's priority muscles in a line; every muscle's bars are on Progress, their one
            home (Maintenance 25), and the link is there with or without priorities. */}
        <div className={styles.priority} data-testid="weekly-targets">
          {coverage.length > 0 ? (
            <>
              <span className={styles.priorityLabel}>Priority this week</span>
              <ul className={styles.priorityList}>
                {coverage.map((row) => (
                  <li key={row.muscle} className={styles.priorityRow}>
                    <span className={styles.priorityName}>{row.name}</span>
                    <span className={styles.priorityValue}>
                      {Math.round((row.direct + row.indirect) * 10) / 10} of {row.target} sets ·{' '}
                      {BAND_TEXT[row.band]}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <a
            className={styles.inlineLink}
            href={routeHref('progress')}
            data-testid="plan-progress-link"
          >
            Every muscle on Progress ›
          </a>
        </div>
        <p className={styles.status}>
          Each day is what the plan would build from your history that morning, so it rotates as
          sessions are logged.
        </p>
      </Card>

      <Card eyebrow="Recovery balance" title="What is ready to train">
        {/* Each state on its own labelled row (Maintenance 25): easier to read than one paragraph. */}
        <ul className={styles.recoveryList} data-testid="recovery-balance">
          {(['recovering', 'ready', 'fresh'] as const).map((key) => {
            const rows = recovery.filter((row) => row.state === key);
            return (
              <li key={key} className={styles.recoveryRow}>
                <span className={styles.recoveryState} data-state={key}>
                  {RECOVERY_TEXT[key]}
                </span>
                <span className={styles.recoveryMuscles}>
                  {rows.length === 0
                    ? 'none'
                    : rows
                        .slice(0, 8)
                        .map((row) =>
                          row.daysSince === null
                            ? row.name
                            : // A non-breaking space: "(1 d)" never breaks at a narrow width.
                              `${row.name} (${row.daysSince}\u00a0d)`,
                        )
                        .join(', ')}
                  {rows.length > 8 ? ` and ${rows.length - 8} more` : ''}
                </span>
              </li>
            );
          })}
        </ul>
        {state.coachFocus ? (
          <div className={styles.status} data-testid="coach-focus">
            <strong>
              Next session leads with {muscleName(state.coachFocus.muscle).toLowerCase()}
            </strong>
            : your coach focus until{' '}
            {new Date(state.coachFocus.until).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
            , or until a session trains it.{' '}
            <button
              type="button"
              className={styles.smallButton}
              onClick={() => void store.clearCoachFocus()}
              data-testid="coach-focus-clear"
            >
              Clear
            </button>
          </div>
        ) : null}
        {state.lastingSwaps.map((swap) => {
          const from = getExercise(swap.from);
          const to = getExercise(swap.to);
          if (!from || !to || swapIsPast(swap, nowIso)) return null;
          return (
            <div key={swap.from} className={styles.status} data-testid="lasting-swap">
              <strong>
                {to.name} in place of {from.name}
              </strong>
              : your swap until{' '}
              {new Date(swap.until).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
              , wherever it fits.{' '}
              <button
                type="button"
                className={styles.smallButton}
                onClick={() => {
                  store.stopLastingSwap(swap.from).catch(() => {
                    toast.show('The swap could not be stopped. Try again.', 'error');
                  });
                }}
                data-testid="lasting-swap-stop"
                aria-label={`Stop using ${to.name} in place of ${from.name}`}
              >
                Stop
              </button>
            </div>
          );
        })}
        {state.deloadWeek ? (
          <div className={styles.status} data-testid="deload-planned">
            <strong>Deload week planned</strong>: {formatWindow(state.deloadWeek)}
            {inDeloadWindow(state.deloadWeek, nowIso)
              ? ', running now: one set fewer per exercise, one more rep in reserve, loads 10% lighter'
              : ''}
            .{' '}
            <button
              type="button"
              className={styles.smallButton}
              onClick={() => void store.cancelDeloadWeek()}
              data-testid="deload-cancel"
            >
              Cancel
            </button>
          </div>
        ) : deloadAdvice?.recommended && deloadAdvice.window ? (
          <div className={styles.status} data-testid="deload-suggested">
            <strong>A deload week is suggested</strong> from {formatWindow(deloadAdvice.window)}:{' '}
            {deloadAdvice.reasons.join(' ')}{' '}
            <button
              type="button"
              className={styles.smallButton}
              onClick={() => void store.planDeloadWeek(deloadAdvice)}
              data-testid="deload-plan"
            >
              Plan it
            </button>
          </div>
        ) : (
          <p className={styles.status} data-testid="deload-none">
            No deload week needed. {deloadAdvice?.reasons[deloadAdvice.reasons.length - 1] ?? ''}
          </p>
        )}
      </Card>

      <Card eyebrow="Saved workouts" title="Reuse a session you liked">
        {state.session ? (
          <div className={styles.saveRow}>
            <input
              className={styles.nameInput}
              value={savedName}
              placeholder={defaultSavedName}
              onChange={(event) => setSavedName(event.target.value)}
              data-testid="saved-workout-name"
              aria-label="Saved workout name"
              maxLength={60}
            />
            <button
              type="button"
              className={styles.smallButton}
              data-testid="save-workout-button"
              onClick={() => {
                const name = savedName.trim() || defaultSavedName;
                void store
                  .saveCurrentWorkout(name)
                  .then(() => {
                    setSavedName('');
                    toast.show(`Saved "${name}"`, 'success');
                  })
                  .catch((error: unknown) =>
                    toast.show(error instanceof Error ? error.message : 'Could not save', 'error'),
                  );
              }}
            >
              Save today's workout
            </button>
          </div>
        ) : null}
        {state.savedWorkouts.length === 0 ? (
          <p className={styles.status}>
            Nothing saved yet. Save today's workout to run it again another day; loading it starts a
            fresh session that still recalibrates.
          </p>
        ) : (
          <ul className={styles.locations}>
            {state.savedWorkouts.map((saved) => (
              <li key={saved.id} className={styles.location} data-testid="saved-workout-row">
                <div className={styles.locationText}>
                  <span className={styles.locationName}>{saved.name}</span>
                  <span className={styles.locationMeta}>
                    {saved.workout.title} · {allEntries(saved.workout.blocks).length} exercises ·{' '}
                    {durationLabel(saved.duration, saved.workout.duration.defaultMinutes)} · saved{' '}
                    {saved.createdAt.slice(0, 10)}
                  </span>
                </div>
                <div className={styles.locationActions}>
                  {state.session?.status === 'preview' ? (
                    <button
                      type="button"
                      className={styles.smallButton}
                      data-testid="use-saved-workout"
                      onClick={() => {
                        store.loadSavedWorkout(saved.id);
                        toast.show(`Loaded "${saved.name}"`, 'success');
                      }}
                    >
                      Use
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.smallButton}
                    onClick={() => void store.deleteSavedWorkout(saved.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Settings, Where you train, lands here with the card in view (Maintenance 25). */}
      <div ref={placesRef} className={styles.anchor} data-testid="plan-places">
        <Card eyebrow="Locations and equipment" title="Where you train">
          <ul className={styles.locations} aria-label="Saved locations">
            {state.locations.map((location) => {
              const current = location.id === profile?.currentLocationId;
              return (
                <li key={location.id} className={styles.location}>
                  <div className={styles.locationText}>
                    <span className={styles.locationName}>
                      {location.name}
                      {current ? <span className={styles.currentBadge}>Current</span> : null}
                    </span>
                    <span className={styles.locationMeta}>
                      {labelFor(LOCATION_KIND_OPTIONS, location.kind)} · {location.equipment.length}{' '}
                      equipment
                    </span>
                  </div>
                  <div className={styles.locationActions}>
                    {!current && profile ? (
                      <button
                        type="button"
                        className={styles.smallButton}
                        onClick={() =>
                          void store
                            .setCurrentLocation(location.id)
                            .then(() => toast.show(`Training at ${location.name}`, 'success'))
                            .catch((error: unknown) =>
                              toast.show(
                                error instanceof Error ? error.message : 'Could not switch',
                                'error',
                              ),
                            )
                        }
                      >
                        Use
                      </button>
                    ) : null}
                    {location.id !== HOME_LOCATION_ID ? (
                      <button
                        type="button"
                        className={styles.smallButton}
                        onClick={() => store.openBarcodeSheet(location.id)}
                      >
                        Barcode
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={styles.smallButton}
                      onClick={() => openSheet(location)}
                    >
                      Edit
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <Button variant="secondary" onClick={() => openSheet(null)}>
            Add a place
          </Button>
        </Card>
      </div>

      {sheet.open ? (
        <LocationEditorSheet
          key={sheetKey}
          open
          location={sheet.location}
          onClose={() => setSheet({ open: false })}
          onSave={async (location) => {
            await store.saveLocation(location);
            toast.show(`${location.name} saved and verified`, 'success');
          }}
          onDelete={async (id) => {
            await store.deleteLocation(id);
            toast.show('Place removed', 'info');
          }}
        />
      ) : null}
    </>
  );
}
