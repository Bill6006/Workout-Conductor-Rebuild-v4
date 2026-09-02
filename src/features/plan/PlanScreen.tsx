import { PlaceholderCard, ScreenHeader } from '../../components/Screen/Screen';

export function PlanScreen() {
  return (
    <>
      <ScreenHeader
        title="Plan"
        intro="Where the week is shaped: sessions, muscle targets, and the places you train."
      />
      <PlaceholderCard
        title="Weekly plan"
        arrivesIn="Phases 1 and 7"
        items={[
          'Upcoming sessions',
          'Weekly muscle targets',
          'Saved workouts',
          'Equipment profiles',
          'Location profiles (Home, Gym, Travel, Custom)',
          'Recovery balance and planned training days',
        ]}
      />
    </>
  );
}
