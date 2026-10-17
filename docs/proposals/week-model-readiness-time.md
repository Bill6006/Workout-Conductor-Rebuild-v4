# The week model, recovery and readiness, time intelligence, item 48 and the schedule watch

_Status: APPROVED for the build. The owner, 2026-10-17: "include the approved recovery/readiness,
time intelligence, Life Mirror item 48 and schedule-watch work". The five decisions at the end carry
recommended defaults; the cloud session's prompt records the owner's answers. Nothing here is built
yet._

The proposal went to the owner in two steps on 2026-10-11 (UTC: the revision went out just after
midnight on the 12th). Both are kept below as delivered. The only changes are personal details made
general, and the pointers to research now naming `docs/research/`.

The evidence behind every number:
- [recovery-time-course.md](../research/recovery-time-course.md)
- [training-dose-and-time.md](../research/training-dose-and-time.md)
- [readiness-and-soreness.md](../research/readiness-and-soreness.md)
- [coaching-nudges-and-cooldowns.md](../research/coaching-nudges-and-cooldowns.md)
- [catch-up-and-second-workout.md](../research/catch-up-and-second-workout.md), for the week model's
  Round M part

Item 48's inspection is [item-48-life-mirror-check-in.md](item-48-life-mirror-check-in.md).

## The owner's brief for the revision (2026-10-11, verbatim)

> I want to continue refining the proposal before any code changes.
>
> First, item 48 is back in scope. I do want Workout Conductor to be able to use my Life Mirror daily
> check-in so I don't have to answer overlapping questions twice.
>
> But don't assume Life Mirror contains everything Workout Conductor needs. Please inspect what Life
> Mirror actually records and propose the best integration.
>
> My expectation is roughly:
> - reuse overlapping signals that Life Mirror already knows;
> - only ask me workout-specific questions that are genuinely missing;
> - don't pretend Life Mirror knows soreness, joint status, or anything else it doesn't actually record;
> - if Life Mirror data is unavailable or stale, Workout Conductor should still work normally;
> - keep the integration read-only from Workout Conductor unless there is a very strong reason otherwise.
>
> Also evaluate how soreness/readiness should affect training. I don't want "I'm a little sore" to
> automatically mean an easier workout if the evidence doesn't support that. Research how soreness,
> actual performance, RIR, pain, recovery, sleep/energy and muscle overlap should be weighted together.
>
> For the schedule/recovery/time proposal you just gave me, I like the overall direction, but I want
> you to evaluate these points rather than treat them as owner-mandated solutions:
>
> - Are fixed 24/48/72-hour recovery windows too rigid? Decide whether they should instead be starting
>   estimates combined with performance, exercise type, soreness, RIR and other recovery signals.
> - For the "longer would help" feature, decide the best UX. I don't want unnecessary interruptions or
>   nagging. A lightweight suggestion such as "45 min would close most of this week's chest gap" may be
>   better than a blocking question, but use your product judgment.
> - Expected workout lengths should help forecast the week, but today's chosen time should always be
>   able to override that forecast immediately.
> - Carry forward the actual training need that was missed, not necessarily the exact exercise that got
>   cut.
> - Any goal-versus-time thresholds, weekly set targets, minimum frequencies, recovery windows,
>   activation thresholds or other numerical rules must be researched and validated before you settle
>   them. Do not simply hard-code the illustrative numbers from the earlier proposal.
> - Make sure warnings or suggestions have sensible cooldowns and only resurface when something
>   materially changes, so the coach doesn't nag me repeatedly.
>
> For ALL training-science decisions here, research the best available evidence before finalizing the
> rule. Prefer systematic reviews, meta-analyses, controlled trials and reputable position stands when
> available. Where evidence doesn't determine a product decision, use your judgment and explain why.

## The revised proposal (as delivered)

Every number below is marked as either research-backed or my own judgement.

### 1. What I still recommend from the original design

- **One shared week model**, read by the planner, the coach, the schedule card, the length advice,
  and now readiness. For each muscle it holds:
  - hard sets done this week;
  - sets the remaining sessions will realistically deliver;
  - recent hard work;
  - the goal's weekly range.

  Nothing in the research changed this.
- **Recovery judged per muscle, not by counting days.** The research confirms it:
  - fatigue stays almost entirely in the trained muscles (Behm 2021);
  - consecutive and non-consecutive training days gave equal gains (da Silva Carvalho 2018), and so
    did 6 versus 3 days a week (Saric 2019).

  A run of consecutive training days on a rotating split is fine unless performance says otherwise.
- **Schedule learning runs the same recovery check** as the fatigue advice, so the two can never
  contradict. Sessions are spaced only where that keeps a muscle's hard work out of its recovery
  window; there are no forced rest days.
- **These four stay, with the changes below:**
  - planning the week at realistic lengths;
  - carrying forward missed work;
  - an honest goals-versus-time check;
  - watching a schedule after it changes.
- **Unchanged:** the day-level time fit, rebalancing on completed sets, and the split rotation.

### 2. What I'd change

**Recovery windows become starting estimates that your own data adjusts.** They depend mostly on how
close sets went to failure and how many there were, then on body region. "Heavy" is the wrong
trigger: 8×3 recovered faster than 8×10 (Bartolomei 2017).

| Hardest sets for the muscle | Upper body | Lower-body compound |
|---|---|---|
| 3+ reps in reserve | about 24 h (research) | about 24 h (research) |
| 1–2 in reserve | about 36 h (judgement) | about 48 h (research) |
| To failure, or long sets near failure | about 48 h (research) | up to 72 h (research) |

- **What lengthens a window** (direction from research, size my judgement):
  - 6 or more hard sets for the muscle;
  - a new exercise or a return after months off;
  - stretch-focused work such as Romanian deadlifts.
- **What adjusts it:** your first working set against your recent sessions. One session is noisy
  (about ±4%), so a single day acts only on a drop of 8% or more. Over time the app learns your own
  windows within bounds.
- **People differ widely.** In one large study, the same session left some people at 82% strength and
  others at 42% (Damas 2016).
- **Soreness does not adjust windows.** It tracks lost strength poorly (Nosaka 2002).
- **"Too soon" fires only for hard planned work** well inside the window, or when your first set
  confirms it. It offers a lighter option with one tap; it never blocks, and light work is never
  flagged.

**A readiness model, in order of authority:**

1. **Illness is a gate.** With fever or whole-body symptoms, no session. Above-the-neck symptoms are
   trainable (Weidner 1997; Dick 2014).
2. **Pain is a gate, exercise by exercise.** Sharp, sudden or worsening pain stops that exercise.
   Known pain is fine at 5/10 or less if it settles by next morning (Thomeé 1997; Silbernagel 2007).
3. **Today's first-set performance is the main signal** (Hickmott 2022). When easing, keep the load
   and add a rep in reserve or drop a set: strength gains were similar whether sets stopped closer to
   failure or further from it (Robinson 2024).
4. **Recent hard work on the same muscle.**
5. **Check-in items** (sleep, stress, energy, mood, motivation), compared with your own baseline.
   - They act only when two or more are clearly worse, or one is extreme, such as two short nights.
   - Even then they lower what the app expects from you, not the plan (Saw 2016; Craven 2022: about
     3% strength after one short night, upper body unaffected).

**"Longer would help" is an inline suggestion, never a question.** It sits next to the length
control: "45 min would close most of this week's chest gap · Use 45 min".
- **When it appears:** only if a priority muscle is projected below your goal's range, today's split
  trains it, recovery allows, and fatigue isn't high.
- **What it teaches:** tapping it says you had time; "Not now" says you chose. That replaces asking
  you every day. Blocking pop-ups are the least-accepted kind of alert (Hussain 2019; Kawamoto 2005).

**Expected lengths forecast the week; today's choice overrides immediately.** The forecast weighs your
last few weeks by weekday, so it adapts within about two weeks if you start training longer.

**Carry forward the need, not the exercise.**
- **What carries:** a muscle's missing hard sets, filled by whatever exercise fits next time, within a
  per-session limit (about 11 sets per muscle, from one not-yet-peer-reviewed study, so judgement).
- **Expiry:** a need ends with the week (judgement). One short week costs little (Coleman 2024; Hwang
  2017), so the app shouldn't build up a debt.

**Every number lives in one table with its source and evidence status,** later tuned from your logs:

| Rule | Value | Basis |
|---|---|---|
| Muscle growth, sets per muscle per week | Floor 4; near-full 10–20; beginners 6–10 | Research; beginner range is judgement |
| Strength | 2–3 hard sets per main lift per session, twice a week | ACSM 2026 |
| Maintenance | One session a week with loads kept | Bickel 2011; Spiering 2021 |
| Minutes per set, including rest | About 2 to 2.5 | Schoenfeld 2019 |
| Honest "too little time" message | Only after 3+ consecutive weeks below your goal's floor | Strength holds about 3 weeks (McMaster 2013) |

**Schedule watch.**
- Four weeks against four weeks can detect about a 5% drop, but only if it shows in two or more lifts
  and persists after a few easier days.
- Stalls can't be judged over 4 weeks, since the noise outweighs gains of about 1% a month; only over
  8–12 weeks.

**Cooldowns** (direction from research, every number my judgement):
- one coaching card on screen at a time;
- at most 1 new card a day and 3 a week;
- a "longer would help" suggestion at most twice a week, expiring at session start;
- a card you dismiss stays gone until its recommendation itself changes, never because time passed
  (Ancker 2017; Klasnja 2019);
- repeated dismissals lengthen the wait, and you can turn a card type off in Settings.

### 3. How item 48 fits

- **The read path.** Workout Conductor reads Life Mirror's check-in from the shared cloud database,
  read-only, and only when both apps point at the same database. Opening Life Mirror's on-phone
  database directly could block or even damage Life Mirror, so I've ruled that out.
- **What it reuses:**
  - **energy:** today's latest check-in, an exact match;
  - **sleep:** hours and quality, from this morning's check-in only;
  - **stress and mood:** today's check-ins;
  - **motivation:** a weak hint only, since Life Mirror asks about the general "pull to do things".

  Life Mirror's daily history also gives far better personal baselines than occasional workout
  check-ins.
- **What it still asks:** soreness (local only), pain and joints (the gate), illness (the gate), and
  time today. Life Mirror records none of these, and Workout Conductor never pretends otherwise.
- **If data is missing or stale:** today's normal check-in, without comment. Values that do come from
  Life Mirror are labelled ("from Life Mirror, 07:40") and can be changed with one tap.
- **Privacy.**
  - Life Mirror's own rules don't list Workout Conductor as a recipient.
  - So I'd add a switch in Workout Conductor that stays off until you turn it on, plus a disclosure
    line in Life Mirror once its clean window allows edits.
  - Workout Conductor keeps only the numbers it uses, never notes or other private items.

### 4. Where I disagree

- **Soreness shouldn't adjust recovery windows.** The evidence says it's a poor marker. It stays a
  local tie-break that only flags a lift when it limits your range of motion.
- **Today's readiness rules contradict the evidence.** A single answer of 2 or below for energy, sleep
  or motivation already cuts a set; soreness at 4 or above does too. I'd change both, but that alters
  behaviour you approved before, so it needs your yes.
- **Your length choices shouldn't silently become "your available time".** That's copying the habit.
  Forecasts use them, but goals don't bend to them; your taps on the suggestion reveal spare time.
- **A 4-week stall check isn't possible.** The noise is too large, so I'd watch for declines only.
- **I'd skip heart-rate variability and bar velocity.** Heart-rate-guided training showed no benefit in
  resistance training, and there's no bar sensor.

### 5. Implementation order

1. Finish and ship Round L (three small fixes left).
2. Round M (items 12, 32). It builds the week model.
3. Round N (item 11), as agreed.
4. Recovery and readiness core: per-muscle estimates, the first-set check, the gates, and replacing
   the day-count fatigue rule. The schedule card then uses the same check.
5. Time intelligence: the forecast at real lengths, carrying the need forward, the "longer would help"
   suggestion with cooldowns, and the honest goals-versus-time check.
6. Item 48: reading Life Mirror (after step 4, which defines how its data is used).
7. Schedule watch. It needs 8+ weeks of data after a move, so it switches on last.

## The owner's decisions (recommended defaults)

The cloud session's prompt carries the owner's answers. Where the prompt is silent, these defaults
apply.

1. **Change today's readiness rules** (single low answers and soreness >= 4 cutting a set): **yes**,
   to the readiness model above. This changes behaviour the owner approved before, so it needs the
   owner's yes.
2. **"Too soon":** **warn, with a one-tap lighter option** (rather than easing automatically). It
   never blocks.
3. **Muscle-growth top tier:** **20 sets a week by default**, with higher as an opt-in.
4. **The item 48 switch:** **off until the owner turns it on.**
5. **Card limits:** **1 new card a day and 3 a week**, and "Not now" skips that muscle for the week.

## The research reports' other questions, and how they are settled

Each report listed questions the evidence could not settle alone. The approved proposal settles
most; the rest follow the project's rule (evidence first, then stated product judgement, written
down). None needs the owner unless marked.

| Question | Settled as | By |
|---|---|---|
| Recovery: "too soon" warns, eases or blocks | Decision 2 | Owner |
| Recovery: strength or size first | The profile's own goals and style, as today | Existing behaviour |
| Recovery / readiness: bar velocity | Not used (no sensor) | Proposal, part 4 |
| Recovery: learned windows silent or shown for approval | Learned silently within the bounds (12–96 h, 0.5–1.5× the prior), and listed on the learned page (item 47) | Judgement, following item 47's pattern |
| Recovery: the schedule-watch trigger (about 5% in 2+ lifts, persisting after a few easier days) | As proposed; stalls only over 8–12 weeks | Research (recovery report) |
| Recovery: ask sleep, stress and recovery daily | No new daily questions; the check-in stays optional; item 48 supplies sleep, stress and mood when available | Proposal, part 3 |
| Recovery: synergists at half or per exercise | Half (indirect sets count 0.5) | Research (Pelland 2026) |
| Recovery: allow early re-exposure so windows can shorten | Yes: "too soon" never blocks, and the lifter's own early sessions teach the window | Proposal, part 2 |
| Dose: top hypertrophy tier 20 or about 30 | Decision 3 | Owner |
| Dose: strength credit for indirect sets | 1.0 for the same movement pattern, 0.5 at most otherwise | Dose report's recommendation (judgement) |
| Dose: older-adult age and "trained" | Use the profile's optional `age` and its `experience`; with no age given, no age rule. The cutoff follows the cited evidence (most use 65) | Evidence rule |
| Dose: default rest 90 s or 2 min | The app's existing per-role rests, refined by the lifter's learned pace (item 4) | Existing behaviour |
| Dose: supersets and drop sets for the time-short | Unchanged: the existing time fit (Maintenance 24's research) | Existing behaviour |
| Dose: shortfall window 3 or 4 weeks | 3 consecutive weeks below the goal's floor | Proposal's table |
| Dose: a health goal by days or minutes | The app has no health goal; nothing to settle | n/a |
| Readiness: ship judgement thresholds, tune from logs | Yes; every number in the one sourced table | Proposal, part 2 |
| Readiness: check-in changes the plan, or only the expectation | Only the expectation. Illness and pain are gates and do change the plan | Proposal, part 2; decision 1 |
| Readiness: severe soreness limiting range of motion | Flag the lift, let the first work set decide, offer a variation swap (never automatic) | Readiness report |
| Readiness: a head cold | Trainable, capped at 2+ RIR | Readiness report (the cap is judgement) |
| Readiness: when to suggest a clinician | Item 45's existing pain-pattern behaviour (observational, never diagnostic); no new clinical advice without the owner's word | Existing behaviour |
| Nudges: "Not now" scope | Decision 5 | Owner |
| Nudges: 1 a day and 3 a week | Decision 5 | Owner |
| Nudges: positive close-out cards | Not built (not in the approved proposal) | Scope |
| Nudges: a "Coach notes" list of dismissed cards | Not built (not in the approved proposal) | Scope |
| Nudges: "Don't show this kind" per type or per subject | Per card type, in Settings | Proposal, part 2 |
| Nudges: forecasts proactive or only on request | The honest goals-versus-time card, shown once after 3+ weeks below the floor, again only on a material change | Proposal, part 2 |

## Background: the first proposal (2026-10-11, as delivered)

The owner liked its direction and asked for the revision above. Where they differ, the revision
wins. Its two questions were settled by the revision: "Have the time?" became an inline suggestion,
never a question; and the order is Round M, Round N, then this work.

**My recommendation:** build one shared model of your week and recovery, and run the planner, the
schedule card, the fatigue advice and the length advice through it. Today each of those reasons on its
own, and that is why they can contradict each other.

**What already works well enough (keep)**
- **Fitting a day to the time you pick.** Main lifts stay, duplicated isolation work goes first, rests
  and sets are trimmed, minutes left over bring work back, and the timing uses your own pace.
- **Rebalancing on what you actually finished.** Weekly counts, priorities and progression all read
  completed sets.
- **The split rotation.** Each day avoids muscles trained in the last two days, so four days in a row
  on a push/pull/lower/upper rotation is already reasonable for recovery.
- **The fatigue signals that measure fatigue:** reps in reserve falling below target, hard or painful
  ratings, and your check-in.

**Foundation: one week model.** For each muscle it would hold:
- sets done this week (Monday to Sunday, the same week the schedule card reads);
- sets the remaining sessions will realistically deliver, at your real session lengths;
- when it was last trained hard, and how hard;
- the weekly range your goal needs.

Round M's agreed catch-up and second-workout items (12 and 32) need most of this already, so I'd
build it once, there.

**A. Recovery judged per muscle, not by counting days.** Drop the points for "3–4+ days in a row" and
"4–5 sessions in 7 days". Flag recovery only when a muscle comes back hard inside its recovery window,
or when your performance, reps in reserve, ratings or check-in show it. (The revision replaced the
fixed windows with starting estimates.) A very long run, six or seven days without a day off, still
gets a gentle note, because sleep and life stress aren't measured; it's a note, not a recovery
problem.

**B. Schedule learning that uses the same recovery check.**
- **No contradiction by construction.** Before proposing days, simulate the week with your split and
  check each muscle's spacing using A. If your real days are sound, propose them as they are. If not,
  first reorder the split across those days; only if that fails, suggest moving a day, and say why.
- **Spacing without forced rest.** With more available days than sessions, place sessions for the
  best recovery, not on the first days of the week. With sessions equal to available days, keep them
  and let the rotation do the work.
- **Watch after a move.** Compare the weeks after a schedule change with the weeks before. If it's
  clearly worse than normal week-to-week noise, show one card with the old schedule one tap away. If
  not, stay silent. (The revision set the windows and the threshold.)

**C. Time available versus time chosen.**
- **When short is fine.** If the rest of the week, at realistic lengths, reaches every priority
  muscle's weekly range, 15 or 30 minutes is fine and nothing is said. Suggest longer only when a
  priority muscle is projected short, today's split trains it, its recovery allows, and fatigue isn't
  high (then shorter still wins).
- **Carry forward what keeps getting cut.** Store what the time fit left out of each workout. A muscle
  cut last time is protected next time. If a muscle is cut twice running, trim a set from an already
  well-covered muscle instead: the first sets for an under-trained muscle are worth more than a fourth
  set for a covered one (Pelland 2026). Rotate which isolation move goes, so no muscle loses every
  short day.
- **Plan the week at your real lengths.** The week ahead, and the coach's "a later session will cover
  it" check, use your expected length for each day instead of Default.
- **Adapt quickly to more time.** Expected lengths weigh the last three or four weeks.

**D. An honest goals-versus-time check.** Compare the weekly sets your real time delivers with what
your goal needs; if clearly below for several weeks, one plain card says so, with options. It's shown
once, and again only if things change. (The revision set the numbers.)
