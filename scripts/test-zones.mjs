// Maintenance 28, item 1: the day rules read the device's zone, so a runner in UTC cannot tell a rule
// on the device's days from one on UTC days. Their tests run again here, in a zone behind UTC and in
// one far ahead of it. A zone that does not take fails the run; it never passes it.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');

/** Each zone, with its offset at noon on 10 September 2026 as `getTimezoneOffset` gives it. */
const ZONES = [
  { zone: 'America/New_York', offset: 240 },
  { zone: 'Pacific/Kiritimati', offset: -840 },
];

/** The tests of the day rules. */
const FILES = [
  'src/core/time/localDays.test.ts',
  'src/features/today/useTodayWorkout.localDay.test.tsx',
  'src/engine/planning/deload.test.ts',
  'src/engine/planning/weekModel.test.ts',
  'src/core/state/secondRebuiltPastMidnight.store.test.ts',
  'src/core/state/checkInCarried.store.test.ts',
];

for (const { zone, offset } of ZONES) {
  const env = { ...process.env, TZ: zone };
  const probe = spawnSync(
    process.execPath,
    ['-e', 'process.stdout.write(String(new Date(2026, 8, 10, 12).getTimezoneOffset()))'],
    { env, encoding: 'utf8' },
  );
  if (probe.stdout !== String(offset)) {
    console.error(`The zone ${zone} did not take: offset ${probe.stdout || probe.stderr}.`);
    process.exit(1);
  }
  console.log(`\nThe day rules in ${zone}:`);
  const run = spawnSync(process.execPath, [vitest, 'run', ...FILES], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  if (run.status !== 0) process.exit(run.status ?? 1);
}
