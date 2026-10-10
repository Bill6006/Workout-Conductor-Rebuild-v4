import { useState } from 'react';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import type { CustomInstruction } from '../../core/validation/customExercise';
import { useOwnDemonstration } from '../../features/library/useOwnDemonstration';
import { Sheet } from '../Sheet/Sheet';
import styles from './ExerciseDetail.module.css';
import { ExerciseDemo } from './ExerciseMedia';
import { ExerciseTeaching } from './ExerciseTeaching';

interface HowToSheetProps {
  exercise: CatalogExercise | null;
  onClose: () => void;
  /** The lifter's own setup, steps and cues for the lift, from its Notes. */
  own?: Pick<CustomInstruction, 'setup' | 'execution' | 'cues'>;
}

/**
 * How to do the exercise (Maintenance 25, item 7), opened from the workout card: the
 * demonstration large, then the setup, the steps, the cues that matter, the mistakes to avoid and
 * how far to go. Who made the demonstration and on what terms sit under it. The lifter's own GIF,
 * photo or video is set here too, by a tap on the demonstration or its button (Maintenance 26,
 * item 50: the owner could not change it here); the session's own actions stay in Options.
 */
export function HowToSheet({ exercise, onClose, own }: HowToSheetProps) {
  // Shut, it keeps reading the exercise it last showed, so it opens on the picture the lifter has
  // now, never one replaced meanwhile (the eleventh pass of item 50: the old one showed first).
  const [last, setLast] = useState(exercise?.id ?? '');
  if (exercise && exercise.id !== last) setLast(exercise.id);
  const demonstration = useOwnDemonstration(exercise?.id ?? last);
  if (!exercise) return null;
  return (
    <Sheet open title={`How to: ${exercise.name}`} onClose={onClose}>
      <div className={styles.howTo} data-testid="how-to-sheet">
        {/* One per exercise: what was pressed, refused or saved on one is not carried to the next
            (the third pass of item 50). */}
        <ExerciseDemo
          key={exercise.id}
          exercise={exercise}
          customMedia={demonstration.media}
          onPickFile={demonstration.pick}
          onRemove={demonstration.remove}
          busy={demonstration.busy}
        />
        <ExerciseTeaching exercise={exercise} own={own} />
      </div>
    </Sheet>
  );
}
