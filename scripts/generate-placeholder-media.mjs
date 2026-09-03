#!/usr/bin/env node
/**
 * Generates original diagram-style placeholder demonstrations, one poster and
 * one looping SVG per movement pattern, into public/media/placeholders/.
 *
 * These are development placeholders only. They contain no third-party
 * material; see docs/media-license-register.md. Run: npm run media:placeholders
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = path.join('public', 'media', 'placeholders');
mkdirSync(OUT, { recursive: true });

const BG = '#171a1e';
const LINE = '#c6f542';
const MUTED = '#6a7380';
const WHITE = '#f4f6f7';

/**
 * pose: which stick-figure glyph to draw
 * load: the moving element (bar, pair of dumbbells, cable line, or the body itself)
 * dx/dy: how far the load travels per half cycle
 */
const PATTERNS = {
  'horizontal-push': {
    name: 'Horizontal push',
    pose: 'lying',
    load: 'bar',
    at: [160, 118],
    dx: 0,
    dy: -34,
  },
  'incline-push': {
    name: 'Incline push',
    pose: 'incline',
    load: 'bar',
    at: [170, 104],
    dx: 8,
    dy: -34,
  },
  'vertical-push': {
    name: 'Vertical push',
    pose: 'standing',
    load: 'bar',
    at: [160, 96],
    dx: 0,
    dy: -36,
  },
  'horizontal-pull': {
    name: 'Horizontal pull',
    pose: 'bent',
    load: 'bar',
    at: [186, 172],
    dx: 0,
    dy: -30,
  },
  'vertical-pull': {
    name: 'Vertical pull',
    pose: 'hanging',
    load: 'body',
    at: [160, 120],
    dx: 0,
    dy: -34,
  },
  squat: { name: 'Squat', pose: 'standing', load: 'bar', at: [160, 86], dx: 0, dy: 34 },
  hinge: { name: 'Hinge', pose: 'standing', load: 'bar', at: [160, 150], dx: 0, dy: 36 },
  lunge: { name: 'Lunge', pose: 'split', load: 'dumbbells', at: [160, 150], dx: 0, dy: 30 },
  'hip-extension': {
    name: 'Hip extension',
    pose: 'bridge',
    load: 'bar',
    at: [160, 148],
    dx: 0,
    dy: -28,
  },
  'knee-extension': {
    name: 'Knee extension',
    pose: 'seated',
    load: 'pad',
    at: [206, 178],
    dx: 26,
    dy: -34,
  },
  'knee-flexion': {
    name: 'Knee flexion',
    pose: 'seated',
    load: 'pad',
    at: [206, 150],
    dx: -22,
    dy: 34,
  },
  'calf-raise': {
    name: 'Calf raise',
    pose: 'standing',
    load: 'body',
    at: [160, 120],
    dx: 0,
    dy: -14,
  },
  'elbow-flexion': {
    name: 'Elbow flexion',
    pose: 'standing',
    load: 'dumbbells',
    at: [160, 150],
    dx: 0,
    dy: -44,
  },
  'elbow-extension': {
    name: 'Elbow extension',
    pose: 'standing',
    load: 'cable',
    at: [160, 120],
    dx: 0,
    dy: 40,
  },
  'shoulder-abduction': {
    name: 'Shoulder abduction',
    pose: 'standing',
    load: 'dumbbells',
    at: [160, 150],
    dx: 0,
    dy: -44,
  },
  'chest-fly': {
    name: 'Chest fly',
    pose: 'lying',
    load: 'dumbbells-wide',
    at: [160, 118],
    dx: -40,
    dy: -10,
  },
  'rear-delt-fly': {
    name: 'Rear delt fly',
    pose: 'bent',
    load: 'dumbbells-wide',
    at: [186, 168],
    dx: 34,
    dy: -30,
  },
  shrug: { name: 'Shrug', pose: 'standing', load: 'dumbbells', at: [160, 150], dx: 0, dy: -12 },
  'core-anti-extension': {
    name: 'Core anti-extension',
    pose: 'plank',
    load: 'body',
    at: [160, 150],
    dx: 0,
    dy: -6,
  },
  'core-flexion': {
    name: 'Core flexion',
    pose: 'hanging',
    load: 'legs',
    at: [160, 176],
    dx: 0,
    dy: -40,
  },
  'core-anti-rotation': {
    name: 'Core anti-rotation',
    pose: 'standing',
    load: 'cable',
    at: [160, 120],
    dx: 40,
    dy: 0,
  },
  carry: { name: 'Carry', pose: 'standing', load: 'dumbbells', at: [160, 150], dx: 26, dy: 0 },
};

function figure(pose) {
  const s = `stroke="${WHITE}" stroke-width="4" stroke-linecap="round" fill="none"`;
  switch (pose) {
    case 'lying':
      return `<circle cx="96" cy="150" r="10" ${s}/><path d="M106 150 H196 M150 150 L176 176 M196 150 L214 176" ${s}/><path d="M60 182 H260" stroke="${MUTED}" stroke-width="4" stroke-linecap="round"/>`;
    case 'incline':
      return `<circle cx="108" cy="126" r="10" ${s}/><path d="M114 134 L188 168 M188 168 L214 178 M150 152 L172 180" ${s}/><path d="M60 182 H260" stroke="${MUTED}" stroke-width="4" stroke-linecap="round"/>`;
    case 'standing':
      return `<circle cx="160" cy="74" r="10" ${s}/><path d="M160 84 V150 M160 150 L144 190 M160 150 L176 190" ${s}/><path d="M100 196 H220" stroke="${MUTED}" stroke-width="4" stroke-linecap="round"/>`;
    case 'bent':
      return `<circle cx="112" cy="104" r="10" ${s}/><path d="M120 110 L172 134 M172 134 L166 190 M172 134 L196 188" ${s}/><path d="M100 196 H220" stroke="${MUTED}" stroke-width="4" stroke-linecap="round"/>`;
    case 'hanging':
      return `<path d="M96 56 H224" stroke="${MUTED}" stroke-width="6" stroke-linecap="round"/><circle cx="160" cy="110" r="10" ${s}/><path d="M160 120 V176 M148 60 L160 120 M172 60 L160 120" ${s}/>`;
    case 'split':
      return `<circle cx="160" cy="74" r="10" ${s}/><path d="M160 84 V140 M160 140 L132 172 L136 194 M160 140 L186 170 L206 190" ${s}/><path d="M100 196 H220" stroke="${MUTED}" stroke-width="4" stroke-linecap="round"/>`;
    case 'bridge':
      return `<circle cx="92" cy="176" r="10" ${s}/><path d="M102 172 L160 156 L190 176 L196 196" ${s}/><path d="M60 196 H260" stroke="${MUTED}" stroke-width="4" stroke-linecap="round"/>`;
    case 'seated':
      return `<circle cx="132" cy="96" r="10" ${s}/><path d="M132 106 V156 L182 156" ${s}/><path d="M118 156 V196 M100 196 H220" stroke="${MUTED}" stroke-width="4" stroke-linecap="round"/>`;
    case 'plank':
      return `<circle cx="92" cy="140" r="10" ${s}/><path d="M102 146 L220 168 M118 150 L110 184 M220 168 L236 186" ${s}/><path d="M60 190 H260" stroke="${MUTED}" stroke-width="4" stroke-linecap="round"/>`;
    default:
      return '';
  }
}

function load(kind, [x, y]) {
  const s = `stroke="${LINE}" stroke-width="6" stroke-linecap="round"`;
  switch (kind) {
    case 'bar':
      return `<path d="M${x - 60} ${y} H${x + 60}" ${s}/><rect x="${x - 72}" y="${y - 12}" width="12" height="24" rx="3" fill="${LINE}"/><rect x="${x + 60}" y="${y - 12}" width="12" height="24" rx="3" fill="${LINE}"/>`;
    case 'dumbbells':
      return `<rect x="${x - 40}" y="${y - 8}" width="24" height="16" rx="4" fill="${LINE}"/><rect x="${x + 16}" y="${y - 8}" width="24" height="16" rx="4" fill="${LINE}"/>`;
    case 'dumbbells-wide':
      return `<rect x="${x - 26}" y="${y - 8}" width="20" height="16" rx="4" fill="${LINE}"/><rect x="${x + 6}" y="${y - 8}" width="20" height="16" rx="4" fill="${LINE}"/>`;
    case 'cable':
      return `<path d="M${x} ${y - 50} V${y}" ${s} stroke-dasharray="6 6"/><rect x="${x - 18}" y="${y - 6}" width="36" height="12" rx="4" fill="${LINE}"/>`;
    case 'pad':
      return `<rect x="${x - 10}" y="${y - 10}" width="20" height="20" rx="5" fill="${LINE}"/>`;
    case 'legs':
      return `<path d="M${x} ${y - 30} L${x + 26} ${y}" ${s}/>`;
    case 'body':
      return `<circle cx="${x}" cy="${y}" r="9" fill="${LINE}"/>`;
    default:
      return '';
  }
}

function svg(id, config, animate) {
  const motion = animate
    ? `<animateTransform attributeName="transform" type="translate" values="0 0; ${config.dx} ${config.dy}; 0 0" keyTimes="0; 0.5; 1" dur="1.8s" calcMode="spline" keySplines="0.4 0 0.6 1; 0.4 0 0.6 1" repeatCount="indefinite"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" width="320" height="240" role="img" aria-label="Placeholder demonstration: ${config.name}">
  <rect width="320" height="240" rx="18" fill="${BG}"/>
  ${figure(config.pose)}
  <g>${motion}${load(config.load, config.at)}</g>
  <text x="16" y="222" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="${LINE}" letter-spacing="1.2">PLACEHOLDER</text>
  <text x="304" y="222" text-anchor="end" font-family="system-ui, sans-serif" font-size="12" fill="${MUTED}">${config.name}${animate ? ' · loop' : ''}</text>
</svg>
`;
}

let count = 0;
for (const [id, config] of Object.entries(PATTERNS)) {
  writeFileSync(path.join(OUT, `${id}.svg`), svg(id, config, false));
  writeFileSync(path.join(OUT, `${id}-loop.svg`), svg(id, config, true));
  count += 2;
}
console.log(`generate-placeholder-media: wrote ${count} files to ${OUT}`);
