import { SetupInterruptedError } from '../../core/state/setupBase';
import { keyedLines } from '../../core/screen/keyedLines';
import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { ProgressBar } from '../../components/ProgressBar/ProgressBar';
import { useToast } from '../../components/Toast/useToast';
import { useAppState, useAppStore } from '../../core/state/useAppStore';
import { HOME_LOCATION_ID, type LocationProfile } from '../../core/validation/location';
import {
  ONBOARDING_DRAFT_KEY,
  defaultStorage,
  readJson,
  writeJson,
} from '../../core/storage/localSettings';
import { nowIso, useNow } from '../../core/time/clock';
import { routeHref, sectionHref } from '../../app/navigation';
import {
  OnboardingDraftSchema,
  createDraft,
  draftBase,
  draftFromState,
  type ProfileDraft,
} from '../profile/draft';
import { ExercisePreferencesEditor } from '../profile/editors/ExercisePreferencesEditor';
import { GoalsEditor } from '../profile/editors/GoalsEditor';
import { LimitationsEditor } from '../profile/editors/LimitationsEditor';
import { PlacesEditor } from '../profile/editors/PlacesEditor';
import { ScheduleEditor } from '../profile/editors/ScheduleEditor';
import { StyleEditor } from '../profile/editors/StyleEditor';
import { UnitsEditor } from '../profile/editors/UnitsEditor';
import {
  ONBOARDING_STEPS,
  STEP_COUNT,
  validateAll,
  validateStep,
  type OnboardingStepId,
} from './steps';
import styles from './OnboardingScreen.module.css';

interface WizardState {
  step: number;
  draft: ProfileDraft;
}

function loadInitialState(
  nowValue: string,
  existing: ProfileDraft | null,
  base: string | null,
): WizardState {
  const saved = readJson(ONBOARDING_DRAFT_KEY, OnboardingDraftSchema, defaultStorage());
  // A run left part-way is resumed only from where it began: the profile and places as they
  // still stand (a first run's draft, once a profile has come, is not).
  if (saved && (saved.basedOn ?? null) === base) {
    return {
      step: Math.min(saved.step, STEP_COUNT - 1),
      draft: { profile: saved.profile, locations: saved.locations },
    };
  }
  return { step: 0, draft: existing ?? createDraft(nowValue) };
}

/**
 * Default answers over the places stored, when the profile cannot be read: Finish then keeps the
 * owner's places and their equipment (the tenth review's eighth re-check).
 */
function overStoredPlaces(draft: ProfileDraft, locations: LocationProfile[]): ProfileDraft {
  if (locations.length === 0) return draft;
  const kept = (id: string) => locations.some((location) => location.id === id);
  const current = kept(draft.profile.currentLocationId)
    ? draft.profile.currentLocationId
    : kept(HOME_LOCATION_ID)
      ? HOME_LOCATION_ID
      : locations[0]!.id;
  return {
    profile: { ...draft.profile, currentLocationId: current },
    locations: structuredClone(locations),
  };
}

function persist(state: WizardState, base: string | null) {
  writeJson(
    ONBOARDING_DRAFT_KEY,
    {
      step: state.step,
      profile: state.draft.profile,
      locations: state.draft.locations,
      basedOn: base,
    },
    defaultStorage(),
  );
}

function StepEditor({
  id,
  draft,
  onChange,
}: {
  id: OnboardingStepId;
  draft: ProfileDraft;
  onChange: (next: ProfileDraft) => void;
}) {
  switch (id) {
    case 'goals':
      return <GoalsEditor draft={draft} onChange={onChange} />;
    case 'schedule':
      return <ScheduleEditor draft={draft} onChange={onChange} />;
    case 'places':
      return <PlacesEditor draft={draft} onChange={onChange} />;
    case 'exercises':
      return <ExercisePreferencesEditor draft={draft} onChange={onChange} />;
    case 'limitations':
      return <LimitationsEditor draft={draft} onChange={onChange} />;
    case 'style':
      return <StyleEditor draft={draft} onChange={onChange} />;
    case 'units':
      return <UnitsEditor draft={draft} onChange={onChange} />;
  }
}

/** Short step-by-step setup. Everything here stays editable in Settings. */
export function OnboardingScreen() {
  const store = useAppStore();
  const appState = useAppState();
  const toast = useToast();
  const nowEpoch = useNow();
  const nowValue = new Date(nowEpoch || 0).toISOString();
  // Without a readable profile, setup starts from default answers over the places stored, if any
  // (the tenth review's eighth and ninth re-checks).
  const existing = appState.profile
    ? draftFromState(appState.profile, appState.locations)
    : overStoredPlaces(createDraft(nowValue), appState.locations);
  // What this run starts from, fixed for the run.
  const [base, setBase] = useState(() => draftBase(appState.profile, appState.locations));
  // The places this run began from: Use defaults keeps them, never this run's own part-way writes
  // (the thirteenth re-check: after a cut-off it kept Home and never made the Gym).
  const [startPlaces, setStartPlaces] = useState(() => appState.locations);
  const [wizard, setWizard] = useState<WizardState>(() =>
    loadInitialState(nowValue, existing, base),
  );
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const step = ONBOARDING_STEPS[wizard.step] ?? ONBOARDING_STEPS[0];
  const isFirst = wizard.step === 0;
  const isLast = wizard.step === STEP_COUNT - 1;
  const restarting = appState.profile !== null;

  function setDraft(draft: ProfileDraft) {
    const next = { ...wizard, draft };
    setWizard(next);
    setProblems([]);
    persist(next, base);
  }

  function goTo(stepIndex: number) {
    const next = { ...wizard, step: stepIndex };
    setWizard(next);
    setProblems([]);
    persist(next, base);
    window.scrollTo({ top: 0 });
  }

  async function finish(draft: ProfileDraft) {
    const allProblems = validateAll(draft);
    if (allProblems.length > 0) {
      setProblems(allProblems);
      return;
    }
    setBusy(true);
    try {
      const stamp = nowIso();
      const outcome = await store.completeOnboarding(
        { ...draft.profile, createdAt: appState.profile?.createdAt ?? stamp, updatedAt: stamp },
        draft.locations,
        { base },
      );
      toast.show(
        outcome === 'restored'
          ? 'Your data changed while setup was open: what is saved now is shown'
          : 'Profile saved and verified on this device',
        'success',
      );
      if (outcome === 'restored') {
        // Setup stays on screen when it is still needed (the profile on disk cannot be read): it
        // starts again from what is there now, so the next Finish is not refused for the same
        // change (the tenth review's seventh re-check).
        const after = store.getSnapshot();
        setBase(draftBase(after.profile, after.locations));
        setStartPlaces(after.locations);
        setProblems([]);
        setWizard({
          step: 0,
          draft: after.profile
            ? draftFromState(after.profile, after.locations)
            : overStoredPlaces(createDraft(nowIso()), after.locations),
        });
      }
      window.location.hash = routeHref('today');
    } catch (error) {
      if (error instanceof SetupInterruptedError) {
        // Cut off part-way: what it wrote stays, and setup starts from that now, the answers kept,
        // so Finish again goes through, and so does a reopened setup (the eleventh re-check).
        setBase(error.left);
        persist(wizard, error.left);
      }
      toast.show(error instanceof Error ? error.message : 'Saving failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  function next() {
    const stepProblems = validateStep(step.id, wizard.draft);
    if (stepProblems.length > 0) {
      setProblems(stepProblems);
      return;
    }
    if (isLast) {
      void finish(wizard.draft);
    } else {
      goTo(wizard.step + 1);
    }
  }

  return (
    <div className={styles.screen} data-testid="onboarding">
      <div className={styles.progress}>
        <div className={styles.progressText}>
          <span className={styles.stepLabel}>
            Step {wizard.step + 1} of {STEP_COUNT}
          </span>
          {restarting ? <span className={styles.restartNote}>Editing your saved setup</span> : null}
        </div>
        <ProgressBar value={wizard.step + 1} max={STEP_COUNT} label="Setup progress" />
      </div>

      <div className={styles.heading}>
        <h1 className={styles.title}>{step.title}</h1>
        <p className={styles.subtitle}>{step.subtitle}</p>
      </div>

      <Card>
        {/* Held while Finish saves: an answer changed then would show and never be saved. */}
        <fieldset className={styles.fields} disabled={busy}>
          <StepEditor id={step.id} draft={wizard.draft} onChange={setDraft} />
        </fieldset>
      </Card>

      {problems.length > 0 ? (
        <Card>
          <ul className={styles.problems} role="alert">
            {keyedLines(problems).map(({ key, line }) => (
              <li key={key}>{line}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {isFirst && !restarting ? (
        <button
          type="button"
          className={styles.skip}
          disabled={busy}
          onClick={() => void finish(overStoredPlaces(createDraft(nowIso()), startPlaces))}
        >
          Use defaults and skip setup
        </button>
      ) : null}

      <div className={styles.actions}>
        <Button
          variant="secondary"
          onClick={() =>
            isFirst
              ? (window.location.hash = sectionHref('settings', 'setup'))
              : goTo(wizard.step - 1)
          }
          disabled={busy || (isFirst && !restarting)}
        >
          {isFirst ? 'Cancel' : 'Back'}
        </Button>
        <Button variant="primary" onClick={next} disabled={busy}>
          {isLast ? (busy ? 'Saving…' : 'Finish setup') : 'Next'}
        </Button>
      </div>
    </div>
  );
}
