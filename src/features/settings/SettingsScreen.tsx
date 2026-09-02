import { routeHref } from '../../app/navigation';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { ScreenHeader } from '../../components/Screen/Screen';
import { useAppState } from '../../core/state/useAppStore';
import { ExercisePreferencesEditor } from '../profile/editors/ExercisePreferencesEditor';
import { GoalsEditor } from '../profile/editors/GoalsEditor';
import { LimitationsEditor } from '../profile/editors/LimitationsEditor';
import { PlacesEditor } from '../profile/editors/PlacesEditor';
import { ScheduleEditor } from '../profile/editors/ScheduleEditor';
import { StyleEditor } from '../profile/editors/StyleEditor';
import { UnitsEditor } from '../profile/editors/UnitsEditor';
import { useProfileEditor } from '../profile/useProfileEditor';
import { BackupCard } from './BackupCard';
import { DiagnosticsCard } from './DiagnosticsCard';
import styles from './Settings.module.css';

export function SettingsScreen() {
  const state = useAppState();
  const editor = useProfileEditor();
  const draft = editor.draft;

  const statusText =
    editor.status === 'saving'
      ? 'Saving…'
      : editor.status === 'error'
        ? `Save failed: ${editor.error ?? 'unknown error'}`
        : editor.status === 'saved'
          ? 'Saved and verified on this device'
          : 'Changes save automatically and are verified by read-back';

  return (
    <>
      <ScreenHeader title="Settings" intro="Everything from setup, editable any time." />

      {draft ? (
        <>
          <p className={styles.saveStatus} data-testid="settings-save-status" aria-live="polite">
            {statusText}
          </p>

          <Card eyebrow="Goals" title="What you are training for">
            <GoalsEditor draft={draft} onChange={editor.update} />
          </Card>

          <Card eyebrow="Programming" title="Style, techniques, and rest">
            <StyleEditor draft={draft} onChange={editor.update} />
          </Card>

          <Card eyebrow="Schedule" title="Experience, frequency, length, days">
            <ScheduleEditor draft={draft} onChange={editor.update} />
          </Card>

          <Card eyebrow="Places" title="Gym access and home equipment">
            <PlacesEditor draft={draft} onChange={editor.update} />
            <a className={styles.inlineLink} href={routeHref('plan')}>
              Manage all locations on the Plan tab ›
            </a>
          </Card>

          <Card eyebrow="Exercise preferences" title="Loved and avoided">
            <ExercisePreferencesEditor draft={draft} onChange={editor.update} />
          </Card>

          <Card eyebrow="Limitations" title="Pain and movement limits">
            <LimitationsEditor draft={draft} onChange={editor.update} />
          </Card>

          <Card eyebrow="Units" title="Units and bodyweight">
            <UnitsEditor draft={draft} onChange={editor.update} />
          </Card>
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

      <BackupCard />

      <Card eyebrow="Setup" title="Run setup again">
        <p className={styles.body}>
          Walks through the same steps with your current answers filled in. Nothing changes until
          you finish.
        </p>
        <Button
          variant="secondary"
          onClick={() => (window.location.hash = routeHref('onboarding'))}
        >
          Restart onboarding
        </Button>
      </Card>

      <DiagnosticsCard />
    </>
  );
}
