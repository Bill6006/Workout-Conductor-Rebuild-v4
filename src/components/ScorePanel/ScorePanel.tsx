import type { Score } from '../../engine/scoring/analytics';
import styles from './ScorePanel.module.css';

interface ScorePanelProps {
  score: Score<unknown>;
  label?: string;
}

/**
 * The explanation panel every score carries: definition, supporting data,
 * sample count, confidence, and a plain explanation.
 */
export function ScorePanel({ score, label = 'How this is calculated' }: ScorePanelProps) {
  return (
    <details className={styles.panel} data-testid="score-panel">
      <summary className={styles.summary}>
        {label}
        <span className={styles.meta}>
          {score.samples} {score.samples === 1 ? 'sample' : 'samples'} · {score.confidence}{' '}
          confidence
        </span>
      </summary>
      <p className={styles.definition}>{score.definition}</p>
      <p className={styles.explanation}>{score.explanation}</p>
      {score.data.length > 0 ? (
        <ul className={styles.data}>
          {score.data.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}
