#!/usr/bin/env node
/**
 * Privacy scan.
 *
 * Fails when anything that looks like private user data, credentials, or a
 * telemetry hook is present in tracked files or in the built bundle (dist/).
 * The rules are documented in docs/privacy-rules.md. Run: npm run privacy-scan
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.html',
  '.css',
  '.yml',
  '.yaml',
  '.txt',
  '.svg',
  '.webmanifest',
  '.map',
]);

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'playwright-report',
  'test-results',
  'coverage',
  'dev-dist',
]);

/** Files where the rule text itself legitimately mentions patterns (never real data). */
const SELF_REFERENCING = new Set(['scripts/privacy-scan.mjs']);

/**
 * npm writes third-party deprecation notices (which may contain a maintainer's
 * contact) into the lockfile. That is package metadata, not user data, so the
 * email rule skips the lockfile only. Every other rule still applies to it.
 */
const THIRD_PARTY_METADATA = new Set(['package-lock.json']);

const CONTENT_RULES = [
  {
    id: 'email-address',
    scope: 'all',
    description: 'Email addresses are never allowed in the repository or bundle.',
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    ignoreFiles: THIRD_PARTY_METADATA,
  },
  {
    id: 'phone-number',
    scope: 'all',
    description: 'Phone numbers are never allowed in the repository or bundle.',
    pattern: /(?<![\w.-])(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?![\w.-])/g,
  },
  {
    id: 'secret-token',
    scope: 'all',
    description: 'Credentials, API keys, and private keys must never be committed.',
    pattern:
      /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    id: 'telemetry-endpoint',
    scope: 'dist',
    description: 'The shipped bundle must not reference analytics or telemetry services.',
    pattern:
      /google-analytics\.com|googletagmanager\.com|\bgtag\(|segment\.(?:io|com)|mixpanel\.com|hotjar\.com|sentry\.io|facebook\.net|doubleclick\.net|amplitude\.com|plausible\.io|posthog\.com/g,
  },
];

const USER_DATA_NAME = /(backup|export|workout-history)/i;
const USER_DATA_KEYS = /"(?:workouts|history|sessions|workoutHistory)"\s*:\s*\[/;

function listTrackedFiles() {
  try {
    const output = execSync('git ls-files --cached --others --exclude-standard', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((file) => !file.split('/').some((part) => SKIP_DIRS.has(part)));
  } catch {
    return walk(ROOT).map((file) => path.relative(ROOT, file).split(path.sep).join('/'));
  }
}

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      results.push(...walk(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function isTextFile(file) {
  return TEXT_EXTENSIONS.has(path.extname(file).toLowerCase());
}

function lineNumberAt(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i += 1) {
    if (content[i] === '\n') line += 1;
  }
  return line;
}

function scanContent(relativePath, content, scope, findings) {
  for (const rule of CONTENT_RULES) {
    if (rule.scope !== 'all' && rule.scope !== scope) continue;
    if (SELF_REFERENCING.has(relativePath)) continue;
    if (rule.ignoreFiles?.has(relativePath)) continue;
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(content)) !== null) {
      findings.push({
        file: relativePath,
        line: lineNumberAt(content, match.index),
        rule: rule.id,
        detail: rule.description,
        snippet: match[0].slice(0, 60),
      });
      if (match.index === rule.pattern.lastIndex) rule.pattern.lastIndex += 1;
    }
  }
}

function scanUserDataFile(relativePath, content, findings) {
  if (path.extname(relativePath).toLowerCase() !== '.json') return;
  const isSyntheticFixture =
    relativePath.startsWith('src/test/fixtures/') && /"synthetic"\s*:\s*true/.test(content);
  const base = path.basename(relativePath);
  const looksLikeUserData =
    (USER_DATA_NAME.test(base) && base !== 'package.json') || USER_DATA_KEYS.test(content);
  if (looksLikeUserData && !isSyntheticFixture) {
    findings.push({
      file: relativePath,
      line: 1,
      rule: 'user-data-file',
      detail:
        'Backups, exports, and workout history stay in the browser. Only synthetic fixtures under src/test/fixtures with "synthetic": true are allowed.',
      snippet: base,
    });
  }
}

function run() {
  const findings = [];
  let scanned = 0;

  for (const relativePath of listTrackedFiles()) {
    const full = path.join(ROOT, relativePath);
    if (!existsSync(full) || statSync(full).isDirectory()) continue;
    if (!isTextFile(relativePath)) continue;
    const content = readFileSync(full, 'utf8');
    scanned += 1;
    scanContent(relativePath, content, 'repo', findings);
    scanUserDataFile(relativePath, content, findings);
  }

  if (existsSync(DIST)) {
    for (const full of walk(DIST)) {
      if (!isTextFile(full)) continue;
      const relativePath = path.relative(ROOT, full).split(path.sep).join('/');
      const content = readFileSync(full, 'utf8');
      scanned += 1;
      scanContent(relativePath, content, 'dist', findings);
    }
  } else {
    console.log('privacy-scan: dist/ not found, scanning repository files only');
  }

  if (findings.length > 0) {
    console.error(`privacy-scan: FAILED with ${findings.length} finding(s) in ${scanned} files`);
    for (const finding of findings) {
      console.error(`  ${finding.file}:${finding.line} [${finding.rule}] ${finding.snippet}`);
      console.error(`      ${finding.detail}`);
    }
    process.exit(1);
  }

  console.log(`privacy-scan: passed (${scanned} text files scanned, 0 findings)`);
}

run();
