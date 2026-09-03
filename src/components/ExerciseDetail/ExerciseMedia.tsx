import { useState } from 'react';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import { mediaFor, mediaUrl } from '../../catalog/media/mediaManifest';
import styles from './ExerciseDetail.module.css';
import { useReducedMotion } from './useReducedMotion';

interface ThumbProps {
  exercise: CatalogExercise;
}

/** Compact poster for exercise rows; lazy so lists stay fast. */
export function ExerciseThumb({ exercise }: ThumbProps) {
  const asset = mediaFor(exercise);
  return (
    <img
      className={styles.thumb}
      src={mediaUrl(asset.poster)}
      alt=""
      width={72}
      height={54}
      loading="lazy"
      decoding="async"
      data-testid="exercise-thumb"
    />
  );
}

interface DemoProps {
  exercise: CatalogExercise;
}

/**
 * Looping demonstration with Play/Pause and Replay. Reduced-motion users get
 * the poster until they press Play. Placeholder assets say so on the image.
 */
export function ExerciseDemo({ exercise }: DemoProps) {
  const asset = mediaFor(exercise);
  const reducedMotion = useReducedMotion();
  const [playing, setPlaying] = useState<boolean | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const isPlaying = playing ?? !reducedMotion;

  return (
    <figure className={styles.demo}>
      <img
        key={replayKey}
        className={styles.demoImage}
        src={mediaUrl(isPlaying ? asset.demo : asset.poster)}
        alt={`${exercise.name} demonstration`}
        width={320}
        height={240}
        decoding="async"
        data-testid="exercise-demo"
        data-playing={isPlaying ? 'true' : 'false'}
      />
      <figcaption className={styles.demoBar}>
        <span className={styles.demoLabel}>
          {asset.kind === 'placeholder-diagram'
            ? 'Placeholder diagram · original'
            : 'Demonstration'}
        </span>
        <span className={styles.demoControls}>
          <button
            type="button"
            className={styles.demoButton}
            onClick={() => setPlaying(!isPlaying)}
            aria-pressed={isPlaying}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            className={styles.demoButton}
            onClick={() => {
              setPlaying(true);
              setReplayKey((key) => key + 1);
            }}
          >
            Replay
          </button>
        </span>
      </figcaption>
    </figure>
  );
}
