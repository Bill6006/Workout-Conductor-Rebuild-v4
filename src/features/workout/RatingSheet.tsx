import { useState } from 'react';
import { JOINTS, type Joint } from '../../catalog/exercises/exerciseSchema';
import { jointName } from '../../catalog/exercises/joints';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import type { SessionRating } from '../../core/validation/workoutRecord';
import styles from './ActiveWorkout.module.css';

interface RatingSheetProps {
  open: boolean;
  endedEarly: boolean;
  onClose: () => void;
  onSave: (rating: SessionRating | null) => void;
  /** Offered when ending early: throw the session away after a confirmation. */
  onDiscard?: () => void;
}

const EFFORTS: { id: SessionRating['effort']; label: string }[] = [
  { id: 'too-easy', label: 'Too easy' },
  { id: 'right', label: 'About right' },
  { id: 'too-hard', label: 'Too hard' },
];

/** The quick session rating asked when a workout is saved; every answer is optional. */
/** Energy after the session, in words; each maps to 1 to 5 underneath, so the engines see numbers. */
const ENERGY_WORDS = ['Drained', 'Low', 'Okay', 'Good', 'Full'] as const;

export function RatingSheet({ open, endedEarly, onClose, onSave, onDiscard }: RatingSheetProps) {
  const [effort, setEffort] = useState<SessionRating['effort']>('right');
  const [pain, setPain] = useState(false);
  const [joint, setJoint] = useState<Joint | null>(null);
  const [energy, setEnergy] = useState(3);
  const [note, setNote] = useState('');

  return (
    <Sheet
      open={open}
      title={endedEarly ? 'End the workout early?' : 'How did it go?'}
      onClose={onClose}
      footer={
        <div className={styles.ratingActions}>
          <Button
            variant="primary"
            onClick={() =>
              onSave({
                effort,
                pain,
                // Where it hurt goes with the pain, and only with it.
                ...(pain && joint ? { joint } : {}),
                energyAfter: energy,
                note: note.trim(),
              })
            }
            data-testid="save-workout"
          >
            {endedEarly ? 'End and save' : 'Save workout'}
          </Button>
          <button type="button" className={styles.linkButton} onClick={() => onSave(null)}>
            Save without rating
          </button>
          {endedEarly && onDiscard ? (
            <button
              type="button"
              className={styles.linkButton}
              onClick={onDiscard}
              data-testid="discard-workout"
            >
              End without saving
            </button>
          ) : null}
        </div>
      }
    >
      {endedEarly ? (
        <p className={styles.panelNote}>
          Everything you logged is saved exactly as entered. Remaining sets are left out.
        </p>
      ) : null}
      <div className={styles.ratingGroup} role="radiogroup" aria-label="Effort">
        {EFFORTS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={effort === option.id}
            className={styles.ratingChip}
            onClick={() => setEffort(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {/* Two plain answers, never a switch whose label says the opposite of what a tap does. */}
      <p className={styles.panelLabel} id="pain-label">
        Pain
      </p>
      <div
        className={styles.ratingGroup}
        role="radiogroup"
        aria-labelledby="pain-label"
        data-testid="rating-pain"
      >
        {[
          { value: false, label: 'No pain' },
          { value: true, label: 'Some pain' },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={pain === option.value}
            className={styles.ratingChip}
            onClick={() => setPain(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {pain ? (
        <>
          <p className={styles.panelLabel} id="pain-where-label">
            Where?
          </p>
          <div
            className={styles.ratingGroup}
            role="radiogroup"
            aria-labelledby="pain-where-label"
            data-testid="rating-pain-where"
          >
            {JOINTS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={joint === option}
                className={styles.ratingChip}
                onClick={() => setJoint(option)}
              >
                {jointName(option)}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <p className={styles.panelLabel} id="energy-after-label">
        Energy after
      </p>
      <div
        className={styles.ratingGroup}
        role="radiogroup"
        aria-labelledby="energy-after-label"
        data-testid="energy-after"
      >
        {ENERGY_WORDS.map((word, index) => (
          <button
            key={word}
            type="button"
            role="radio"
            aria-checked={energy === index + 1}
            className={styles.ratingChip}
            onClick={() => setEnergy(index + 1)}
            data-value={index + 1}
          >
            {word}
          </button>
        ))}
      </div>
      <label className={styles.panelLabel} htmlFor="rating-note">
        Note (optional)
      </label>
      <textarea
        id="rating-note"
        className={styles.textarea}
        rows={2}
        maxLength={500}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Anything to remember next time"
      />
    </Sheet>
  );
}
