import { z } from 'zod';
import { CURRENT_PHASE } from './phases';

export const BuildInfoSchema = z.object({
  commit: z.string().min(1),
  shortCommit: z.string().min(1),
  branch: z.string().min(1),
  builtAt: z.iso.datetime(),
  version: z.string().min(1),
  phase: z.number().int().min(0),
});

export type BuildInfo = z.infer<typeof BuildInfoSchema>;

export const FALLBACK_BUILD_INFO: BuildInfo = {
  commit: 'unknown',
  shortCommit: 'unknown',
  branch: 'unknown',
  builtAt: '1970-01-01T00:00:00.000Z',
  version: '0.0.0',
  phase: CURRENT_PHASE,
};

/** Validates the build-time constant; never throws so a bad marker cannot blank the app. */
export function readBuildInfo(raw: unknown): BuildInfo {
  const result = BuildInfoSchema.safeParse(raw);
  return result.success ? result.data : FALLBACK_BUILD_INFO;
}

export const buildInfo: BuildInfo = readBuildInfo(
  typeof __BUILD_INFO__ === 'undefined' ? undefined : __BUILD_INFO__,
);

export function isRealCommit(sha: string): boolean {
  return /^[0-9a-f]{40}$/i.test(sha);
}

export function formatBuiltAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'unknown time';
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  return `${day} ${time} UTC`;
}

export function formatBuildMarker(info: BuildInfo): string {
  return `Build ${info.shortCommit} · ${formatBuiltAt(info.builtAt)} · Phase ${info.phase}`;
}
