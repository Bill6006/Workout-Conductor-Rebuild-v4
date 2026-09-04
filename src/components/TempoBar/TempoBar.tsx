import { useEffect, useRef } from 'react';
import type { TempoPhase } from '../../features/workout/tempo';
import { useReducedMotion } from '../ExerciseDetail/useReducedMotion';
import { fillKeyframes, phaseWindows } from './tempoKeyframes';
import styles from './TempoBar.module.css';

interface TempoBarProps {
  phases: readonly TempoPhase[];
  totalSeconds: number;
}

/**
 * One rep as a loading bar: the fill rises at the lifting pace, holds at the
 * top for the squeeze, drops at the lowering pace, and pauses at the bottom,
 * then repeats. The phase legend brightens as each phase plays. The labels
 * carry the meaning, so nothing depends on colour, and everything stands
 * still when the viewer prefers reduced motion.
 */
export function TempoBar({ phases, totalSeconds }: TempoBarProps) {
  const fillRef = useRef<HTMLSpanElement>(null);
  const legendRef = useRef<HTMLUListElement>(null);
  const reducedMotion = useReducedMotion();
  const shown = phases.filter((phase) => phase.seconds > 0);
  const description = shown
    .map(
      (phase) =>
        `${phase.label.toLowerCase()} ${phase.fast ? 'as fast as you can' : `${phase.seconds} s`}`,
    )
    .join(', ');
  const signature = phases.map((phase) => `${phase.key}:${phase.seconds}`).join('|');

  useEffect(() => {
    const fill = fillRef.current;
    const legend = legendRef.current;
    if (!fill || !legend || reducedMotion || typeof fill.animate !== 'function') return undefined;
    const keyframes = fillKeyframes(phases);
    if (keyframes.length === 0) return undefined;
    const duration = Math.max(1, totalSeconds) * 1000;
    const options: KeyframeAnimationOptions = { duration, iterations: Infinity, easing: 'linear' };
    const animations = [fill.animate(keyframes, options)];
    const windows = phaseWindows(phases);
    for (const item of Array.from(legend.querySelectorAll<HTMLElement>('[data-phase]'))) {
      const window = windows.find((candidate) => candidate.key === item.dataset.phase);
      if (!window) continue;
      animations.push(
        item.animate(
          [
            { opacity: 0.45, offset: 0 },
            { opacity: 0.45, offset: window.start },
            { opacity: 1, offset: window.start },
            { opacity: 1, offset: window.end },
            { opacity: 0.45, offset: window.end },
            { opacity: 0.45, offset: 1 },
          ],
          options,
        ),
      );
    }
    return () => {
      for (const animation of animations) animation.cancel();
    };
    // The signature captures every phase's seconds; phases itself is a new array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, totalSeconds, reducedMotion]);

  return (
    <div
      className={styles.bar}
      role="img"
      aria-label={`One rep: ${description}`}
      data-testid="tempo-bar"
    >
      <span className={styles.track}>
        <span ref={fillRef} className={styles.fill} data-testid="tempo-fill" />
        <span className={styles.edge} data-edge="bottom" aria-hidden="true">
          bottom
        </span>
        <span className={styles.edge} data-edge="top" aria-hidden="true">
          top
        </span>
      </span>
      <ul ref={legendRef} className={styles.legend}>
        {shown.map((phase) => (
          <li key={phase.key} className={styles.phase} data-phase={phase.key}>
            <span className={styles.phaseLabel}>{phase.label}</span>
            <span className={styles.phaseTime}>{phase.fast ? 'fast' : `${phase.seconds}s`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
