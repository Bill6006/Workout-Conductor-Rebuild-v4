import { installApp, useInstallOffer } from '../../app/pwa/installOffer';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import styles from './Settings.module.css';

/**
 * "Install the app", at the top of Settings, only while the browser offers to install it
 * (src/app/pwa/installOffer.ts): the browser's own dialog installs this app even where Chrome's
 * menu says another app of the site is this one. Gone once used, dismissed or installed.
 */
export function InstallCard() {
  const offer = useInstallOffer();
  if (offer === 'none') return null;
  return (
    <div data-testid="install-card">
      <Card>
        <p className={styles.body}>
          Workout Conductor can sit on your home screen as an app of its own, without Chrome’s
          address bar.
        </p>
        <Button
          variant="primary"
          disabled={offer === 'asking'}
          // A prompt the browser refuses clears the offer as well; the browser offers again when
          // it can install.
          onClick={() => void installApp().catch(() => undefined)}
          data-testid="install-app"
        >
          Install the app
        </Button>
      </Card>
    </div>
  );
}
