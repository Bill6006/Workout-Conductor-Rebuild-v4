import { useState } from 'react';
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
export function RatingSheet({ open, endedEarly, onClose, onSave, onDiscard }: RatingSheetProps) {
  const [effort, setEffort] = useState<SessionRating['effort']>('right');
  const [pain, setPain] = useState(false);
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
            onClick={() => onSave({ effort, pain, energyAfter: energy, note: note.trim() })}
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
      <button
        type="button"
        role="switch"
        aria-checked={pain}
        className={styles.ratingChip}
        onClick={() => setPain((current) => !current)}
        data-testid="rating-pain"
      >
        {pain ? 'Pain reported ✓' : 'No pain'}
      </button>
      <label className={styles.panelLabel} htmlFor="energy-after">
        Energy after: {energy} of 5
      </label>
      <input
        id="energy-after"
        className={styles.range}
        type="range"
        min={1}
        max={5}
        step={1}
        value={energy}
        onChange={(event) => setEnergy(Number(event.target.value))}
      />
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
