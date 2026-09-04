import { useMemo, useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { ChipSelect } from '../../components/Form/ChipSelect';
import { Field } from '../../components/Form/Field';
import { BandBar } from '../../components/Charts/Bars';
import { ScreenHeader } from '../../components/Screen/Screen';
import { useNow } from '../../core/time/clock';
import { durationLabel } from '../../engine/duration/duration';
import { describeFocus, planWeek, recoveryBalance } from '../../engine/planning/weeklyPlan';
import { muscleCoverage } from '../../engine/scoring/analytics';
import { allEntries } from '../../engine/workout/types';
import { useToast } from '../../components/Toast/useToast';
import { useAppState, useAppStore } from '../../core/state/useAppStore';
import type { LocationProfile } from '../../core/validation/location';
import type { Weekday } from '../../core/validation/profile';
import { updateProfile } from '../profile/draft';
import { LOCATION_KIND_OPTIONS, WEEKDAY_OPTIONS, labelFor } from '../profile/labels';
import { useProfileEditor } from '../profile/useProfileEditor';
import { LocationEditorSheet } from './LocationEditorSheet';
import styles from './PlanScreen.module.css';

type SheetState = { open: false } | { open: true; location: LocationProfile | null };

const BAND_TEXT = { under: '▲ under', in: '● in band', over: '▼ over' } as const;
const RECOVERY_TEXT = { recovering: 'Recovering', ready: 'Ready', fresh: 'Fresh' } as const;

export function PlanScreen() {
  const state = useAppState();
  const store = useAppStore();
  const toast = useToast();
  const editor = useProfileEditor();
  const [sheet, setSheet] = useState<SheetState>({ open: false });
  const [sheetKey, setSheetKey] = useState(0);

  function openSheet(location: LocationProfile | null) {
    setSheetKey((key) => key + 1);
    setSheet({ open: true, location });
  }

  const profile = state.profile;
  const draft = editor.draft;
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
  const [savedName, setSavedName] = useState('');
  const defaultSavedName = state.session
    ? `${state.session.workout.title} · ${nowIso.slice(0, 10)}`
    : '';

  return (
    <>
      <ScreenHeader
        title="Plan"
        intro="Your week, weekly targets, recovery balance, saved workouts, and the places you train."
      />

      {draft && profile ? (
        <Card
          eyebrow="Training days"
          title={`${profile.schedule.weeklyFrequency} sessions per week`}
        >
          <Field label="Available days" hint="Saved automatically.">
            <ChipSelect<Weekday>
              label="Available days"
              values={draft.profile.schedule.availableDays}
              options={WEEKDAY_OPTIONS}
              onChange={(availableDays) =>
                editor.update(
                  updateProfile(draft, (current) => ({
                    ...current,
                    schedule: {
                      ...current.schedule,
                      availableDays: WEEKDAY_OPTIONS.map((option) => option.value).filter((day) =>
                        availableDays.includes(day),
                      ),
                    },
                  })),
                )
              }
            />
          </Field>
          <p className={styles.status} data-testid="plan-save-status">
            {editor.status === 'saving'
              ? 'Saving…'
              : editor.status === 'error'
                ? `Save failed: ${editor.error}`
                : editor.status === 'saved'
                  ? 'Saved and verified'
                  : 'Changes save automatically'}
          </p>
        </Card>
      ) : null}

      <Card eyebrow="This week" title="Upcoming sessions">
        {week.length === 0 ? (
          <p className={styles.status}>No available days set.</p>
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
        <p className={styles.status}>
          Rotates as sessions are logged: each day is what the generator would build from your
          history that morning.
        </p>
      </Card>

      <Card eyebrow="Weekly muscle targets" title="Priority muscles this week">
        <ul className={styles.targetList} data-testid="weekly-targets">
          {coverage.map((row) => (
            <li key={row.muscle} className={styles.targetRow}>
              <span className={styles.targetName}>
                {row.name} <span className={styles.bandLabel}>{BAND_TEXT[row.band]}</span>
              </span>
              <BandBar direct={row.direct} indirect={row.indirect} target={row.target} />
            </li>
          ))}
        </ul>
        <p className={styles.status}>
          Solid is direct work, striped is indirect at half weight, and the outlined band is 70 to
          130 percent of the weekly target. Every muscle is on <a href="#/progress">Progress</a>.
        </p>
      </Card>

      <Card eyebrow="Recovery balance" title="What is ready to train">
        <div data-testid="recovery-balance">
          {(['recovering', 'ready', 'fresh'] as const).map((key) => {
            const rows = recovery.filter((row) => row.state === key);
            return (
              <p key={key} className={styles.status}>
                <strong>{RECOVERY_TEXT[key]}</strong>:{' '}
                {rows.length === 0
                  ? 'none'
                  : rows
                      .slice(0, 8)
                      .map((row) =>
                        row.daysSince === null ? row.name : `${row.name} (${row.daysSince} d)`,
                      )
                      .join(', ')}
                {rows.length > 8 ? ` and ${rows.length - 8} more` : ''}
              </p>
            );
          })}
        </div>
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
