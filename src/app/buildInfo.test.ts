import { describe, expect, it } from 'vitest';
import {
  FALLBACK_BUILD_INFO,
  formatBuildMarker,
  formatBuiltAt,
  isRealCommit,
  readBuildInfo,
} from './buildInfo';
import { CURRENT_PHASE } from './phases';

const VALID = {
  commit: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
  shortCommit: 'a1b2c3d',
  branch: 'main',
  builtAt: '2026-09-02T14:03:27.000Z',
  version: '0.0.1',
  phase: 0,
};

describe('readBuildInfo', () => {
  it('accepts a valid build-time marker', () => {
    expect(readBuildInfo(VALID)).toEqual(VALID);
  });

  it('falls back safely instead of throwing on an invalid marker', () => {
    expect(readBuildInfo(undefined)).toEqual(FALLBACK_BUILD_INFO);
    expect(readBuildInfo({ ...VALID, builtAt: 'yesterday' })).toEqual(FALLBACK_BUILD_INFO);
    expect(readBuildInfo({ ...VALID, phase: -1 })).toEqual(FALLBACK_BUILD_INFO);
  });

  it('fallback points at the current phase', () => {
    expect(FALLBACK_BUILD_INFO.phase).toBe(CURRENT_PHASE);
  });
});

describe('formatBuiltAt', () => {
  it('renders a compact UTC timestamp', () => {
    expect(formatBuiltAt('2026-09-02T14:03:27.000Z')).toBe('2026-09-02 14:03 UTC');
  });

  it('zero-pads month, day, hour, and minute', () => {
    expect(formatBuiltAt('2026-01-05T04:07:00.000Z')).toBe('2026-01-05 04:07 UTC');
  });

  it('never throws on an unparseable date', () => {
    expect(formatBuiltAt('not a date')).toBe('unknown time');
  });
});

describe('formatBuildMarker', () => {
  it('shows commit, time, and phase in one line', () => {
    expect(formatBuildMarker(VALID)).toBe('Build a1b2c3d · 2026-09-02 14:03 UTC · Phase 0');
  });
});

describe('isRealCommit', () => {
  it('only accepts full 40-character SHAs', () => {
    expect(isRealCommit(VALID.commit)).toBe(true);
    expect(isRealCommit('local')).toBe(false);
    expect(isRealCommit('a1b2c3d')).toBe(false);
  });
});
