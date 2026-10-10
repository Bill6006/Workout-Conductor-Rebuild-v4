import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
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
import { useAnySheetOpen } from '../Sheet/openSheets';
import { isAnimatedImage, loopingImage, useFirstFrame } from './animatedImage';
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

/**
 * Whether a play() that failed was refused (a data or battery saver, a source it cannot play), and
 * not merely cut short by a pause made meanwhile (an AbortError, the clip rested out of view): How
 * to offers Play only for a refusal (the re-check of the phone review).
 */
function refused(error: unknown): boolean {
  return !(error instanceof DOMException && error.name === 'AbortError');
}

/** The next frame, or a moment later where a document draws none. */
function nextFrame(callback: () => void): number {
  return typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(callback, 16);
}

function cancelFrame(handle: number): void {
  if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(handle);
  else window.clearTimeout(handle);
}

/**
 * Plays a looping clip while it is wanted, on a page in front, and in view (Maintenance 25, the
 * phone review). Once a script has played a clip, the browser no longer pauses it out of view by
 * itself, so this does both: it pauses the clip in the background, out of view, or when it is not
 * wanted (a sheet over the card, a play refused), and plays it on once it is back, instead of
 * leaving it on the frame it stopped at; a page the browser froze included. It is the only thing
 * that starts the clip (no autoplay, no play as it loads): a clip that arrives under an open sheet,
 * out of view or on a page in the background stays still (the re-checks of the phone review). A
 * play the browser refuses (a data or battery saver) is told to onRefused (How to then offers
 * Play), never one cut short by a pause; so is a pause none of this asked for, made while the clip
 * is wanted, in view and in front (a saver stopping it as it played): with no Pause, a clip stopped
 * that way would otherwise stay still with nothing to start it (the review of item 50).
 */
function useKeepPlaying(
  ref: RefObject<HTMLVideoElement | null>,
  mounted: boolean,
  wanted: boolean,
  source: string | null,
  onRefused?: () => void,
): void {
  useEffect(() => {
    const element = ref.current;
    if (!mounted || !element) return undefined;
    // In view until the observer says otherwise.
    let inView = true;
    const settle = () => {
      if (wanted && inView && document.visibilityState !== 'hidden') {
        // Older browsers answer play() with nothing at all, not a promise.
        if (element.paused) {
          (element.play() as Promise<void> | undefined)?.catch((error: unknown) => {
            if (refused(error)) onRefused?.();
          });
        }
      } else if (!element.paused) {
        element.pause();
      }
    };
    const observer =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
            const latest = entries[entries.length - 1];
            if (!latest) return;
            inView = latest.isIntersecting;
            settle();
          })
        : null;
    // The event comes after the pause: one made here is told apart by the state then (no longer
    // wanted, out of view, in the background), one undone since by a play by `paused`, and one
    // made as the clip left the page by `isConnected`. One the browser makes as the page hides can
    // come before the page reads hidden: it is judged again a frame later, and no frame comes
    // while the page is hidden; by then the browser has played it on (the re-check of item 50).
    const stopping = () =>
      wanted &&
      inView &&
      element.paused &&
      element.isConnected &&
      document.visibilityState !== 'hidden';
    let frame: number | null = null;
    const stopped = () => {
      if (!stopping() || frame !== null) return;
      frame = nextFrame(() => {
        frame = null;
        if (stopping()) onRefused?.();
      });
    };
    observer?.observe(element);
    element.addEventListener('pause', stopped);
    document.addEventListener('visibilitychange', settle);
    document.addEventListener('resume', settle);
    window.addEventListener('pageshow', settle);
    settle();
    return () => {
      if (frame !== null) cancelFrame(frame);
      observer?.disconnect();
      element.removeEventListener('pause', stopped);
      document.removeEventListener('visibilitychange', settle);
      document.removeEventListener('resume', settle);
      window.removeEventListener('pageshow', settle);
    };
  }, [ref, mounted, wanted, source, onRefused]);
}

/**
 * Compact demonstration for rows and cards. The large size, on the card of the exercise under
 * way, loops the same clip as How to (or the user's own GIF or video) for as long as that card is
 * in front, and plays on when the page or the card comes back into view (the phone review: it
 * rested after five seconds and stayed still). Its clip, or the lifter's own video, rests where it
 * is under a sheet (a diagram's loop or an own GIF, which are pictures, keep moving), and it shows
 * its still under reduced motion: the owner asked for no Pause on any demonstration (Maintenance
 * 26, item 50), so the phone's own setting is the way to keep them still. Small rows get the still
 * so lists stay calm and fast. A clip that cannot load leaves its still in place.
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
  // Only a card that may move follows the sheets: a list's rows never render again for one.
  const sheetOpen = useAnySheetOpen(large && play);
  const className = large ? `${styles.thumb} ${styles.thumbLarge}` : styles.thumb;
  const width = large ? 96 : 72;
  const height = large ? 72 : 54;
  const animated = large && !reducedMotion && play;
  const clip = !customMedia && animated && isVideoAsset(asset);
  const video = useDemoVideo(clip ? mediaUrl(asset.demo) : null);
  const clipRef = useRef<HTMLVideoElement>(null);
  const ownVideoRef = useRef<HTMLVideoElement>(null);
  // Under a sheet the card's clip rests where it is: the card and the sheet never play at once.
  useKeepPlaying(clipRef, clip && video.src !== null, !sheetOpen, video.src);
  useKeepPlaying(
    ownVideoRef,
    large && customMedia?.kind === 'video',
    animated && !sheetOpen,
    customMedia?.kind === 'video'
      ? `${customMedia.id}|${customMedia.createdAt}|${customMedia.sizeBytes}`
      : null,
  );
  // The lifter's own image: a GIF that moves loops for good, whatever its file says (the phone
  // review), and rests on its first frame when the card is still.
  const ownImage = large && customMedia?.kind === 'image' ? customMedia.dataUrl : null;
  const ownMoves = useMemo(() => (ownImage ? isAnimatedImage(ownImage) : false), [ownImage]);
  const ownLooping = useMemo(
    () => (ownImage && ownMoves ? loopingImage(ownImage) : ownImage),
    [ownImage, ownMoves],
  );
  const ownStill = useFirstFrame(ownMoves ? ownImage : null, !animated);

  if (customMedia && large) {
    if (customMedia.kind === 'video') {
      return (
        <video
          // A new element when the motion rests, so the pause is the element's own state.
          key={animated ? 'moving' : 'resting'}
          ref={ownVideoRef}
          className={className}
          src={customMedia.dataUrl}
          width={width}
          height={height}
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
    const src = ownMoves && !moving ? ownStill : (ownLooping ?? customMedia.dataUrl);
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
        ref={clipRef}
        className={className}
        src={video.src}
        poster={mediaUrl(asset.poster)}
        width={width}
        height={height}
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
  /**
   * When given with custom media, offers to remove the user's demonstration; a promise of whether
   * it was removed lets a failed removal give the focus back to Remove.
   */
  onRemove?: () => void | Promise<boolean>;
  busy?: boolean;
}

/**
 * The demonstration, large enough to learn from (Maintenance 25, item 7): the exercise's own clip,
 * looping without sound, which can be slowed to half speed to watch the path. It has no Pause: the
 * owner asked for none on any demonstration (Maintenance 26, item 50). Under reduced motion it
 * starts still, with a Play that shows the motion when asked; a play the browser refuses or stops
 * (a data or battery saver) offers Play too. While the clip loads, and when it cannot (offline
 * before it was ever kept), the still stands in and says so, with Try again. Where the source asks
 * for it, its credit and notice sit under it. The user's own GIF, photo or video replaces it when
 * they picked one; given a picker (How to, and the details), a tap on the demonstration or on its
 * button picks one (item 50). An exercise with no licensed demonstration keeps its movement
 * pattern's diagram.
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
  // A play of the clip the browser refused or stopped: Play stands in for it until it plays.
  const [clipStill, setClipStill] = useState(false);
  const [slow, setSlow] = useState(false);
  // The diagram stands in for a still that could not load: the credit is not for it. A picture of
  // the lifter's own ends it: once that is removed, the still is tried again (the third pass of
  // item 50: the still loaded under the diagram's label, its credit missing).
  const [diagram, setDiagram] = useState(false);
  if (customMedia && diagram) setDiagram(false);
  // Play was pressed, or its button holds the focus: the focus moves on to Slow once the clip is up
  // (the ninth review; a retry made on its own, back online, too: the tenth review's re-check).
  const focusSlow = useRef(false);
  const playFocused = useRef(false);
  // Play over a picture leaves with the press: the focus moves to the picture's frame, never to
  // the page, nor to the picker a second Enter would open (the review of item 50 and its
  // re-check).
  const focusPicture = useRef(false);
  // The lifter's own media, by what it is: a refusal and a Play belong to the one they were for.
  const ownKey = customMedia
    ? `${customMedia.id}|${customMedia.createdAt}|${customMedia.sizeBytes}`
    : null;
  // The diagram's loop and the lifter's own GIF or video move unless reduced motion asks for
  // stillness and Play has not been pressed for that one (the re-check of item 50: a Play pressed
  // on one GIF moved the next one picked).
  const [askedFor, setAskedFor] = useState<string | null>(null);
  const motionKey = ownKey ?? 'catalog';
  const moving = !reducedMotion || askedFor === motionKey;
  const ownVideoRef = useRef<HTMLVideoElement>(null);
  const ownImage = customMedia?.kind === 'image' ? customMedia.dataUrl : null;
  const ownMoves = useMemo(() => (ownImage ? isAnimatedImage(ownImage) : false), [ownImage]);
  // A GIF of their own loops for good here too, whatever its file says (the phone review).
  const ownLooping = useMemo(
    () => (ownImage && ownMoves ? loopingImage(ownImage) : ownImage),
    [ownImage, ownMoves],
  );
  const ownStill = useFirstFrame(ownMoves ? ownImage : null, !moving);
  const ownVideo = customMedia?.kind === 'video';
  // A play of the lifter's own video the browser refused or stopped, for that video only: another
  // picked in its place, or a picture, is not held by it (the review of item 50).
  const [ownRefusedFor, setOwnRefusedFor] = useState<string | null>(null);
  const ownVideoMoving = moving && !(ownVideo && ownRefusedFor === ownKey);
  const ownRefused = useCallback(() => setOwnRefusedFor(ownKey), [ownKey]);
  const clipRefused = useCallback(() => setClipStill(true), []);
  const canPick = typeof onPickFile === 'function';
  const pickLabel = customMedia
    ? 'Replace your demonstration'
    : 'Use your own GIF, photo, or video';
  const clip = isVideoAsset(asset) && !customMedia;
  const wantsClip = clip && (!reducedMotion || started);
  const video = useDemoVideo(wantsClip ? mediaUrl(asset.demo) : null);
  // Started, played on where the browser paused them (a page frozen in the background), and rested
  // out of view, as the card's clip is (the reviews of the phone review).
  useKeepPlaying(videoRef, clip && video.src !== null, !clipStill, video.src, clipRefused);
  useKeepPlaying(
    ownVideoRef,
    ownVideo,
    ownVideoMoving,
    ownVideo ? customMedia.dataUrl : null,
    ownRefused,
  );

  const takeFocus = (node: HTMLElement | null) => {
    if (node && focusPicture.current) {
      focusPicture.current = false;
      node.focus({ preventScroll: true });
    }
  };
  // A pick or a removal made from a focused control gives the focus back once it is saved: the
  // controls are disabled while it saves, and the focus fell to the page (the re-check of item
  // 50). Only a focus the page holds is taken back, never one the lifter moved meanwhile.
  const pickRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const giveBack = useRef<'pick' | 'bar' | 'remove' | null>(null);
  const saving = useRef(false);
  useEffect(() => {
    if (busy) {
      saving.current = true;
      return;
    }
    if (!saving.current) return;
    saving.current = false;
    const target = giveBack.current;
    giveBack.current = null;
    const at = document.activeElement;
    const lost = at === null || at === document.body;
    // A removal that failed: back to Remove, enabled again now, from Replace where it waited; to
    // the bar when the picture went all the same (the sixth pass: the focus fell to the page).
    if (target === 'remove') {
      if (lost || at === barRef.current) {
        (removeRef.current ?? barRef.current)?.focus({ preventScroll: true });
      }
      return;
    }
    if (target && lost)
      (target === 'pick' ? pickRef : barRef).current?.focus({ preventScroll: true });
  }, [busy]);
  // Called from the click itself: a ref is read in the event, never in render (the seventh pass).
  const openPicker = (from: 'pick' | 'bar', event: MouseEvent<HTMLButtonElement>) => {
    giveBack.current = document.activeElement === event.currentTarget ? from : null;
    inputRef.current?.click();
  };
  // Opened only by the picture or the buttons: never a stop of its own for Tab or a screen reader.
  const picker = canPick ? (
    <input
      key="picker"
      ref={inputRef}
      className={styles.demoInput}
      type="file"
      accept="image/gif,image/*,video/*"
      tabIndex={-1}
      aria-hidden="true"
      data-testid="demo-file-input"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) onPickFile(file);
      }}
    />
  ) : null;
  // With a picker, the demonstration itself is the button that picks one (item 50); its name says
  // what it shows as well as what it does, since a button's content is not read on its own.
  const wrap = (media: ReactNode, name: string) =>
    canPick ? (
      <button
        ref={pickRef}
        type="button"
        className={styles.demoPick}
        onClick={(event) => openPicker('pick', event)}
        disabled={busy}
        aria-label={`${name}. ${pickLabel}`}
        data-testid="demo-pick"
      >
        {media}
      </button>
    ) : (
      media
    );

  // A picture that can move but is still (reduced motion, or a video the browser would not play):
  // Play shows the motion. Above the picture, clear of a diagram's own label along its foot.
  const playButton = (
    <span className={`${styles.demoOverlay} ${styles.demoOverlayTop}`}>
      <button
        type="button"
        className={styles.overlayButton}
        onClick={(event) => {
          focusPicture.current = document.activeElement === event.currentTarget;
          setOwnRefusedFor(null);
          setAskedFor(motionKey);
        }}
        data-testid="demo-play"
      >
        Play
      </button>
    </span>
  );

  if (customMedia) {
    const ownAlt = `${exercise.name}, your demonstration`;
    const ownImageSrc = ownMoves && !moving ? ownStill : (ownLooping ?? customMedia.dataUrl);
    const still = ownVideo ? !ownVideoMoving : ownMoves && !moving;
    return (
      <figure className={styles.demo} data-testid="custom-media">
        <div key="stage" className={styles.demoFrame} ref={takeFocus} tabIndex={-1}>
          {customMedia.kind === 'video'
            ? wrap(
                <video
                  ref={ownVideoRef}
                  className={styles.demoImage}
                  src={customMedia.dataUrl}
                  loop
                  muted
                  playsInline
                  aria-label={ownAlt}
                  data-testid="custom-demo"
                  data-playing={ownVideoMoving ? 'true' : 'false'}
                />,
                ownAlt,
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
                ownAlt,
              )}
          {still ? playButton : null}
        </div>
        <figcaption key="bar" className={styles.demoBar}>
          <span className={styles.demoLabel}>Your demonstration · stays on this device</span>
          {canPick ? (
            <span className={styles.demoControls}>
              <button
                ref={barRef}
                type="button"
                className={styles.demoButton}
                onClick={(event) => openPicker('bar', event)}
                disabled={busy}
                data-testid="demo-replace"
              >
                Replace
              </button>
              {onRemove ? (
                <button
                  ref={removeRef}
                  type="button"
                  className={styles.demoButton}
                  onClick={(event) => {
                    const focused = document.activeElement === event.currentTarget;
                    giveBack.current = focused ? 'bar' : null;
                    // The focus moves to Replace first: its button stays, as "Your GIF", once the
                    // picture is gone, where Remove goes (the third pass of item 50: with another
                    // exercise's picture kept, the save ended first and the focus fell after).
                    if (focused) barRef.current?.focus({ preventScroll: true });
                    const done = onRemove();
                    // Not removed: the focus goes back to Remove once it can take it again, so
                    // the next Enter tries again rather than opening the picker (the fourth pass).
                    if (focused && done instanceof Promise) {
                      void done.then((removed) => {
                        if (removed) return;
                        // The save's own end takes it there once Remove is enabled again; this
                        // runs before that end, whenever the browser draws (the fifth pass). A
                        // frame later, for a caller whose save marks nothing busy.
                        giveBack.current = 'remove';
                        nextFrame(() => {
                          const at = document.activeElement;
                          const back = removeRef.current ?? barRef.current;
                          if (
                            back &&
                            !back.disabled &&
                            (at === barRef.current || at === null || at === document.body)
                          ) {
                            back.focus({ preventScroll: true });
                          }
                        });
                      });
                    }
                  }}
                  disabled={busy}
                  data-testid="demo-remove"
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
  const toggleSlow = () => {
    const next = !slow;
    setSlow(next);
    if (videoRef.current) videoRef.current.playbackRate = next ? 0.5 : 1;
  };

  let stage: ReactNode;
  let status: string | null = null;
  if (clip && video.src) {
    stage = (
      <div key="stage" className={styles.demoStage} style={shape}>
        {wrap(
          <video
            ref={videoRef}
            className={styles.demoVideo}
            src={video.src}
            poster={mediaUrl(asset.poster)}
            // Started by useKeepPlaying only, so one rested out of view as it loaded stays rested
            // (the re-checks of the phone review).
            loop
            muted
            playsInline
            aria-label={alt}
            onLoadedMetadata={(event) => {
              event.currentTarget.playbackRate = slow ? 0.5 : 1;
            }}
            data-testid="exercise-demo"
            data-playing={clipStill ? 'false' : 'true'}
          />,
          alt,
        )}
        <span className={styles.demoOverlay}>
          {clipStill ? (
            <button
              type="button"
              className={styles.overlayButton}
              onClick={(event) => {
                // It leaves with the press: Slow takes the focus once the clip plays.
                focusSlow.current = document.activeElement === event.currentTarget;
                setClipStill(false);
              }}
              data-testid="demo-play"
            >
              Play
            </button>
          ) : null}
          <button
            ref={(node) => {
              if (node && (focusSlow.current || playFocused.current) && !clipStill) {
                focusSlow.current = false;
                playFocused.current = false;
                // Without scrolling: the lifter may be reading further down the sheet.
                node.focus({ preventScroll: true });
              }
            }}
            type="button"
            className={styles.overlayButton}
            aria-pressed={slow}
            onClick={toggleSlow}
            data-testid="demo-slow"
          >
            Slow
          </button>
        </span>
      </div>
    );
  } else if (clip) {
    // The still stands in: before the clip arrives, when it cannot, or until a reduced-motion
    // user asks for it.
    stage = (
      <div key="stage" className={styles.demoStage} style={shape}>
        {wrap(
          <Still
            asset={asset}
            exercise={exercise}
            className={styles.demoVideo}
            alt={alt}
            width={asset.width ?? 480}
            height={asset.height ?? 360}
            testId="exercise-demo"
            onDiagram={() => setDiagram(true)}
          />,
          alt,
        )}
        {reducedMotion || video.failed || video.retrying ? (
          // Over the diagram that stood in, the top corner, clear of its label (the review of 50).
          <span className={`${styles.demoOverlay} ${diagram ? styles.demoOverlayTop : ''}`}>
            {/* One button throughout: Play, Loading…, and Try again when the clip cannot load,
                so focus stays on it until Slow takes it (the tenth review). */}
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
                focusSlow.current = false;
              }}
              onClick={(event) => {
                // Only a press from the focused button hands the focus on: Safari, and Firefox
                // on a Mac, press a button without focusing it, and then no blur ever cancels
                // the hand-over (the tenth review's third re-check).
                const held = document.activeElement === event.currentTarget;
                if (video.failed) {
                  focusSlow.current = held;
                  video.retry();
                  return;
                }
                if (started || video.retrying) return;
                focusSlow.current = held;
                setStarted(true);
                setClipStill(false);
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
    // The diagram's loop, still under reduced motion until Play.
    const loops = asset.demo !== asset.poster;
    const playing = loops && moving;
    stage = (
      <div key="stage" className={styles.demoFrame} ref={takeFocus} tabIndex={-1}>
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
          alt,
        )}
        {loops && !moving ? playButton : null}
      </div>
    );
  }

  // Under the diagram that stood in, the demonstration's credit, note and notice are not shown;
  // once the clip plays they are its own again (the re-check of item 50: a clip that came after
  // a diagram had stood in played with no credit).
  const own = !diagram || (clip && video.src !== null);
  const credit = own ? creditLine(asset) : null;
  return (
    <figure className={styles.demo}>
      {stage}
      {status ? (
        <p className={styles.demoStatus} role="status" data-testid="demo-status">
          {status}
        </p>
      ) : null}
      <figcaption key="bar" className={styles.demoBar}>
        <span className={styles.demoLabel} data-testid="demo-credit">
          {credit ?? (canPick ? 'Diagram · tap it to use your own GIF' : 'Diagram of the movement')}
        </span>
        {canPick ? (
          <span className={styles.demoControls}>
            <button
              ref={barRef}
              type="button"
              className={`${styles.demoButton} ${styles.demoButtonAccent}`}
              onClick={(event) => openPicker('bar', event)}
              disabled={busy}
              data-testid="demo-your-gif"
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
