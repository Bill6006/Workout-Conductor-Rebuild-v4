import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { ChipSelect } from '../../components/Form/ChipSelect';
import { Field } from '../../components/Form/Field';
import { PlaceholderCard, ScreenHeader } from '../../components/Screen/Screen';
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

  return (
    <>
      <ScreenHeader
        title="Plan"
        intro="Training days and the places you train. Weekly targets and saved workouts arrive in Phase 7."
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

      <PlaceholderCard
        title="Weekly plan"
        arrivesIn="Phase 7"
        items={['Upcoming sessions', 'Weekly muscle targets', 'Saved workouts', 'Recovery balance']}
      />

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
