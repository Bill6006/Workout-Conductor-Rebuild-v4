import { buildInfo, formatBuiltAt, isRealCommit } from '../../app/buildInfo';
import { CURRENT_PHASE, CURRENT_PHASE_GATE, getPhase } from '../../app/phases';
import { ACTIONS_URL, REPO_URL, STATUS_URL, commitUrl } from '../../app/projectLinks';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { FactList } from '../../components/FactList/FactList';
import { ScreenHeader } from '../../components/Screen/Screen';
import styles from './TodayScreen.module.css';

export function TodayScreen() {
  const phase = getPhase(CURRENT_PHASE);
  const gateLabel =
    CURRENT_PHASE_GATE === 'yellow' ? 'YELLOW · awaiting Android review' : 'IN PROGRESS';

  return (
    <>
      <ScreenHeader
        title="Today"
        intro="Your recommended workout, planned duration, readiness, and muscle focus will live here."
      />

      <Card tone="accent" eyebrow="Today's workout" title="No workout generated yet">
        <p className={styles.body}>
          Onboarding and a clearly labeled synthetic demo workout arrive in Phase 1. The real
          generation engine, with the single 15 / 30 / 45 / Default workout-length dropdown, arrives
          in Phase 3.
        </p>
        <Button variant="primary" disabled aria-describedby="start-workout-hint">
          Start Workout
        </Button>
        <p id="start-workout-hint" className={styles.hint}>
          Enabled once a workout exists.
        </p>
      </Card>

      <Card eyebrow="Build status" title={`Phase ${phase.number} · ${phase.name}`}>
        <FactList
          items={[
            { label: 'Gate', value: <span className={styles.gate}>{gateLabel}</span> },
            {
              label: 'Commit',
              value: isRealCommit(buildInfo.commit) ? (
                <a
                  className={styles.mono}
                  href={commitUrl(buildInfo.commit)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {buildInfo.shortCommit}
                </a>
              ) : (
                <span className={styles.mono}>{buildInfo.shortCommit}</span>
              ),
            },
            { label: 'Branch', value: buildInfo.branch },
            { label: 'Built', value: formatBuiltAt(buildInfo.builtAt) },
            { label: 'Version', value: buildInfo.version },
          ]}
        />
        <div className={styles.links}>
          <a className={styles.link} href={STATUS_URL} target="_blank" rel="noreferrer">
            Project status
          </a>
          <a className={styles.link} href={REPO_URL} target="_blank" rel="noreferrer">
            Repository
          </a>
          <a className={styles.link} href={ACTIONS_URL} target="_blank" rel="noreferrer">
            Actions
          </a>
        </div>
      </Card>

      <Card eyebrow="Privacy" title="Local-first by design">
        <p className={styles.body}>
          No accounts, no analytics, no cloud sync. Your workout history will be stored only in this
          browser, with export and import under your control.
        </p>
      </Card>
    </>
  );
}
