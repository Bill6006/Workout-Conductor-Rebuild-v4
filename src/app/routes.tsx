import { PlanScreen } from '../features/plan/PlanScreen';
import { ProgressScreen } from '../features/progress/ProgressScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { TodayScreen } from '../features/today/TodayScreen';
import { WorkoutScreen } from '../features/workout/WorkoutScreen';
import type { RouteId } from './navigation';

interface ActiveScreenProps {
  routeId: RouteId;
}

/** Renders the screen for the active route. Exhaustive over RouteId. */
export function ActiveScreen({ routeId }: ActiveScreenProps) {
  switch (routeId) {
    case 'today':
      return <TodayScreen />;
    case 'workout':
      return <WorkoutScreen />;
    case 'progress':
      return <ProgressScreen />;
    case 'plan':
      return <PlanScreen />;
    case 'settings':
      return <SettingsScreen />;
  }
}
