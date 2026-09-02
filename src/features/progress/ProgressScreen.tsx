import { PlaceholderCard, ScreenHeader } from '../../components/Screen/Screen';

export function ProgressScreen() {
  return (
    <>
      <ScreenHeader
        title="Progress"
        intro="History and trends with honest confidence, never false precision."
      />
      <PlaceholderCard
        title="Progress and analytics"
        arrivesIn="Phase 7"
        items={[
          'Workout history',
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
