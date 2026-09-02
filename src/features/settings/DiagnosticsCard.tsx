import { buildInfo, formatBuiltAt, isRealCommit } from '../../app/buildInfo';
import { CURRENT_PHASE, CURRENT_PHASE_GATE, getPhase } from '../../app/phases';
import { ACTIONS_URL, REPO_URL, STATUS_URL, commitUrl } from '../../app/projectLinks';
import { Card } from '../../components/Card/Card';
import { FactList, type Fact } from '../../components/FactList/FactList';
import { useAppState } from '../../core/state/useAppStore';
import { formatDateTime } from '../../core/time/clock';
import styles from './Settings.module.css';

function environmentFacts(): Fact[] {
  const standalone =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const serviceWorkerSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  return [
    { label: 'Display', value: standalone ? 'Installed app (standalone)' : 'Browser tab' },
    {
      label: 'Offline shell',
      value: serviceWorkerSupported ? 'Service worker supported' : 'Not supported here',
    },
    { label: 'Network', value: online ? 'Online' : 'Offline' },
  ];
}

export function DiagnosticsCard() {
  const state = useAppState();
  const phase = getPhase(CURRENT_PHASE);

  const storageFacts: Fact[] = [
    {
      label: 'Storage',
      value:
        state.status === 'ready'
          ? 'IndexedDB ready'
          : state.status === 'error'
            ? `Unavailable: ${state.error}`
            : 'Opening…',
    },
    { label: 'Profile', value: state.profile ? 'Saved' : 'Not saved' },
    { label: 'Places', value: String(state.locations.length) },
    { label: 'Workouts', value: String(state.workoutCount) },
    {
      label: 'Last verified save',
      value: state.lastReceipt
        ? `${state.lastReceipt.store} · ${formatDateTime(state.lastReceipt.verifiedAt)} · ${state.lastReceipt.bytes} bytes`
        : 'none this session',
    },
    { label: 'Setup completed', value: formatDateTime(state.localSettings.onboardingCompletedAt) },
  ];

  return (
    <Card eyebrow="Diagnostics" title={`Phase ${phase.number} · ${phase.name}`}>
      <FactList
        items={[
          {
            label: 'Gate',
            value: (
              <span className={styles.gate}>
                {CURRENT_PHASE_GATE === 'yellow'
                  ? 'YELLOW · awaiting Android review'
                  : 'IN PROGRESS'}
              </span>
            ),
          },
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
          { label: 'Built', value: formatBuiltAt(buildInfo.builtAt) },
          { label: 'Version', value: buildInfo.version },
          ...storageFacts,
          ...environmentFacts(),
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
  );
}
