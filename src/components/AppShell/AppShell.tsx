import type { ReactNode } from 'react';
import type { RouteId } from '../../app/navigation';
import { BottomNav } from '../BottomNav/BottomNav';
import styles from './AppShell.module.css';

const logoSrc = `${import.meta.env.BASE_URL}icons/icon.svg`;

interface AppShellProps {
  activeRoute: RouteId;
  showNav?: boolean;
  children: ReactNode;
}

/**
 * The shell: the app's name, the screen, the tabs. The build and the phase live under Settings,
 * About (Maintenance 25, the owner's item 5): developer facts out of every screen's first lines.
 */
export function AppShell({ activeRoute, showNav = true, children }: AppShellProps) {
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
      </header>
      <main className={styles.main} id="main">
        {children}
      </main>
      {showNav ? <BottomNav activeRoute={activeRoute} /> : null}
    </div>
  );
}
