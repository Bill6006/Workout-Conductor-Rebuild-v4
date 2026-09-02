import type { ReactNode } from 'react';
import { buildInfo, formatBuildMarker } from '../../app/buildInfo';
import type { RouteId } from '../../app/navigation';
import { CURRENT_PHASE, getPhase } from '../../app/phases';
import { BottomNav } from '../BottomNav/BottomNav';
import styles from './AppShell.module.css';

const logoSrc = `${import.meta.env.BASE_URL}icons/icon.svg`;

interface AppShellProps {
  activeRoute: RouteId;
  showNav?: boolean;
  children: ReactNode;
}

export function AppShell({ activeRoute, showNav = true, children }: AppShellProps) {
  const phase = getPhase(CURRENT_PHASE);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <img className={styles.logo} src={logoSrc} alt="" width={40} height={40} />
          <div className={styles.brandText}>
            <p className={styles.brandName}>Workout Conductor</p>
            <p className={styles.brandTagline}>Adaptive Strength + Hypertrophy</p>
          </div>
        </div>
        <span
          className={styles.phaseChip}
          data-testid="phase-chip"
          title={phase.name}
          aria-label={`Current phase: Phase ${phase.number}, ${phase.name}`}
        >
          <span className={styles.phaseDot} aria-hidden="true" />
          Phase {phase.number}
        </span>
      </header>
      <p className={styles.buildMarker} data-testid="build-marker">
        {formatBuildMarker(buildInfo)}
      </p>
      <main className={styles.main} id="main">
        {children}
      </main>
      {showNav ? <BottomNav activeRoute={activeRoute} /> : null}
    </div>
  );
}
