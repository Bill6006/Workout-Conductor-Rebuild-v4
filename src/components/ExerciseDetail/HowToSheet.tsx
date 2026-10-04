import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import type { CustomInstruction } from '../../core/validation/customExercise';
import { useCustomMedia } from '../../features/library/useCustomMedia';
import { Sheet } from '../Sheet/Sheet';
import styles from './ExerciseDetail.module.css';
import { ExerciseDemo } from './ExerciseMedia';
import { ExerciseTeaching } from './ExerciseTeaching';

interface HowToSheetProps {
  exercise: CatalogExercise | null;
  onClose: () => void;
  /** The lifter's own setup, steps and cues for the lift, from its Notes. */
  own?: Pick<CustomInstruction, 'setup' | 'execution' | 'cues'>;
  /** The workout's key for this exercise (demoHoldKey): Pause here stills its card too. */
  holdKey?: string | null;
}

/**
 * How to do the exercise (Maintenance 25, item 7), opened from the workout card: the
 * demonstration large, then the setup, the steps, the cues that matter, the mistakes to avoid and
 * how far to go. Who made the demonstration and on what terms sit under it; the session's own
 * actions stay in Options, so this teaches and nothing else.
 */
export function HowToSheet({ exercise, onClose, own, holdKey = null }: HowToSheetProps) {
  const customMedia = useCustomMedia(exercise?.id ?? '');
  if (!exercise) return null;
  return (
    <Sheet open title={`How to: ${exercise.name}`} onClose={onClose}>
      <div className={styles.howTo} data-testid="how-to-sheet">
        <ExerciseDemo exercise={exercise} customMedia={customMedia} holdKey={holdKey} />
        <ExerciseTeaching exercise={exercise} own={own} />
      </div>
    </Sheet>
  );
}
