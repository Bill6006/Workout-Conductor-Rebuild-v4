import { requireExercise } from '../../catalog/exercises/catalog';
import { DOW_NOTICE, EXERCISE_MEDIA } from '../../catalog/media/exerciseMedia';
import { creditLine, type MediaAsset } from '../../catalog/media/mediaManifest';
import styles from './Settings.module.css';

interface SourceGroup {
  key: string;
  /** Who made them and on what terms, as the line under each demonstration says it. */
  heading: string;
  /** The full name, where the short one leaves part of it out. */
  author: string | null;
  licenseUrl: string | null;
  assets: MediaAsset[];
}

/** The demonstrations grouped by who made them and under which licence, in catalog order. */
function bySource(): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const asset of EXERCISE_MEDIA) {
    const credit = asset.credit;
    if (!credit) continue;
    const key = `${credit.byline}|${credit.license}`;
    const group = groups.get(key) ?? {
      key,
      heading: creditLine(asset) ?? credit.byline,
      author: credit.byline.includes(credit.author) ? null : credit.author,
      licenseUrl: credit.licenseUrl,
      assets: [],
    };
    group.assets.push(asset);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/**
 * Who made each exercise's demonstration and on what terms (Maintenance 25, item 7), with a link
 * to each original. The demonstration itself credits its own under it; this lists them all.
 */
export function MediaCreditsCard() {
  const groups = bySource();
  return (
    <div className={styles.credits} data-testid="media-credits">
      <p className={styles.body}>
        {EXERCISE_MEDIA.length} exercises show a demonstration made by others and shared for reuse.
        Each clip is cut to one repetition, looped without sound, cropped and resized; each drawing
        loop shows its two drawings in turn. Adaptations of CC BY-SA originals are shared under CC
        BY-SA 4.0. The rest of the exercises show a diagram made for this app.
      </p>
      {groups.map((group) => (
        <section key={group.key} className={styles.creditGroup} aria-label={group.heading}>
          <h3 className={styles.creditHeading}>
            {group.heading}
            {group.licenseUrl ? (
              <>
                {' · '}
                <a href={group.licenseUrl} target="_blank" rel="noreferrer">
                  licence
                </a>
              </>
            ) : null}
          </h3>
          {group.author ? <p className={styles.creditAuthor}>By {group.author}.</p> : null}
          <ul className={styles.creditList}>
            {group.assets.map((asset) => (
              <li key={asset.id}>
                <a href={asset.credit?.sourceUrl} target="_blank" rel="noreferrer">
                  {requireExercise(asset.id.replace(/^demo-/, '')).name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className={styles.body} data-testid="dow-notice">
        {DOW_NOTICE}
      </p>
    </div>
  );
}
