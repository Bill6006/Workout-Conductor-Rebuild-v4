import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { ProgressBar } from '../../components/ProgressBar/ProgressBar';
import { useToast } from '../../components/Toast/useToast';
import { useAppState, useAppStore } from '../../core/state/useAppStore';
import {
  ONBOARDING_DRAFT_KEY,
  defaultStorage,
  readJson,
  writeJson,
} from '../../core/storage/localSettings';
import { nowIso, useNow } from '../../core/time/clock';
import { routeHref } from '../../app/navigation';
import {
  OnboardingDraftSchema,
  createDraft,
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

function loadInitialState(nowValue: string, existing: ProfileDraft | null): WizardState {
  const saved = readJson(ONBOARDING_DRAFT_KEY, OnboardingDraftSchema, defaultStorage());
  if (saved) {
    return {
      step: Math.min(saved.step, STEP_COUNT - 1),
      draft: { profile: saved.profile, locations: saved.locations },
    };
  }
  return { step: 0, draft: existing ?? createDraft(nowValue) };
}

function persist(state: WizardState) {
  writeJson(
    ONBOARDING_DRAFT_KEY,
    { step: state.step, profile: state.draft.profile, locations: state.draft.locations },
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
  const existing = appState.profile ? draftFromState(appState.profile, appState.locations) : null;
  const [wizard, setWizard] = useState<WizardState>(() => loadInitialState(nowValue, existing));
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
    persist(next);
  }

  function goTo(stepIndex: number) {
    const next = { ...wizard, step: stepIndex };
    setWizard(next);
    setProblems([]);
    persist(next);
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
      await store.completeOnboarding(
        { ...draft.profile, createdAt: appState.profile?.createdAt ?? stamp, updatedAt: stamp },
        draft.locations,
      );
      toast.show('Profile saved and verified on this device', 'success');
      window.location.hash = routeHref('today');
    } catch (error) {
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
        <StepEditor id={step.id} draft={wizard.draft} onChange={setDraft} />
      </Card>

      {problems.length > 0 ? (
        <Card>
          <ul className={styles.problems} role="alert">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {isFirst && !restarting ? (
        <button
          type="button"
          className={styles.skip}
          disabled={busy}
          onClick={() => void finish(createDraft(nowIso()))}
        >
          Use defaults and skip setup
        </button>
      ) : null}

      <div className={styles.actions}>
        <Button
          variant="secondary"
          onClick={() =>
            isFirst ? (window.location.hash = routeHref('settings')) : goTo(wizard.step - 1)
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
