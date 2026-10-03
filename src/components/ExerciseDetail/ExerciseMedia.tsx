import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import {
  creditLine,
  diagramFor,
  isVideoAsset,
  mediaFor,
  mediaUrl,
  type MediaAsset,
} from '../../catalog/media/mediaManifest';
import type { CustomMedia } from '../../core/validation/customExercise';
import { isAnimatedImage, useFirstFrame } from './animatedImage';
import styles from './ExerciseDetail.module.css';
import { useDemoVideo } from './useDemoVideo';
import { useReducedMotion } from './useReducedMotion';

interface StillProps {
  asset: MediaAsset;
  exercise: CatalogExercise;
  className: string | undefined;
  alt: string;
  width: number;
  height: number;
  lazy?: boolean;
  testId: string;
  /** Told when the diagram stands in for a still that could not load. */
  onDiagram?: () => void;
}

/**
 * A still of the exercise: the demonstration's own first frame, or the diagram of its movement
 * when that cannot load (Maintenance 25, item 7: a file missing from the cache offline).
 */
function Still({
  asset,
  exercise,
  className,
  alt,
  width,
  height,
  lazy = false,
  testId,
  onDiagram,
}: StillProps) {
  const [broken, setBroken] = useState(false);
  const fallback = diagramFor(exercise);
  const src = broken ? fallback.poster : asset.poster;
  return (
    <img
      className={className}
      src={mediaUrl(src)}
      alt={alt}
      width={width}
      height={height}
      loading={lazy ? 'lazy' : undefined}
      decoding="async"
      onError={() => {
        if (asset.poster !== fallback.poster && !broken) {
          setBroken(true);
          onDiagram?.();
        }
      }}
      data-testid={testId}
      data-still={broken ? 'diagram' : 'poster'}
      data-animated="false"
      data-custom="false"
    />
  );
}

interface ThumbProps {
  exercise: CatalogExercise;
  /** Large is the exercise card's demonstration; small is for list rows. */
  size?: 'small' | 'large';
  /** The user's own demonstration, shown instead of the catalog's when present. */
  customMedia?: CustomMedia | null;
  /**
   * Whether a large thumbnail's clip plays. Only the exercise under way plays on the workout
   * screen; the rest show their still, so a session never downloads every clip at once.
   */
  play?: boolean;
}

/** How long the card's demonstration moves before it rests on its still: WCAG 2.2.2 (Level A). */
export const THUMB_MOTION_MS = 5000;

/**
 * Compact demonstration for rows and cards. The large size plays the same loop as the How-to
 * view (or the user's own GIF or video) for five seconds, then rests on its still: motion that
 * goes on longer needs a way to stop it, and How to, a tap away, has one (the ninth review). An
 * own GIF rests on its first frame (the tenth review). Small rows and reduced-motion users get the
 * still so lists stay calm and fast. A clip that cannot load leaves its still in place.
 */
export function ExerciseThumb({
  exercise,
  size = 'small',
  customMedia = null,
  play = true,
}: ThumbProps) {
  const asset = mediaFor(exercise);
  const reducedMotion = useReducedMotion();
  const large = size === 'large';
  const className = large ? `${styles.thumb} ${styles.thumbLarge}` : styles.thumb;
  const width = large ? 96 : 72;
  const height = large ? 72 : 54;
  // The exercise whose motion has run its five seconds; another exercise starts again.
  const [restedFor, setRestedFor] = useState<string | null>(null);
  const moving = large && !reducedMotion && play;
  useEffect(() => {
    if (!moving) return undefined;
    const timer = window.setTimeout(() => setRestedFor(exercise.id), THUMB_MOTION_MS);
    return () => window.clearTimeout(timer);
  }, [moving, exercise.id]);
  const animated = moving && restedFor !== exercise.id;
  const clip = !customMedia && animated && isVideoAsset(asset);
  const video = useDemoVideo(clip ? mediaUrl(asset.demo) : null);
  // The lifter's own image: a GIF that moves rests on its first frame, as the clips rest.
  const ownImage = large && customMedia?.kind === 'image' ? customMedia.dataUrl : null;
  const ownMoves = useMemo(() => (ownImage ? isAnimatedImage(ownImage) : false), [ownImage]);
  const ownStill = useFirstFrame(ownMoves ? ownImage : null, !animated);

  if (customMedia && large) {
    if (customMedia.kind === 'video') {
      return (
        <video
          // A new element when the motion rests, so the pause is the element's own state.
          key={animated ? 'moving' : 'resting'}
          className={className}
          src={customMedia.dataUrl}
          width={width}
          height={height}
          autoPlay={animated}
          loop={animated}
          muted
          playsInline
          data-testid="exercise-thumb"
          data-custom="true"
          data-animated={animated ? 'true' : 'false'}
        />
      );
    }
    const moving = ownMoves && animated;
    const src = ownMoves && !moving ? ownStill : customMedia.dataUrl;
    if (!src) {
      // Its first frame is still being made: an empty frame meanwhile, never the motion.
      return (
        <span
          className={`${className} ${styles.thumbBlank}`}
          data-testid="exercise-thumb"
          data-custom="true"
          data-animated="false"
        />
      );
    }
    return (
      <img
        className={className}
        src={src}
        alt=""
        width={width}
        height={height}
        decoding="async"
        data-testid="exercise-thumb"
        data-custom="true"
        data-animated={moving ? 'true' : 'false'}
      />
    );
  }

  if (clip && video.src) {
    return (
      <video
        className={className}
        src={video.src}
        poster={mediaUrl(asset.poster)}
        width={width}
        height={height}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        data-testid="exercise-thumb"
        data-custom="false"
        data-animated="true"
      />
    );
  }
  if (animated && !isVideoAsset(asset)) {
    return (
      <img
        className={className}
        src={mediaUrl(asset.demo)}
        alt=""
        width={width}
        height={height}
        decoding="async"
        data-testid="exercise-thumb"
        data-custom="false"
        data-animated="true"
      />
    );
  }
  return (
    <Still
      asset={asset}
      exercise={exercise}
      className={className}
      alt=""
      width={width}
      height={height}
      lazy={!large}
      testId="exercise-thumb"
    />
  );
}

/** Who made a demonstration, where it came from, its licence and what was changed. */
export function MediaCreditDetails({ asset }: { asset: MediaAsset }) {
  const credit = asset.credit;
  if (!credit) return null;
  return (
    <details className={styles.creditDetails} data-testid="media-credit">
      <summary className={styles.creditSummary}>
        About this {asset.form === 'drawings' ? 'drawing' : 'video'}
      </summary>
      <p className={styles.creditText}>
        “{credit.title}” by {credit.author}.{' '}
        {credit.licenseUrl ? (
          <a href={credit.licenseUrl} target="_blank" rel="noreferrer">
            {credit.license}
          </a>
        ) : (
          credit.license
        )}
        .{' '}
        <a href={credit.sourceUrl} target="_blank" rel="noreferrer">
          Original
        </a>
        . {credit.changes}
      </p>
    </details>
  );
}

interface DemoProps {
  exercise: CatalogExercise;
  /** The user's own demonstration, shown instead of the catalog's when present. */
  customMedia?: CustomMedia | null;
  /** When given, tapping the demonstration (or its button) picks a GIF, photo, or video. */
  onPickFile?: (file: File) => void;
  /** When given with custom media, offers to remove the user's demonstration. */
  onRemove?: () => void;
  busy?: boolean;
}

/**
 * The demonstration, large enough to learn from (Maintenance 25, item 7): the exercise's own clip,
 * looping without sound, which can be paused or slowed to half speed to watch the path.
 * Reduced-motion users get the still and a Play button. While the clip loads, and when it cannot
 * (offline before it was ever kept), the still stands in and says so, with Try again. Where the
 * source asks for it, its credit and notice sit under it. The user's own GIF, photo or video
 * replaces it when they picked one; an exercise with no licensed demonstration keeps its movement
 * pattern's diagram. Whatever moves here can be paused, and starts paused under reduced motion
 * (the tenth review: the diagram and the lifter's own GIF or video could not be stopped).
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
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [slow, setSlow] = useState(false);
  // The diagram stands in for a still that could not load: the credit is not for it.
  const [diagram, setDiagram] = useState(false);
  // Play was pressed, or its button holds the focus: the focus moves to Pause once the clip is up
  // (the ninth review; a retry made on its own, back online, too: the tenth review's re-check).
  const focusPause = useRef(false);
  const playFocused = useRef(false);
  // The diagram's loop and the lifter's own GIF or video: paused or played by hand, else moving
  // unless reduced motion asks for stillness.
  const [held, setHeld] = useState<boolean | null>(null);
  const moving = held === null ? !reducedMotion : !held;
  const ownVideoRef = useRef<HTMLVideoElement>(null);
  const ownImage = customMedia?.kind === 'image' ? customMedia.dataUrl : null;
  const ownMoves = useMemo(() => (ownImage ? isAnimatedImage(ownImage) : false), [ownImage]);
  const ownStill = useFirstFrame(ownMoves ? ownImage : null, !moving);
  // The lifter's own video follows the button.
  const ownVideo = customMedia?.kind === 'video';
  useEffect(() => {
    const element = ownVideoRef.current;
    if (!ownVideo || !element) return;
    if (moving) void element.play().catch(() => setHeld(true));
    else element.pause();
  }, [moving, ownVideo]);
  const canPick = typeof onPickFile === 'function';
  const pickLabel = customMedia
    ? 'Replace your demonstration'
    : 'Use your own GIF, photo, or video';
  const clip = isVideoAsset(asset) && !customMedia;
  const wantsClip = clip && (!reducedMotion || started);
  const video = useDemoVideo(wantsClip ? mediaUrl(asset.demo) : null);

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

  const motionButton = (
    <span className={styles.demoOverlay}>
      <button
        type="button"
        className={styles.overlayButton}
        onClick={() => setHeld(moving)}
        data-testid="demo-pause"
      >
        {moving ? 'Pause' : 'Play'}
      </button>
    </span>
  );

  if (customMedia) {
    const ownAlt = `${exercise.name}, your demonstration`;
    const ownImageSrc = ownMoves && !moving ? ownStill : customMedia.dataUrl;
    return (
      <figure className={styles.demo} data-testid="custom-media">
        <div className={styles.demoFrame}>
          {customMedia.kind === 'video'
            ? wrap(
                <video
                  ref={ownVideoRef}
                  className={styles.demoImage}
                  src={customMedia.dataUrl}
                  autoPlay={moving}
                  loop
                  muted
                  playsInline
                  aria-label={ownAlt}
                  data-testid="custom-demo"
                  data-playing={moving ? 'true' : 'false'}
                />,
              )
            : wrap(
                ownImageSrc ? (
                  <img
                    className={styles.demoImage}
                    src={ownImageSrc}
                    alt={ownAlt}
                    width={320}
                    height={240}
                    data-testid="custom-demo"
                    data-playing={ownMoves && moving ? 'true' : 'false'}
                  />
                ) : (
                  // Its first frame is still being made: an empty frame meanwhile.
                  <span
                    className={`${styles.demoImage} ${styles.demoBlank}`}
                    role="img"
                    aria-label={ownAlt}
                    data-testid="custom-demo"
                    data-playing="false"
                  />
                ),
              )}
          {ownVideo || ownMoves ? motionButton : null}
        </div>
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

  const alt = `${exercise.name} demonstration`;
  const shape =
    asset.width && asset.height ? { aspectRatio: `${asset.width} / ${asset.height}` } : undefined;
  // The button follows what it last asked for; a play the browser refuses shows Play again.
  const togglePause = () => {
    const element = videoRef.current;
    if (!element) return;
    if (paused) {
      setPaused(false);
      void element.play().catch(() => setPaused(true));
    } else {
      element.pause();
      setPaused(true);
    }
  };
  const toggleSlow = () => {
    const next = !slow;
    setSlow(next);
    if (videoRef.current) videoRef.current.playbackRate = next ? 0.5 : 1;
  };

  let stage: ReactNode;
  let status: string | null = null;
  if (clip && video.src) {
    stage = (
      <div className={styles.demoStage} style={shape}>
        <video
          ref={videoRef}
          className={styles.demoVideo}
          src={video.src}
          poster={mediaUrl(asset.poster)}
          autoPlay
          loop
          muted
          playsInline
          aria-label={alt}
          onLoadedMetadata={(event) => {
            const element = event.currentTarget;
            element.playbackRate = slow ? 0.5 : 1;
            // Autoplay can be refused (a data saver): the button then offers Play.
            if (!paused) void element.play().catch(() => setPaused(true));
          }}
          onClick={togglePause}
          data-testid="exercise-demo"
          data-playing={paused ? 'false' : 'true'}
        />
        <span className={styles.demoOverlay}>
          <button
            type="button"
            className={styles.overlayButton}
            aria-pressed={slow}
            onClick={toggleSlow}
            data-testid="demo-slow"
          >
            Slow
          </button>
          <button
            ref={(node) => {
              if (node && (focusPause.current || playFocused.current)) {
                focusPause.current = false;
                playFocused.current = false;
                // Without scrolling: the lifter may be reading further down the sheet.
                node.focus({ preventScroll: true });
              }
            }}
            type="button"
            className={styles.overlayButton}
            onClick={togglePause}
            data-testid="demo-pause"
          >
            {paused ? 'Play' : 'Pause'}
          </button>
        </span>
      </div>
    );
  } else if (clip) {
    // The still stands in: before the clip arrives, when it cannot, or until a reduced-motion
    // user asks for it.
    stage = (
      <div className={styles.demoStage} style={shape}>
        <Still
          asset={asset}
          exercise={exercise}
          className={styles.demoVideo}
          alt={alt}
          width={asset.width ?? 480}
          height={asset.height ?? 360}
          testId="exercise-demo"
          onDiagram={() => setDiagram(true)}
        />
        {reducedMotion || video.failed || video.retrying ? (
          <span className={styles.demoOverlay}>
            {/* One button throughout: Play, Loading…, and Try again when the clip cannot load,
                so focus stays on it until Pause takes it (the tenth review). */}
            <button
              type="button"
              className={styles.overlayButton}
              aria-disabled={!video.failed && (started || video.retrying)}
              onFocus={() => {
                playFocused.current = true;
              }}
              onBlur={() => {
                // Moved on: the clip no longer takes the focus when it comes (the second re-check).
                playFocused.current = false;
                focusPause.current = false;
              }}
              onClick={(event) => {
                // Only a press from the focused button hands the focus on: Safari, and Firefox
                // on a Mac, press a button without focusing it, and then no blur ever cancels
                // the hand-over (the tenth review's third re-check).
                const held = document.activeElement === event.currentTarget;
                if (video.failed) {
                  focusPause.current = held;
                  video.retry();
                  return;
                }
                if (started || video.retrying) return;
                focusPause.current = held;
                setStarted(true);
              }}
              data-testid="demo-play"
            >
              {video.failed ? 'Try again' : started || video.retrying ? 'Loading…' : 'Play'}
            </button>
          </span>
        ) : null}
      </div>
    );
    // Offline is one reason a clip does not come; a missing or broken file is another.
    const why =
      typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'the video plays here once you are online.'
        : 'the video could not load.';
    if (video.failed) status = diagram ? `Shown as a diagram: ${why}` : `Shown as a still: ${why}`;
    else if (wantsClip) status = 'Loading the video…';
  } else {
    // The diagram's loop, which can be paused on its still.
    const loops = asset.demo !== asset.poster;
    const playing = loops && moving;
    stage = (
      <div className={styles.demoFrame}>
        {wrap(
          <img
            className={styles.demoImage}
            src={mediaUrl(playing ? asset.demo : asset.poster)}
            alt={alt}
            width={320}
            height={240}
            decoding="async"
            data-testid="exercise-demo"
            data-playing={playing ? 'true' : 'false'}
          />,
        )}
        {loops ? motionButton : null}
      </div>
    );
  }

  // Under the diagram that stood in, the demonstration's credit, note and notice are not shown.
  const own = !diagram;
  const credit = own ? creditLine(asset) : null;
  return (
    <figure className={styles.demo}>
      {stage}
      {status ? (
        <p className={styles.demoStatus} role="status" data-testid="demo-status">
          {status}
        </p>
      ) : null}
      <figcaption className={styles.demoBar}>
        <span className={styles.demoLabel} data-testid="demo-credit">
          {credit ?? (canPick ? 'Diagram · tap it to use your own GIF' : 'Diagram of the movement')}
        </span>
        {canPick ? (
          <span className={styles.demoControls}>
            <button
              type="button"
              className={`${styles.demoButton} ${styles.demoButtonAccent}`}
              onClick={openPicker}
              disabled={busy}
            >
              Your GIF
            </button>
          </span>
        ) : null}
      </figcaption>
      {own && asset.note ? (
        <p className={styles.demoNote} data-testid="demo-note">
          {asset.note}
        </p>
      ) : null}
      {own && asset.credit?.notice ? (
        <p className={styles.demoNotice} data-testid="demo-notice">
          {asset.credit.notice}
        </p>
      ) : null}
      {own ? <MediaCreditDetails asset={asset} /> : null}
      {picker}
    </figure>
  );
}
