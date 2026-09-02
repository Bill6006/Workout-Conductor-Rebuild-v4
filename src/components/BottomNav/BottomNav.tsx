import { NAV_ITEMS, routeHref, type RouteId } from '../../app/navigation';
import { NavIcon } from '../NavIcons/NavIcons';
import styles from './BottomNav.module.css';

interface BottomNavProps {
  activeRoute: RouteId;
}

export function BottomNav({ activeRoute }: BottomNavProps) {
  return (
    <nav className={styles.nav} aria-label="Primary">
      <div className={styles.inner}>
        {NAV_ITEMS.map((item) => {
          const active = item.id === activeRoute;
          return (
            <a
              key={item.id}
              href={routeHref(item.id)}
              className={styles.item}
              aria-current={active ? 'page' : undefined}
              data-route={item.id}
            >
              <span className={styles.iconWrap}>
                <NavIcon id={item.id} />
              </span>
              <span className={styles.label}>{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
