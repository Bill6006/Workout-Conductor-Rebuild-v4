/**
 * Keys for a list of lines drawn from text (Maintenance 25). React needs a key that is unique in
 * its list, and a line's own text is not when a list can say the same thing twice (a plan's
 * reasons, a lifter's cues). The first of each line keeps its text as its key, so a list without
 * repeats keys as it did; a repeat is keyed by its place among the same lines.
 */
export function keyedLines(lines: readonly string[]): { key: string; line: string }[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const before = seen.get(line) ?? 0;
    seen.set(line, before + 1);
    return { key: before === 0 ? line : `${line}\u0000${before + 1}`, line };
  });
}
