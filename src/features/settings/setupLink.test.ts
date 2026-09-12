import { describe, expect, it } from 'vitest';
import { buildSetupLink, readSetupLink } from './setupLink';

const URL = 'libsql://life-record-p1-bill6006.aws-us-east-1.turso.io';
const TOKEN = 'ey.fake.token-for-tests';

describe('setup link', () => {
  it('builds a link that carries both values in the fragment, never the query string', () => {
    const link = buildSetupLink('https://bill6006.github.io/Workout-Conductor-Rebuild-v4/', {
      url: URL,
      token: TOKEN,
    });
    const [before, fragment] = link.split('#');
    // A fragment never reaches a server, which is the whole point.
    expect(before).not.toContain('token');
    expect(fragment).toContain('db=');
    expect(fragment).toContain('token=');
    expect(readSetupLink(`#${fragment}`)).toEqual({ url: URL, token: TOKEN });
  });

  it('replaces an existing hash rather than appending to it', () => {
    const link = buildSetupLink('https://example.com/app/#/settings', { url: URL, token: TOKEN });
    expect(link.split('#')).toHaveLength(2);
    expect(readSetupLink(`#${link.split('#')[1]}`)).toEqual({ url: URL, token: TOKEN });
  });

  it('reads nothing from any other hash, or from half a link', () => {
    expect(readSetupLink('#/settings')).toBeNull();
    expect(readSetupLink('')).toBeNull();
    expect(readSetupLink('#/today?db=x')).toBeNull();
    expect(readSetupLink(`#/setup?db=${encodeURIComponent(URL)}`)).toBeNull();
    expect(readSetupLink(`#/setup?token=${TOKEN}`)).toBeNull();
    expect(readSetupLink(`#/SETUP?db=${encodeURIComponent(URL)}&token=${TOKEN}`)).toEqual({
      url: URL,
      token: TOKEN,
    });
  });
});
