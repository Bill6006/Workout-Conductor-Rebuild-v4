import { PlaceholderCard, ScreenHeader } from '../../components/Screen/Screen';

export function WorkoutScreen() {
  return (
    <>
      <ScreenHeader
        title="Workout"
        intro="The active session: one unmistakable current set, fast logging, and calm recalibration."
      />
      <PlaceholderCard
        title="Active workout"
        arrivesIn="Phases 4 and 5"
        items={[
          'Exercise cards with looping demonstrations',
          'One-handed set logging for weight, reps, and RIR',
          'Rest timer that survives screen changes',
          'Ranked alternatives that replace only one exercise',
          'Recalibration state with a plain change summary',
          'Workout completion and session rating',
        ]}
      />
    </>
  );
}
