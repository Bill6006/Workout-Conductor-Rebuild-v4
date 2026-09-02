import { buildInfo, formatBuildMarker } from '../../app/buildInfo';
import { Card } from '../../components/Card/Card';
import { FactList, type Fact } from '../../components/FactList/FactList';
import { PlaceholderCard, ScreenHeader } from '../../components/Screen/Screen';

function readEnvironmentFacts(): Fact[] {
  const standalone =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const serviceWorkerSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;

  return [
    { label: 'Build', value: formatBuildMarker(buildInfo) },
    { label: 'Display', value: standalone ? 'Installed app (standalone)' : 'Browser tab' },
    {
      label: 'Offline shell',
      value: serviceWorkerSupported ? 'Service worker supported' : 'Not supported here',
    },
    { label: 'Network', value: online ? 'Online' : 'Offline' },
    { label: 'Data', value: 'Stays on this device' },
  ];
}

export function SettingsScreen() {
  const facts = readEnvironmentFacts();

  return (
    <>
      <ScreenHeader
        title="Settings"
        intro="Everything collected in onboarding stays editable here, plus backup and diagnostics."
      />
      <PlaceholderCard
        title="Preferences"
        arrivesIn="Phase 1"
        items={[
          'Goals and programming style',
          'Supersets, drop sets, and circuits',
          'Equipment and locations',
          'Exercise preferences and limitations',
          'Units and default workout duration',
          'Backup, import, and export',
        ]}
      />
      <Card eyebrow="Diagnostics" title="This device">
        <FactList items={facts} />
      </Card>
    </>
  );
}
