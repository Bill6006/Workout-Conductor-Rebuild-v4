import { EXERCISES } from '../../catalog/exercises/catalog';
import { buildInfo } from '../../app/buildInfo';
import { routeHref, sectionHref } from '../../app/navigation';
import { useHashSection } from '../../app/useHashRoute';
import { CURRENT_PHASE, CURRENT_PHASE_GATE, getPhase } from '../../app/phases';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { Toggle } from '../../components/Form/Toggle';
import { DisclosureRow, Group, LinkRow, PlainRow } from '../../components/Group/Group';
import { ScreenHeader } from '../../components/Screen/Screen';
import { useAppState } from '../../core/state/useAppStore';
import { formatDateTime, nowIso } from '../../core/time/clock';
import { hasGymAccess, setGymAccess } from '../profile/draft';
import { ExercisePreferencesEditor } from '../profile/editors/ExercisePreferencesEditor';
import { GoalsEditor } from '../profile/editors/GoalsEditor';
import { LimitationsEditor } from '../profile/editors/LimitationsEditor';
import { ScheduleEditor } from '../profile/editors/ScheduleEditor';
import { StyleEditor } from '../profile/editors/StyleEditor';
import { UnitsEditor } from '../profile/editors/UnitsEditor';
import { useProfileEditor } from '../profile/useProfileEditor';
import { AlertsCard } from './AlertsCard';
import { BackupCard } from './BackupCard';
import { CloudCopyCard } from './CloudCopyCard';
import { DiagnosticsCard } from './DiagnosticsCard';
import { LegacyImportCard } from './LegacyImportCard';
import { MediaCreditsCard } from './MediaCreditsCard';
import { SnapshotsCard } from './SnapshotsCard';
import { StorageCard } from './StorageCard';
import {
  cloudSummary,
  goalsSummary,
  limitationsSummary,
  preferencesSummary,
  programmingSummary,
  scheduleSummary,
  unitsSummary,
} from './summaries';
import styles from './Settings.module.css';

/**
 * Settings (Maintenance 25, the owner's item 5): grouped rows that show their current value and
 * open in place, in place of fourteen full cards. Places live on Plan; the build and the phase
 * live under About.
 */
export function SettingsScreen() {
  const state = useAppState();
  const editor = useProfileEditor();
  const draft = editor.draft;
  // "#/settings/schedule" opens that row: Plan links to it. A new one opens as it is followed.
  const section = useHashSection();
  const phase = getPhase(CURRENT_PHASE);
  const cloud = cloudSummary(state.cloud);

  const statusText =
    editor.status === 'saving'
      ? 'Saving…'
      : editor.status === 'error'
        ? `Save failed: ${editor.error ?? 'unknown error'}`
        : editor.status === 'saved'
          ? 'Saved and verified on this device'
          : 'Changes save automatically and are verified by read-back';

  const current = state.profile?.currentLocationId;
  const places = state.locations
    .map((place) => (place.id === current ? `${place.name} (current)` : place.name))
    .join(', ');

  return (
    <>
      <ScreenHeader title="Settings" intro="Your training, your data, and this app." />

      <>
        {draft ? (
          <>
            <p className={styles.saveStatus} data-testid="settings-save-status" aria-live="polite">
              {statusText}
            </p>

            <Group title="Your training" testId="settings-training">
              <DisclosureRow
                name="goals"
                title="Goals"
                summary={goalsSummary(draft.profile)}
                linked={section === 'goals'}
              >
                <GoalsEditor draft={draft} onChange={editor.update} />
              </DisclosureRow>
              <DisclosureRow
                name="programming"
                title="Programming"
                summary={programmingSummary(draft.profile)}
                linked={section === 'programming'}
              >
                <StyleEditor draft={draft} onChange={editor.update} />
              </DisclosureRow>
              <DisclosureRow
                name="schedule"
                title="Schedule"
                summary={scheduleSummary(draft.profile)}
                linked={section === 'schedule'}
              >
                <ScheduleEditor draft={draft} onChange={editor.update} />
              </DisclosureRow>
              <DisclosureRow
                name="preferences"
                title="Exercise preferences"
                summary={preferencesSummary(draft.profile)}
                linked={section === 'preferences'}
              >
                <ExercisePreferencesEditor draft={draft} onChange={editor.update} />
              </DisclosureRow>
              {/* The library and custom exercises, a tap away (Maintenance 25). */}
              <LinkRow
                title="Exercise library"
                summary={`${EXERCISES.length} exercises and how to do each; add your own`}
                href={routeHref('library')}
                testId="library-link"
              />
              <DisclosureRow
                name="limitations"
                title="Limitations"
                summary={limitationsSummary(draft.profile)}
                linked={section === 'limitations'}
              >
                <LimitationsEditor draft={draft} onChange={editor.update} />
              </DisclosureRow>
              <DisclosureRow
                name="units"
                title="Units and body"
                summary={unitsSummary(draft.profile)}
                linked={section === 'units'}
              >
                <UnitsEditor draft={draft} onChange={editor.update} />
              </DisclosureRow>
            </Group>

            <Group title="Places" testId="settings-places">
              <PlainRow testId="gym-access">
                <Toggle
                  label="I have gym access"
                  description={
                    hasGymAccess(draft)
                      ? 'A Gym with a full commercial setup is saved. Change it under Where you train.'
                      : 'Workouts are built from the equipment at your other places.'
                  }
                  checked={hasGymAccess(draft)}
                  onChange={(enabled) => editor.update(setGymAccess(draft, enabled, nowIso()))}
                />
              </PlainRow>
              <LinkRow
                title="Where you train"
                summary={places ? `${places} · on Plan` : 'On Plan'}
                href={sectionHref('plan', 'places')}
                testId="places-link"
              />
            </Group>
          </>
        ) : (
          <Card eyebrow="Setup" title="No profile yet">
            <p className={styles.body}>{state.error ?? 'Finish setup to unlock settings.'}</p>
            <Button
              variant="primary"
              onClick={() => (window.location.hash = routeHref('onboarding'))}
            >
              Start setup
            </Button>
          </Card>
        )}

        <Group title="Alerts" testId="settings-alerts">
          <PlainRow>
            <AlertsCard />
          </PlainRow>
        </Group>

        <Group title="Your data" testId="settings-data">
          <DisclosureRow
            name="cloud"
            title="Cloud copy"
            summary={
              <span
                data-attention={cloud.attention ? 'true' : undefined}
                className={styles.rowStatus}
              >
                {cloud.text}
              </span>
            }
            initiallyOpen={cloud.attention}
            linked={section === 'cloud'}
          >
            <CloudCopyCard />
          </DisclosureRow>
          <DisclosureRow
            name="backup"
            title="Export and import"
            summary={`Last export: ${formatDateTime(state.localSettings.lastExportAt)}`}
            linked={section === 'backup'}
          >
            <BackupCard />
          </DisclosureRow>
          <DisclosureRow
            name="automatic-backups"
            title="Automatic backups"
            summary="A copy after each workout, kept on this phone"
            linked={section === 'automatic-backups'}
          >
            <SnapshotsCard />
          </DisclosureRow>
          <DisclosureRow
            name="storage"
            title="Storage and save check"
            summary="Space used, and a check that saves read back"
            linked={section === 'storage'}
          >
            <StorageCard />
          </DisclosureRow>
          <DisclosureRow
            name="older-exports"
            title="Import from another app"
            summary="History from an older app’s export"
            linked={section === 'older-exports'}
          >
            <LegacyImportCard />
          </DisclosureRow>
        </Group>

        <Group title="About" testId="settings-about">
          <DisclosureRow
            name="setup"
            title="Run setup again"
            summary="Your answers filled in; nothing changes until you finish"
            linked={section === 'setup'}
          >
            <p className={styles.body}>
              Walks through the same steps with your current answers filled in. Nothing changes
              until you finish.
            </p>
            <Button
              variant="secondary"
              onClick={() => (window.location.hash = routeHref('onboarding'))}
            >
              Restart onboarding
            </Button>
          </DisclosureRow>
          <DisclosureRow
            name="credits"
            title="Demonstration credits"
            summary="Who made each exercise's video or drawings, and their licences"
            linked={section === 'credits'}
          >
            <MediaCreditsCard />
          </DisclosureRow>
          <DisclosureRow
            name="about"
            title="About this app"
            summary={`Phase ${phase.number} · ${
              CURRENT_PHASE_GATE === 'yellow' ? 'awaiting Android review' : 'in progress'
            } · build ${buildInfo.shortCommit}`}
            linked={section === 'about'}
          >
            <DiagnosticsCard />
          </DisclosureRow>
        </Group>
      </>
    </>
  );
}
