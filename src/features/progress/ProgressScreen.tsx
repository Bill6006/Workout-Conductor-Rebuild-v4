import { Card } from '../../components/Card/Card';
import { PlaceholderCard, ScreenHeader } from '../../components/Screen/Screen';
import { useAppState } from '../../core/state/useAppStore';

export function ProgressScreen() {
  const state = useAppState();

  return (
    <>
      <ScreenHeader
        title="Progress"
        intro="History and trends with honest confidence, never false precision."
      />
      <Card eyebrow="History" title={`${state.workoutCount} workouts logged`}>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.92rem' }}>
          Workouts are stored on this device once logging arrives in Phase 5.
        </p>
      </Card>
      <PlaceholderCard
        title="Progress and analytics"
        arrivesIn="Phase 7"
        items={[
          'Strength trends and exercise progress',
          'Weekly muscle volume against target bands',
          'Weekly consistency',
          'Personal records with compact badges',
          'Estimated strength with clear calculation explanations',
        ]}
      />
    </>
  );
}
