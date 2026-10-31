/**
 * Every number the recovery and readiness rules use, in one table with its source and evidence
 * status (the approved proposal, docs/proposals/week-model-readiness-time.md, part 2: "Every number
 * lives in one table with its source and evidence status, later tuned from your logs"). The research
 * is docs/research/recovery-time-course.md and docs/research/readiness-and-soreness.md, and for time
 * (Maintenance 34) docs/research/training-dose-and-time.md and
 * docs/research/coaching-nudges-and-cooldowns.md; each source below is a PubMed ID from them, or the
 * judgement it rests on. The modules read their numbers from here, never a copy of their own.
 */

/** How a number is known. */
export type RuleBasis =
  /** The evidence gives the number itself. */
  | 'research'
  /** The evidence gives the direction; the size is product judgement. */
  | 'direction research, size judgement'
  /** Product judgement, its reason given. */
  | 'judgement';

export interface Rule {
  value: number;
  /** What the value counts: hours, sets, reps, days, a share of 1. */
  unit: string;
  basis: RuleBasis;
  /** The studies (PubMed IDs) or the reasoning behind it. */
  source: string;
}

function rule(value: number, unit: string, basis: RuleBasis, source: string): Rule {
  return { value, unit, basis, source };
}

export const RULES = {
  // Recovery windows (Maintenance 33): a muscle's starting estimate from its hardest sets.
  hardRir: rule(
    3,
    'reps in reserve',
    'judgement',
    'A set 4 or more short of failure is light work: light work adds no damage worth a window (34350481, 11834116).',
  ),
  easyHours: rule(
    24,
    'hours',
    'research',
    'About a day after sets 3 or more short of failure, upper or lower (recovery-time-course.md).',
  ),
  midHoursUpper: rule(
    36,
    'hours',
    'judgement',
    'Between the 24 h and 48 h the research gives either side of it, for the upper body.',
  ),
  midHoursLower: rule(
    48,
    'hours',
    'research',
    'Lower-body compound work 1-2 short of failure (recovery-time-course.md).',
  ),
  failureHoursUpper: rule(
    48,
    'hours',
    'research',
    'About two days after sets to failure, upper body (recovery-time-course.md).',
  ),
  failureHoursLower: rule(
    72,
    'hours',
    'research',
    'Up to three days after failure or high volume, lower-body compound work (recovery-time-course.md).',
  ),
  longSetReps: rule(
    12,
    'reps',
    'research',
    'A long set near failure (12 or more reps, 1 or less in reserve) counts as failure (recovery-time-course.md; 30836680).',
  ),
  bigDoseSets: rule(
    6,
    'hard sets',
    'direction research, size judgement',
    'More hard sets for a muscle in one session lengthen its recovery (recovery-time-course.md).',
  ),
  bigDoseHours: rule(
    24,
    'hours',
    'direction research, size judgement',
    'A day more for a large dose, never past the cap.',
  ),
  capHoursUpper: rule(
    72,
    'hours',
    'judgement',
    'The longest a large dose takes an upper-body window.',
  ),
  capHoursLower: rule(
    96,
    'hours',
    'judgement',
    'The longest a large dose takes a lower-body compound window.',
  ),
  newLiftDays: rule(
    21,
    'days',
    'direction research, size judgement',
    'A lift is new in its first three weeks (18550979, 30722654, 11528337).',
  ),
  backAfterDays: rule(
    183,
    'days',
    'direction research, size judgement',
    'Six months away makes a lift new again (18550979, 30722654, 11528337).',
  ),
  newLiftHours: rule(
    24,
    'hours',
    'direction research, size judgement',
    'A day more after a new lift (18550979, 30722654, 11528337).',
  ),
  longLengthHours: rule(
    12,
    'hours',
    'direction research, size judgement',
    'Half a day more after long-length or lowering-heavy work (11194107, 20852880).',
  ),
  synergistWeight: rule(
    0.5,
    'of a set',
    'judgement',
    "A synergist's set counts at half toward a muscle's dose (41343037, 28029681, 25807025).",
  ),
  shortNightHours: rule(
    12,
    'hours',
    'direction research, size judgement',
    'Short sleep, high stress or several hard days in a row slow recovery everywhere (35708888, 24343323, 28716692).',
  ),
  shortNightSleep: rule(
    2,
    'check-in sleep (1-5)',
    'judgement',
    'Sleep "Poor" or "Short" reads as a night of 6 hours or less, where strength dips (35708888).',
  ),
  hardDaysRun: rule(
    3,
    'days in a row',
    'judgement',
    'Three or more days running with hard sets, with energy low today, is the whole-body layer (recovery-time-course.md).',
  ),
  tooSoonShare: rule(
    0.75,
    'of the window',
    'judgement',
    '"Too soon" is hard planned work well inside the window: under three quarters of it.',
  ),

  // The first working set (Maintenance 33): the main signal for the day (35038063).
  firstSetDrop: rule(
    0.08,
    'of the rested median',
    'judgement',
    'One session is noisy, about 4% (32681399; SD 4.4%, 15705040): a single day acts only on 8% or more.',
  ),
  firstSetReps: rule(
    12,
    'reps',
    'research',
    'Reserve is judged well only in sets of about 12 reps or fewer, near failure (34542869).',
  ),
  firstSetRir: rule(
    3,
    'reps in reserve',
    'research',
    'Reserve is judged well near failure (34542869).',
  ),
  restedLeast: rule(
    3,
    'sessions',
    'judgement',
    'The fewest rested sessions a median is read from.',
  ),
  restedMost: rule(
    5,
    'sessions',
    'judgement',
    'The most recent rested sessions a median is read from.',
  ),

  // Learned windows (Maintenance 33): learned silently within bounds, listed on the learned page.
  learnLeast: rule(
    5,
    'early and rested sessions each',
    'judgement',
    'Modelled on Bayesian individualisation (27967274): five of each before a window moves.',
  ),
  learnSame: rule(
    0.02,
    'of the rested mean',
    'judgement',
    'Early sessions within 2% of rested ones: the window can shorten.',
  ),
  learnSlower: rule(
    0.05,
    'of the rested mean',
    'judgement',
    'Early sessions 5% or more under rested ones: the window lengthens.',
  ),
  learnStep: rule(12, 'hours', 'judgement', 'A learned window moves by half a day.'),
  learnLeastHours: rule(12, 'hours', 'judgement', 'No window is learned under half a day.'),
  learnMostHours: rule(96, 'hours', 'judgement', 'No window is learned over four days.'),
  learnLeastShare: rule(
    0.5,
    'of the starting estimate',
    'judgement',
    'No window learned under half its estimate.',
  ),
  learnMostShare: rule(
    1.5,
    'of the starting estimate',
    'judgement',
    'No window learned over half as long again.',
  ),

  // The check-in (Maintenance 33, decision 1): against the lifter's own baseline, it lowers what
  // the app expects, never the plan (26423706, 10907753).
  baselineDays: rule(
    28,
    'days',
    'judgement',
    "The lifter's own last four weeks of check-ins are the baseline (10907753: compare to the individual).",
  ),
  baselineLeast: rule(
    5,
    'check-ins',
    'judgement',
    "Fewer than five saved check-ins: the scale's middle is the baseline.",
  ),
  worseSpread: rule(
    1,
    'standard deviations',
    'judgement',
    'An item clearly worse: a spread or more under its baseline (26637525: z = -1 gave 5-9% less).',
  ),
  worseItems: rule(
    2,
    'items',
    'judgement',
    'Two or more items clearly worse act; one alone does not (32957081: single items are not validated).',
  ),
  extremeSleep: rule(
    1,
    'check-in sleep (1-5)',
    'judgement',
    'Sleep "Poor" two check-ins running is the extreme the research names: two short nights (8112265, 29422383).',
  ),
  expectationReps: rule(
    1,
    'reps',
    'judgement',
    'The expectation lowered by one step: a rep (sizes from 26637525, 35708888).',
  ),
  expectationShare: rule(
    0.025,
    'of the expected max',
    'judgement',
    'The expectation lowered by one step: 2.5% (35708888: about 3% after a short night).',
  ),

  // The illness gate (Maintenance 33): research for the gate, judgement for the cap.
  headColdRir: rule(
    2,
    'reps in reserve',
    'judgement',
    'Symptoms above the neck are trainable (9140895, 9813869, 12831664): every set at 2 or more in reserve.',
  ),

  // The new coaching cards' limits (Maintenance 33, the owner's decision 5): direction from the
  // research on alert fatigue, every number the owner's.
  cardsPerDay: rule(
    1,
    'new cards',
    'direction research, size judgement',
    "The owner's decision 5: at most one new card a day (alert fatigue: Ancker 2017; just-in-time support: Klasnja 2019).",
  ),
  cardsPerWeek: rule(
    3,
    'new cards',
    'direction research, size judgement',
    "The owner's decision 5: at most three new cards a week (Ancker 2017; Klasnja 2019).",
  ),

  // The forecast at real lengths (Maintenance 34): each weekday's expected length from the lifter's
  // own sessions on it.
  lengthWeeks: rule(
    4,
    'weeks',
    'judgement',
    "The dose report's rolling four-week window: a weekday's lengths over the last four weeks (training-dose-and-time.md).",
  ),
  lengthSessions: rule(
    3,
    'sessions',
    'judgement',
    'The median of the latest three on a weekday: a change of length shows from its second week (proposal part 2: "adapts within about two weeks").',
  ),

  // The need carried forward (Maintenance 34): a muscle's missing sets this week, filled where the
  // day's plan trains it, within the room its length leaves.
  carryMuscleSets: rule(
    11,
    'sets',
    'direction research, size judgement',
    'Per-session gains plateau at about 11 sets per muscle, from one preprint (Remmert 2025, training-dose-and-time.md): the most a muscle takes in one session with the need carried.',
  ),
  carryLiftSets: rule(
    2,
    'sets',
    'judgement',
    'A lift takes at most two sets more than its own, so each stays within the two to six working sets the roles give.',
  ),

  // What keeps getting cut (Maintenance 34; the proposal's "carry forward what keeps getting cut"):
  // the time fit spares the muscles it cut before.
  cutRunning: rule(
    2,
    'sessions',
    'direction research, size judgement',
    'A muscle the time fit cut in each of the last two sessions is cut twice running: it gives way to any muscle not cut, as the first sets for an under-trained muscle are worth more than a fourth for a covered one (Pelland 2026, 41343037).',
  ),

  // "Longer would help" (Maintenance 34): an inline suggestion beside the length control, never a
  // question (Hussain 2019, 31206159; Kawamoto 2005, 15767266); every number is judgement.
  longerShare: rule(
    0.5,
    'share of the gap',
    'judgement',
    'The next length closes "most" of a muscle\'s gap (proposal part 2) when it gives it at least half of what the week is short.',
  ),
  longerPerDay: rule(
    1,
    'suggestions',
    'direction research, size judgement',
    'At most once a day: prompts once a day or less held their effect (Bidargaddi 2018, 30497999; Bell 2023, 37294612).',
  ),
  longerPerWeek: rule(
    2,
    'suggestions',
    'direction research, size judgement',
    "At most twice in seven days (the proposal's cooldowns; the nudges report: it stays noticeable).",
  ),

  // What the suggestion's answers teach (Maintenance 34, the owner's word of 2026-10-31): taken and
  // trained longer says the time was there; "Not now" says the shorter session was chosen. A pattern
  // over time, never one answer.
  offersWeeks: rule(
    8,
    'weeks',
    'judgement',
    "The answers read are the last eight weeks', two of the dose report's four-week windows, so the pattern moves as the lifter's weeks do.",
  ),
  offersRead: rule(
    4,
    'answers',
    'judgement',
    'The latest four answers to the suggestion make the pattern.',
  ),
  offersPattern: rule(
    2,
    'answers',
    'judgement',
    'A pattern needs two answers of its kind at least: never a lasting reading from one answer (the owner, 2026-10-31).',
  ),
  trainedLonger: rule(
    0.5,
    'share of the step',
    'judgement',
    'Taken and trained longer: the training time reached past halfway from the length it was to the length taken.',
  ),
  chosenPauseDays: rule(
    14,
    'days',
    'direction research, size judgement',
    'A pattern of choosing the shorter session (two "Not now" among the latest answers, two in a row among them) pauses the suggestion two weeks: repeated dismissals lengthen the wait (Rankin 2009, 18854219; the nudges report doubles its week).',
  ),
  limitedPauseDays: rule(
    28,
    'days',
    'judgement',
    'A pattern of time running short after a longer session was taken pauses the suggestion four weeks: offering time the sessions show is not there is advice that cannot be taken (the nudges report: accept rejection, Horvitz 1999).',
  ),

  // The honest goals-versus-time check (Maintenance 34): shown only after weeks below the floor.
  floorSets: rule(
    4,
    'sets a week',
    'research',
    'About 4 hard sets a week for a muscle still grows it (Schoenfeld 2017, 27433992; Iversen 2021, 34125411).',
  ),
  shortWeeks: rule(
    3,
    'weeks',
    'direction research, size judgement',
    'Never one short week: strength holds about 3 weeks (McMaster 2013, 23529287); shown after 3 weeks running below the floor.',
  ),
  materialShare: rule(
    0.25,
    'share of the weekly minutes',
    'judgement',
    "The card comes back only on a material change (Nahum-Shani 2018, 27663578): the weeks' time moved by a quarter or more (the nudges report: above noise).",
  ),
} as const satisfies Record<string, Rule>;

export type RuleId = keyof typeof RULES;
