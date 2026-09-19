import type { StyleId } from '../../core/validation/profile';

/**
 * The programming styles: what each one is, who it suits, and the research
 * behind it. A style decides how each set is done (sets, rep range, reps in
 * reserve, rest); the goal still decides where the weekly volume goes. Every
 * claim names its source, and every source was read on PubMed before it was
 * written down here (see docs/research/programming-styles.md). The 2026 ACSM
 * position stand found that few prescription variables change outcomes at all,
 * so the list stays short: only styles the evidence tells apart.
 */

export const SOURCES = {
  acsm2026:
    'Currier et al., 2026, Med Sci Sports Exerc: ACSM position stand, an overview of 137 systematic reviews',
  acsm2009: 'ACSM, 2009, Med Sci Sports Exerc: position stand on progression models',
  load2017: 'Schoenfeld et al., 2017, J Strength Cond Res: meta-analysis of 21 studies',
  load2021: 'Lopez et al., 2021, Med Sci Sports Exerc: network meta-analysis of 28 studies',
  volume2017: 'Schoenfeld, Ogborn and Krieger, 2017, J Sports Sci: meta-analysis',
  frequency2016: 'Schoenfeld, Ogborn and Krieger, 2016, Sports Med: meta-analysis',
  order2021: 'Nunes et al., 2021, Eur J Sport Sci: meta-analysis of 11 studies',
  rest2018: 'Grgic et al., 2018, Sports Med: systematic review of 23 studies',
  failure2023: 'Refalo et al., 2023, Sports Med: meta-analysis',
  dose2003: 'Rhea et al., 2003, Med Sci Sports Exerc: meta-analysis of 140 studies',
  periodization2022: 'Moesgaard et al., 2022, Sports Med: meta-analysis with volume matched',
  periodization2017: 'Williams et al., 2017, Sports Med: meta-analysis of 18 studies',
  dup2002: 'Rhea et al., 2002, J Strength Cond Res: 12-week trial',
  dupSize2017: 'Grgic et al., 2017, PeerJ: meta-analysis of 13 studies',
  deficit2022: 'Murphy and Koehler, 2022, Scand J Med Sci Sports: meta-analysis',
  deficitVolume2023: 'Roth et al., 2023, Scand J Med Sci Sports: trial in 38 trained men',
  prep2015: 'Helms et al., 2015, J Sports Med Phys Fitness: review',
  fat2022: 'Wewege et al., 2022, Sports Med: meta-analysis of 58 studies',
  retain2011: 'Bickel, Cross and Bamman, 2011, Med Sci Sports Exerc: trial',
  lightFailure2022: 'Lasevicius et al., 2022, J Strength Cond Res: trial',
  lightLoads2018: 'Lasevicius et al., 2018, Eur J Sport Sci: trial',
  lightTrained2016: 'Morton et al., 2016, J Appl Physiol: trial in trained men',
  repsOrLoad2022: 'Plotkin et al., 2022, PeerJ: trial in trained lifters',
} as const;

export type SourceId = keyof typeof SOURCES;

/** First author and year: what a coach card has room for. The full source is in Settings. */
export const SOURCE_SHORT: Record<SourceId, string> = {
  acsm2026: 'ACSM 2026',
  acsm2009: 'ACSM 2009',
  load2017: 'Schoenfeld 2017',
  load2021: 'Lopez 2021',
  volume2017: 'Schoenfeld 2017',
  frequency2016: 'Schoenfeld 2016',
  order2021: 'Nunes 2021',
  rest2018: 'Grgic 2018',
  failure2023: 'Refalo 2023',
  dose2003: 'Rhea 2003',
  periodization2022: 'Moesgaard 2022',
  periodization2017: 'Williams 2017',
  dup2002: 'Rhea 2002',
  dupSize2017: 'Grgic 2017',
  deficit2022: 'Murphy 2022',
  deficitVolume2023: 'Roth 2023',
  prep2015: 'Helms 2015',
  fat2022: 'Wewege 2022',
  retain2011: 'Bickel 2011',
  lightFailure2022: 'Lasevicius 2022',
  lightLoads2018: 'Lasevicius 2018',
  lightTrained2016: 'Morton 2016',
  repsOrLoad2022: 'Plotkin 2022',
};

export interface Evidence {
  claim: string;
  sources: SourceId[];
}

/** How far the research goes: settled, supported, or pulling both ways. */
export type EvidenceGrade = 'strong' | 'moderate' | 'mixed';

export const GRADE_LABEL: Record<EvidenceGrade, string> = {
  strong: 'Strong evidence',
  moderate: 'Moderate evidence',
  mixed: 'Mixed evidence',
};

export interface StyleInfo {
  id: StyleId;
  name: string;
  /** One line for the chooser. */
  line: string;
  /** How a session reads under it, for "Why this workout". */
  session: string;
  grade: EvidenceGrade;
  evidence: Evidence[];
}

export const STYLES: Record<StyleId, StyleInfo> = {
  hybrid: {
    id: 'hybrid',
    name: 'Hybrid',
    line: 'A heavy lift first, then muscle-building volume',
    session: 'heavy strength work first and hypertrophy volume after it',
    grade: 'strong',
    evidence: [
      {
        claim:
          'Strength is built by heavy loads, 80% of a max and up, on the lifts done first in a session.',
        sources: ['acsm2026', 'order2021'],
      },
      {
        claim:
          'Muscle size follows weekly sets, ten or more per muscle, and grows the same from light to heavy loads.',
        sources: ['acsm2026', 'load2017'],
      },
      {
        claim: 'So a heavy lift first with volume after it serves both goals in one session.',
        sources: [],
      },
    ],
  },
  'hypertrophy-focus': {
    id: 'hypertrophy-focus',
    name: 'Hypertrophy focus',
    line: 'More sets at moderate loads',
    session: 'moderate loads and more total volume',
    grade: 'strong',
    evidence: [
      {
        claim: 'More weekly sets meant more growth, set by set.',
        sources: ['volume2017', 'acsm2026'],
      },
      {
        claim:
          'Growth was the same from light to heavy loads, so the sets can sit at moderate loads.',
        sources: ['load2017', 'load2021'],
      },
      {
        claim: 'Training a muscle twice a week beat once a week.',
        sources: ['frequency2016'],
      },
    ],
  },
  'strength-focus': {
    id: 'strength-focus',
    name: 'Strength focus',
    line: 'Heavier loads, fewer reps, longer rests',
    session: 'heavier loads, lower reps, longer rests',
    grade: 'strong',
    evidence: [
      {
        claim: 'Heavy loads built more max strength than light ones.',
        sources: ['load2017', 'load2021'],
      },
      {
        claim: 'Strength rose most on the lifts done first in a session.',
        sources: ['order2021'],
      },
      {
        claim: 'Trained lifters needed rests of more than two minutes to get the most strength.',
        sources: ['rest2018'],
      },
      {
        claim: 'Two to three sets, and two sessions a week, were what moved strength.',
        sources: ['acsm2026'],
      },
    ],
  },
  undulating: {
    id: 'undulating',
    name: 'Undulating',
    line: 'Heavy, moderate, and light days in rotation',
    session: 'the main lifts rotating through heavy, moderate, and light days',
    grade: 'mixed',
    evidence: [
      {
        claim:
          'With volume matched, rotating the rep range built more max strength than a linear plan in trained lifters, though not in new ones.',
        sources: ['periodization2022', 'dup2002'],
      },
      {
        claim: 'An earlier meta-analysis also favoured undulating plans for max strength.',
        sources: ['periodization2017'],
      },
      {
        claim: 'For muscle size it made no difference either way, so nothing is given up.',
        sources: ['dupSize2017', 'periodization2022'],
      },
      {
        claim:
          'The 2026 ACSM position stand found periodization did not change outcomes consistently: a tool for a stall, not a rule.',
        sources: ['acsm2026'],
      },
    ],
  },
  'lean-down': {
    id: 'lean-down',
    name: 'Lean-down',
    line: 'Losing fat: keep the muscle and the strength',
    session: 'the heavy lift kept heavy and the volume held, with nothing taken to failure',
    grade: 'moderate',
    evidence: [
      {
        claim:
          'An energy deficit blunted muscle gain but not strength gain; about 500 kcal a day was enough to stop lean mass rising.',
        sources: ['deficit2022'],
      },
      {
        claim:
          'In trained men on a six-week deficit, five sets per exercise kept no more muscle than three, so nothing is added.',
        sources: ['deficitVolume2023'],
      },
      {
        claim: 'In young adults, muscle and strength held on a third of the usual weekly sets.',
        sources: ['retain2011'],
      },
      {
        claim:
          'Physique athletes in a deficit are advised to train each muscle twice a week or more, mostly at 6 to 12 reps.',
        sources: ['prep2015'],
      },
      {
        claim:
          'Lifting itself takes off a little fat, about 1.5 points of body fat against no training; the diet does the rest.',
        sources: ['fat2022'],
      },
    ],
  },
  'high-rep': {
    id: 'high-rep',
    name: 'Light weights',
    line: 'Lighter loads, more reps, close to failure',
    session: 'lighter loads taken close to failure for more reps',
    grade: 'strong',
    evidence: [
      {
        claim: 'Muscle grew the same from light to heavy loads when sets were taken to failure.',
        sources: ['load2017', 'load2021'],
      },
      {
        claim:
          'With light loads the effort is what counts: taken to failure they grew muscle, stopped short they grew less.',
        sources: ['lightFailure2022'],
      },
      {
        claim: 'Loads from 40% of a max up grew muscle equally; 20% was too light.',
        sources: ['lightLoads2018'],
      },
      {
        claim: 'In trained men, 20 to 25 reps grew as much muscle as 8 to 12.',
        sources: ['lightTrained2016'],
      },
      {
        claim: 'Adding reps at a fixed weight worked as well as adding weight over eight weeks.',
        sources: ['repsOrLoad2022'],
      },
      {
        claim: 'The trade: max strength grows less on light loads.',
        sources: ['load2017'],
      },
    ],
  },
  foundation: {
    id: 'foundation',
    name: 'Foundation',
    line: 'New to lifting: moderate loads, fewer sets, reps in reserve',
    session: 'moderate loads, fewer sets, and reps left in reserve while the lifts are learned',
    grade: 'strong',
    evidence: [
      {
        claim:
          'New lifters gained the most at about 60% of a max, three days a week; trained lifters needed about 80%.',
        sources: ['dose2003'],
      },
      {
        claim:
          'A novice is advised moderate loads for 8 to 12 reps, one to three sets, two to three days a week.',
        sources: ['acsm2009', 'acsm2026'],
      },
      {
        claim: 'Rests of one to two minutes were enough for new lifters.',
        sources: ['rest2018'],
      },
      {
        claim: 'Stopping short of failure cost no muscle.',
        sources: ['failure2023'],
      },
    ],
  },
};

export const STYLE_ORDER: readonly StyleId[] = [
  'hybrid',
  'hypertrophy-focus',
  'strength-focus',
  'undulating',
  'lean-down',
  'high-rep',
  'foundation',
];

export function styleInfo(style: StyleId): StyleInfo {
  return STYLES[style];
}

function cite({ claim, sources }: Evidence, names: Record<SourceId, string>): string {
  if (sources.length === 0) return claim;
  return `${claim} (${[...new Set(sources.map((source) => names[source]))].join('; ')})`;
}

/** "Claim (Source; Source)" lines for a style, with each source in full. */
export function evidenceLines(style: StyleId): string[] {
  return STYLES[style].evidence.map((item) => cite(item, SOURCES));
}

/** The style's leading claim with first author and year only, for a coach card. */
export function leadEvidence(style: StyleId): string {
  return cite(STYLES[style].evidence[0] as Evidence, SOURCE_SHORT);
}
