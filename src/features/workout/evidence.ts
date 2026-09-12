import type { RestStyle } from '../../core/validation/profile';
import { EFFORT_EVIDENCE, REST_EVIDENCE } from './effort';
import { TEMPO_EVIDENCE } from './tempo';

/**
 * The research lines under a set, made skimmable: each carries a two-word
 * lead, duplicates by lead are dropped (the tempo and the effort guidance both
 * explain ramp sets), and the rest-style line appears only when a rest style
 * other than Standard is in play.
 */

export interface EvidenceLine {
  lead: string;
  text: string;
}

const LEADS: readonly (readonly [string, string])[] = [
  [TEMPO_EVIDENCE.duration, 'Rep speed'],
  [TEMPO_EVIDENCE.intent, 'Intent'],
  [TEMPO_EVIDENCE.eccentric, 'Lowering'],
  [TEMPO_EVIDENCE.pause, 'Pause'],
  [TEMPO_EVIDENCE.squeeze, 'Squeeze'],
  [TEMPO_EVIDENCE.ramp, 'Ramp sets'],
  [EFFORT_EVIDENCE.scale, 'Effort scale'],
  [EFFORT_EVIDENCE.strength, 'Strength sets'],
  [EFFORT_EVIDENCE.hypertrophy, 'Growth sets'],
  [EFFORT_EVIDENCE.isolation, 'Isolation'],
  [EFFORT_EVIDENCE.ramp, 'Ramp sets'],
  [EFFORT_EVIDENCE.drop, 'Drop sets'],
  [REST_EVIDENCE.strength, 'Rest'],
  [REST_EVIDENCE.hypertrophy, 'Rest'],
  [REST_EVIDENCE.isolation, 'Rest'],
  [REST_EVIDENCE.fitted, 'Fitted rests'],
  [REST_EVIDENCE.style, 'Rest style'],
];

export function leadFor(text: string): string {
  return LEADS.find(([line]) => line === text)?.[1] ?? 'Evidence';
}

export function evidenceLines(
  lines: readonly string[],
  options: { restStyle?: RestStyle } = {},
): EvidenceLine[] {
  const seen = new Set<string>();
  const out: EvidenceLine[] = [];
  for (const text of lines) {
    if (text === REST_EVIDENCE.style && (options.restStyle ?? 'standard') === 'standard') continue;
    const lead = leadFor(text);
    if (seen.has(lead)) continue;
    seen.add(lead);
    out.push({ lead, text });
  }
  return out;
}
