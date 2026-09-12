import { routeHref } from '../../app/navigation';
import { Sheet } from '../../components/Sheet/Sheet';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import { LOCATION_KIND_OPTIONS, labelFor } from '../profile/labels';
import styles from './LocationSheet.module.css';

interface LocationSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The place chooser on Today: every saved place, today's marked, one tap to
 * switch. The switch saves the profile, so Settings shows the same choice, and
 * runs the location recalibration with its usual banner. Editing a place's
 * equipment stays on the Plan tab.
 */
export function LocationSheet({ open, onClose }: LocationSheetProps) {
  const store = useAppStore();
  const profile = useAppSelector((state) => state.profile);
  const locations = useAppSelector((state) => state.locations);
  if (!profile) return null;

  const choose = async (id: string) => {
    onClose();
    if (id === profile.currentLocationId) return;
    await store.saveProfile({ ...profile, currentLocationId: id });
  };

  return (
    <Sheet
      open={open}
      title="Where are you training?"
      onClose={onClose}
      footer={
        <a className={styles.manage} href={routeHref('plan')} data-testid="location-manage">
          Manage places on the Plan tab ›
        </a>
      }
    >
      <ul className={styles.list} role="listbox" aria-label="Places">
        {locations.map((location) => {
          const current = location.id === profile.currentLocationId;
          return (
            <li key={location.id}>
              <button
                type="button"
                role="option"
                aria-selected={current}
                className={styles.option}
                onClick={() => void choose(location.id)}
                data-testid={`location-option-${location.id}`}
              >
                <span className={styles.name}>{location.name}</span>
                <span className={styles.kind}>
                  {labelFor(LOCATION_KIND_OPTIONS, location.kind)}
                  {current ? ' · today' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className={styles.note}>
        Switching rebuilds today's preview for that place's equipment. Settings shows the same
        choice.
      </p>
    </Sheet>
  );
}
