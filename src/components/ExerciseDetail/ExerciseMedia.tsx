import { useRef, useState, type ReactNode } from 'react';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import { mediaFor, mediaUrl } from '../../catalog/media/mediaManifest';
import type { CustomMedia } from '../../core/validation/customExercise';
import styles from './ExerciseDetail.module.css';
import { useReducedMotion } from './useReducedMotion';

interface ThumbProps {
  exercise: CatalogExercise;
  /** Large is the exercise card's demonstration; small is for list rows. */
  size?: 'small' | 'large';
  /** The user's own demonstration, shown instead of the placeholder when present. */
  customMedia?: CustomMedia | null;
}

/**
 * Compact demonstration for rows and cards. The large size plays the same
 * loop as the detail view (or the user's own GIF or video); small rows and
 * reduced-motion users get the still poster so lists stay calm and fast.
 */
export function ExerciseThumb({ exercise, size = 'small', customMedia = null }: ThumbProps) {
  const asset = mediaFor(exercise);
  const reducedMotion = useReducedMotion();
  const large = size === 'large';
  const className = large ? `${styles.thumb} ${styles.thumbLarge}` : styles.thumb;
  const width = large ? 96 : 72;
  const height = large ? 72 : 54;

  if (customMedia && large) {
    if (customMedia.kind === 'video') {
      return (
        <video
          className={className}
          src={customMedia.dataUrl}
          width={width}
          height={height}
          autoPlay={!reducedMotion}
          loop
          muted
          playsInline
          data-testid="exercise-thumb"
          data-custom="true"
          data-animated={reducedMotion ? 'false' : 'true'}
        />
      );
    }
    return (
      <img
        className={className}
        src={customMedia.dataUrl}
        alt=""
        width={width}
        height={height}
        decoding="async"
        data-testid="exercise-thumb"
        data-custom="true"
        data-animated="true"
      />
    );
  }

  const animated = large && !reducedMotion;
  return (
    <img
      className={className}
      src={mediaUrl(animated ? asset.demo : asset.poster)}
      alt=""
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      data-testid="exercise-thumb"
      data-custom="false"
      data-animated={animated ? 'true' : 'false'}
    />
  );
}

interface DemoProps {
  exercise: CatalogExercise;
  /** The user's own demonstration, shown instead of the placeholder when present. */
  customMedia?: CustomMedia | null;
  /** When given, tapping the demonstration (or its button) picks a GIF, photo, or video. */
  onPickFile?: (file: File) => void;
  /** When given with custom media, offers to remove the user's demonstration. */
  onRemove?: () => void;
  busy?: boolean;
}

/**
 * Looping demonstration with Play/Pause and Replay. Reduced-motion users get
 * the poster until they press Play. Placeholder assets say so on the image.
 * With `onPickFile`, the image itself is a button that opens the file picker.
 */
export function ExerciseDemo({
  exercise,
  customMedia = null,
  onPickFile,
  onRemove,
  busy = false,
}: DemoProps) {
  const asset = mediaFor(exercise);
  const reducedMotion = useReducedMotion();
  const [playing, setPlaying] = useState<boolean | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const isPlaying = playing ?? !reducedMotion;
  const canPick = typeof onPickFile === 'function';
  const pickLabel = customMedia
    ? 'Replace your demonstration'
    : 'Use your own GIF, photo, or video';

  const openPicker = () => inputRef.current?.click();
  const picker = canPick ? (
    <input
      ref={inputRef}
      className={styles.demoInput}
      type="file"
      accept="image/gif,image/*,video/*"
      aria-label={pickLabel}
      data-testid="demo-file-input"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) onPickFile(file);
      }}
    />
  ) : null;
  const wrap = (image: ReactNode) =>
    canPick ? (
      <button
        type="button"
        className={styles.demoPick}
        onClick={openPicker}
        disabled={busy}
        aria-label={pickLabel}
        data-testid="demo-pick"
      >
        {image}
      </button>
    ) : (
      image
    );

  if (customMedia) {
    return (
      <figure className={styles.demo} data-testid="custom-media">
        {customMedia.kind === 'video'
          ? wrap(
              <video
                className={styles.demoImage}
                src={customMedia.dataUrl}
                autoPlay={!reducedMotion}
                loop
                muted
                playsInline
                controls={!canPick}
              />,
            )
          : wrap(
              <img
                className={styles.demoImage}
                src={customMedia.dataUrl}
                alt={`${exercise.name}, your demonstration`}
                width={320}
                height={240}
              />,
            )}
        <figcaption className={styles.demoBar}>
          <span className={styles.demoLabel}>Your demonstration · stays on this device</span>
          {canPick ? (
            <span className={styles.demoControls}>
              <button
                type="button"
                className={styles.demoButton}
                onClick={openPicker}
                disabled={busy}
              >
                Replace
              </button>
              {onRemove ? (
                <button
                  type="button"
                  className={styles.demoButton}
                  onClick={onRemove}
                  disabled={busy}
                >
                  Remove
                </button>
              ) : null}
            </span>
          ) : null}
        </figcaption>
        {picker}
      </figure>
    );
  }

  return (
    <figure className={styles.demo}>
      {wrap(
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
        />,
      )}
      <figcaption className={styles.demoBar}>
        <span className={styles.demoLabel}>
          {asset.kind === 'placeholder-diagram'
            ? canPick
              ? 'Placeholder · tap it to use your own GIF'
              : 'Placeholder diagram · original'
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
          {canPick ? (
            <button
              type="button"
              className={`${styles.demoButton} ${styles.demoButtonAccent}`}
              onClick={openPicker}
              disabled={busy}
            >
              Your GIF
            </button>
          ) : null}
        </span>
      </figcaption>
      {picker}
    </figure>
  );
}
