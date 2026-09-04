import type { WeekBucket } from '../../engine/scoring/analytics';
import styles from './Bars.module.css';

/**
 * Plain HTML bar marks for the Progress and Plan screens: one series, one hue,
 * thin marks with rounded data ends, recessive guides, and a title tooltip on
 * every mark. The numbers behind each chart live in the score panel's table.
 */

interface WeekBarsProps {
  weeks: readonly WeekBucket[];
  label: string;
}

export function WeekBars({ weeks, label }: WeekBarsProps) {
  const max = Math.max(1, ...weeks.map((week) => Math.max(week.sessions, week.planned)));
  const last = weeks[weeks.length - 1];
  return (
    <div className={styles.weekChart} role="img" aria-label={label}>
      <ul className={styles.weekBars}>
        {weeks.map((week, index) => {
          const height = Math.round((week.sessions / max) * 100);
          const planned = Math.round((week.planned / max) * 100);
          return (
            <li
              key={week.start}
              className={styles.weekBar}
              title={`Week of ${week.label}: ${week.sessions} of ${week.planned} planned`}
            >
              <span className={styles.weekTrack}>
                <span
                  className={styles.weekPlanned}
                  style={{ bottom: `${planned}%` }}
                  aria-hidden="true"
                />
                <span
                  className={styles.weekFill}
                  style={{ height: `${height}%` }}
                  data-empty={week.sessions === 0 ? 'true' : undefined}
                />
                {index === weeks.length - 1 && last ? (
                  <span className={styles.weekValue}>{week.sessions}</span>
                ) : null}
              </span>
              <span className={styles.weekLabel}>
                {index === 0 || index === weeks.length - 1 ? week.label : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface BandBarProps {
  direct: number;
  indirect: number;
  target: number;
  units?: string;
}

/** A horizontal meter: direct sets solid, indirect sets striped, target band outlined. */
export function BandBar({ direct, indirect, target, units = 'sets' }: BandBarProps) {
  const total = direct + indirect;
  const scale = Math.max(target * 1.4, total, 1);
  const pct = (value: number) => `${Math.min(100, Math.round((value / scale) * 1000) / 10)}%`;
  return (
    <div
      className={styles.band}
      role="img"
      aria-label={`${direct} direct and ${indirect} indirect ${units} of ${target} target`}
      title={`${direct} direct + ${indirect} indirect of ${target} ${units}`}
    >
      <span className={styles.bandTrack}>
        {target > 0 ? (
          <span
            className={styles.bandTarget}
            style={{ left: pct(target * 0.7), width: pct(target * 0.6) }}
            aria-hidden="true"
          />
        ) : null}
        <span className={styles.bandDirect} style={{ width: pct(direct) }} />
        <span className={styles.bandIndirect} style={{ left: pct(direct), width: pct(indirect) }} />
      </span>
      <span className={styles.bandText}>
        {direct}
        {indirect > 0 ? ` + ${indirect}` : ''} of {target}
      </span>
    </div>
  );
}
