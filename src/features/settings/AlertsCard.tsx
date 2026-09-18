import { useState } from 'react';
import { Card } from '../../components/Card/Card';
import { Toggle } from '../../components/Form/Toggle';
import { notifyPermission, requestNotifyPermission } from '../../core/alerts/notify';
import { restSounds } from '../../core/alerts/restSounds';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import styles from './Settings.module.css';

/**
 * Sounds and notifications, kept on this device. Permission for notifications
 * is asked for here and nowhere else, and only when the switch is turned on.
 */
export function AlertsCard() {
  const store = useAppStore();
  const sounds = useAppSelector((state) => state.localSettings.restSounds);
  const notifications = useAppSelector((state) => state.localSettings.notifications);
  const [blocked, setBlocked] = useState(() => notifyPermission() === 'denied');
  const supported = notifyPermission() !== 'unsupported';

  const setNotifications = async (on: boolean) => {
    if (!on) {
      store.updateLocalSettings({ notifications: false });
      return;
    }
    const permission = await requestNotifyPermission();
    setBlocked(permission === 'denied');
    store.updateLocalSettings({ notifications: permission === 'granted' });
  };

  return (
    <Card eyebrow="Alerts" title="Sounds and notifications">
      <div data-testid="alerts-card">
        <Toggle
          label="Rest timer sounds"
          description="Three ticks, then a longer tone when the rest ends."
          checked={sounds}
          onChange={(checked) => {
            // The tap that turns sounds on is also what lets the browser play them.
            if (checked) restSounds.unlock();
            store.updateLocalSettings({ restSounds: checked });
          }}
        />
        {supported ? (
          <Toggle
            label="Notifications"
            description="When a rest ends or a workout is left open, while the app is in the background."
            checked={notifications && !blocked}
            onChange={(checked) => void setNotifications(checked)}
          />
        ) : null}
        <p className={styles.body} data-testid="alerts-note">
          {!supported
            ? 'This browser has no notifications.'
            : blocked
              ? 'Notifications are blocked for this site in the browser’s settings.'
              : 'With the phone locked a notification may come late or not at all: the app cannot wake itself.'}
        </p>
      </div>
    </Card>
  );
}
