import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import { keyedLines } from '../../core/screen/keyedLines';
import type { CustomInstruction } from '../../core/validation/customExercise';
import styles from './ExerciseDetail.module.css';

interface TeachingProps {
  exercise: CatalogExercise;
  /** The lifter's own setup, steps and cues for the lift, from its Notes. */
  own?: Pick<CustomInstruction, 'setup' | 'execution' | 'cues'>;
}

/**
 * How to do an exercise, for someone who has never done it (Maintenance 25, item 7): the setup,
 * the movement in a few steps, the cues that matter most, the mistakes to avoid, and how far to go
 * when that matters. The demonstration above it shows the same; this is the text to read between
 * sets. The lifter's own setup and steps, where they wrote them, stand in for the catalog's, and
 * their own cues follow the catalog's.
 */
export function ExerciseTeaching({ exercise, own }: TeachingProps) {
  const { cues, mistakes, range } = exercise.instructions;
  const setup = own?.setup.length ? own.setup : exercise.instructions.setup;
  const execution = own?.execution.length ? own.execution : exercise.instructions.execution;
  const ownCues = own?.cues ?? [];
  const id = (part: string) => `howto-${exercise.id}-${part}`;
  return (
    <div className={styles.teaching} data-testid="how-to-text">
      <section className={styles.section} aria-labelledby={id('setup')}>
        <h3 className={styles.sectionTitle} id={id('setup')}>
          Setup
        </h3>
        <ul className={styles.list}>
          {keyedLines(setup).map(({ key, line }) => (
            <li key={key}>{line}</li>
          ))}
        </ul>
      </section>
      <section className={styles.section} aria-labelledby={id('steps')}>
        <h3 className={styles.sectionTitle} id={id('steps')}>
          Do it
        </h3>
        <ol className={styles.steps}>
          {keyedLines(execution).map(({ key, line }) => (
            <li key={key}>{line}</li>
          ))}
        </ol>
      </section>
      {cues.length > 0 ? (
        <section className={styles.section} aria-labelledby={id('cues')}>
          <h3 className={styles.sectionTitle} id={id('cues')}>
            Key cues
          </h3>
          <ul className={styles.list}>
            {keyedLines(cues).map(({ key, line }) => (
              <li key={key}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className={styles.section} aria-labelledby={id('avoid')}>
        <h3 className={styles.sectionTitle} id={id('avoid')}>
          Avoid
        </h3>
        <ul className={`${styles.list} ${styles.avoid}`}>
          {keyedLines(mistakes).map(({ key, line }) => (
            <li key={key}>{line}</li>
          ))}
        </ul>
      </section>
      {range ? (
        <section className={styles.section} aria-labelledby={id('range')}>
          <h3 className={styles.sectionTitle} id={id('range')}>
            How far
          </h3>
          <p className={styles.text}>{range}</p>
        </section>
      ) : null}
      {ownCues.length > 0 ? (
        <section className={styles.section} aria-labelledby={id('own')}>
          <h3 className={styles.sectionTitle} id={id('own')}>
            Your cues
          </h3>
          <ul className={styles.list}>
            {keyedLines(ownCues).map(({ key, line }) => (
              <li key={key}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
