# Coaching nudges: prompt burden, blocking versus suggesting, resurfacing and cooldowns

_Research report, 2026-10-11, for the coach's cards, the 'longer would help' suggestion and cooldowns. Carried into the repository on 2026-10-17 for the cloud handoff (docs/handoff/CLOUD_HANDOFF.md). EB = evidence-based, PJ = product judgement._

The raw notes and saved abstracts stayed on the working machine and are not in the repository; every claim below cites its PubMed ID (or DOI) so it can be checked again.

## Bottom line
- **What wears a message out is repetition and volume, not time.** Prompts sent 4–5 times a day faded within weeks; once a day or less showed no significant fade over 30–89 days. Repeats about an unchanged situation are rarely acted on.
- **Never block for coaching:** interrupting pop-ups are accepted least. Use inline cards at natural pauses; prefill session length.
- **Bring a card back only when its advice would change, not on a timer.**
- **Aim bad news at the training, not the person, and pair it with one doable step.**
- **Evidence gives direction, not numbers;** every cap below is product judgement.

## 1. Prompt burden and habituation
- **Micro-randomized trials:** HeartSteps suggestions first raised steps 66%, then faded (Klasnja 2019); four texts a day helped mainly in days 1–30 (Golbus 2024); once a day or less held for 30 days (Bell 2023), with no significant decline over 89 days (Bidargaddi 2018).
- **Recent prompts weaken the next one:** HeartSteps V2 models a decaying dose (Liao 2020, full text). Its constants (0.95 decay, 0.2 clip) belong to a yes/no send decided five times a day, so I didn't reuse them.
- **Relevance beats volume:** random daily texts did no better than a weekly control; algorithm-chosen texts raised steps 19% (Aguilera 2024).
- **Clinical alerts:** acceptance fell 30% per extra reminder per visit and again with repeats, not with time (Ancker 2017); alerts about a drug already given: acceptance OR 0.03 (Isaac 2009).
- **Habituated responses** recover at least partly after a pause, re-habituate faster each cycle, and are stimulus-specific (Rankin 2009).
- **Strength: moderate.** Cross-study comparisons; no strength-training app tested.

## 2. Blocking question vs lightweight suggestion
- **Blocking alerts:** interrupting pop-ups were accepted least (Hussain 2019); when only critical alerts interrupted, 67% were accepted (Shah 2006); hard stops work but cause workarounds and delays (Powers 2018).
- **Passive advice can be ignored** (Lo 2009); it works as a recommendation at the point of decision (Kawamoto 2005).
- **Interruptions:** interruptions of a few seconds doubled errors in sequential tasks (Altmann 2014). Deferring to natural pauses cut frustration (Iqbal 2008).
- **Asking vs acting:** asking is worth less than acting on a preference the system already knows (Horvitz 1999).
- **Self-determination theory (SDT):** autonomous motivation predicts exercise adherence (Teixeira 2012). SDT-based interventions have small effects (d=.23; Sheeran 2020).
- **Wording:** forceful wording provoked resistance to weight-lifting messages (Quick 2008) and anger at exercise messages (Dimmock 2020); softer wording alone did little (Altendorf 2019; St Germain 2024); a real choice helped (Smit 2019).
- **Defaults:** d=0.68 but widely varying (Jachimowicz 2019); a bias-corrected re-analysis found no overall nudge effect and undecided evidence for structural nudges such as defaults (Maier 2022).
- **Strength:** moderate for avoiding pop-ups and pressure; low to moderate for defaults.

## 3. When to resurface
- **Snoozing:** lengthening an alert's snooze from 1 to 3 hours didn't change alert volume (Hentzen 2022).
- **Meaningful change:** Nahum-Shani 2018 treats a change as meaningful when it alters which option to recommend, and lists "provide nothing" as a valid option. HeartSteps V2 triggers on a sensed state, within a daily budget (Liao 2020).
- **Cues vs reminders:** cues tied to events built habit, while reminders hindered it (Stawarz 2015).
- **Repetition:** repeated feedback delivery was associated with smaller effects (Ivers 2026).
- **Design guidelines:** easy dismissal, memory of recent interactions, cautious adaptation, global controls (Amershi 2019); time out and accept rejection (Horvitz 1999).
- **Strength: low.** No trial compares change-based with timer-based resurfacing.

## 4. Honest, unwelcome feedback
- **Feedback can backfire:** it helps on average (d=.41), but over a third of interventions lowered performance, more so as attention moved to the self (Kluger 1996).
- **Monitoring progress helps** (d=.40; Harkin 2016), more so when paired with another self-regulation technique (.42 vs .26; Michie 2009).
- **What makes feedback work:**
  - Room to improve, and an action plan (Ivers 2026).
  - Actions the person controls; short messages with optional detail; credibility; nothing that invites defensiveness (Brehaut 2016).
- **Framing:** "what's left" framing suits committed people (Koo 2008).
- **Avoidance:** people avoid progress data that is poor, upsetting or untrusted (Chang 2017), and exaggeration backfires (Dimmock 2020).
- **Goal resets:** letting go of unattainable goals and re-engaging elsewhere goes with higher well-being (Wrosch 2003).
- **Strength: moderate.** Few studies test exact wording.

## Recommended policy
EB = evidence sets the direction; PJ = product judgement (reason given).

**Message types**
- **Today suggestion** (session length that closes a weekly muscle gap): before the session, beside the duration control; expires at session start or midnight. At most 1/day and 2 per 7 days (PJ: stays noticeable).
- **Pattern note** (fatigue/schedule): after the session or on Home; at most 1 per 7 days (PJ: needs a week of data).
- **Forecast note** (goal pace): week summary or after an edit; at most 1 per 14 days (PJ: pace moves slowly).
- **Positive close-out:** once per event, lowest priority (PJ; Williams 2011).
- **All cards:** one visible at a time (EB: Ancker 2017); at most 1 new/day and 3 per 7 days (PJ: where effects held); priority Today > Pattern > Forecast > Positive (PJ).

**Dismissal**
- **A dismissed card whose situation hasn't changed never returns** (EB: Isaac 2009, Ancker 2017, Hentzen 2022).
- **"Not now"** (PJ): a Today card skips that muscle this week, and two in a row pause Today cards for 7 days. A Pattern or Forecast card returns once, at least 3 days later, then counts as "Got it".
- **"Got it":** hidden until a material change, for at least 14 days (Pattern) or 28 (Forecast) (PJ: two data cycles).
- **Repeat dismissals** double the minimum wait; after 3, the card retires until its band changes (EB: Rankin 2009, Ivers 2026; doubling is PJ).
- **Seen but untouched:** collapses, returns once, then counts as "Not now" (PJ: Horvitz-style time-out).
- **"Don't show this kind":** off until re-enabled in Settings (EB: Amershi 2019).

**Material change** (principle EB: Nahum-Shani 2018; thresholds PJ). Any of:
- the recommended action changes (muscle, duration step, schedule fix, goal option);
- the band changes, including improvement (pace: on track, slow, stalled);
- the owner edits an input the card uses (goal, date, weekly time, training days), which resets its memory (EB: Amershi 2019);
- a forecast moves at least 25% or 4 weeks (PJ: above noise; tune).

It must hold for two consecutive checks (PJ: no flicker). Time alone never counts.

**Card memory** (per type and subject, synced; PJ): last shown, view count, dismissal kind and count, and a snapshot of band, action and rounded numbers.

**Display**
- **No coaching pop-ups;** only irreversible or safety actions may block (EB: Hussain 2019, Shah 2006, Powers 2018).
- **Natural pauses only:** before or after the session, or the week summary; never between sets (EB: Altmann 2014, Iqbal 2008).
- **Session length** prefilled from the owner's usual; the card offers one-tap "Use 45 min"; ask only without history (EB: Horvitz 1999, Kawamoto 2005).
- **Wording:** no "should/must" or hype; 2–3 choices including "Keep as is"; numbers about the training plus one step; "Why?" shows data, rule, range and source (EB: Quick 2008, Smit 2019, Kluger 1996, Brehaut 2016, Amershi 2019).
- **Example:** "At 2 h/week, goal X projects to about March (Feb–May); at 3 h/week, about January. [Adjust time] [Adjust goal] [Keep as is] · Why?"

## Questions for the owner
1. "Not now": today or this week; one return or none?
2. Are 1/day and 3/week right, or lower?
3. Positive close-outs at all?
4. Keep dismissed cards readable in a "Coach notes" list?
5. "Don't show this kind": per type or per subject?
6. Forecasts proactive, or only in Goals?

Not owner questions (they need an exercise-science check): fatigue bands, how long raised fatigue lasts before the advice changes, and what weekly set shortfall matters.

## Sources verified
**PubMed (abstract read; "full" means I also read the full text):** Klasnja 2019 (30192907); Liao 2020 (34527853, full); Golbus 2024 (38887953); Bell 2023 (37294612); Bidargaddi 2018 (30497999); Aguilera 2024 (39378080); Ancker 2017 (28395667); Isaac 2009 (19204222); Rankin 2009 (18854219, full); Nahum-Shani 2018 (27663578, full); Hussain 2019 (31206159); Shah 2006 (16221941); Powers 2018 (30239810); Lo 2009 (18952945); Kawamoto 2005 (15767266); Altmann 2014 (23294345); Teixeira 2012 (22726453); Sheeran 2020 (32437175); Quick 2008 (18850395); Dimmock 2020 (31896074); Altendorf 2019 (30834136); St Germain 2024 (39589568); Smit 2019 (31670693); Maier 2022 (35858389, full); Hentzen 2022 (40046597); Ivers 2026 (42325158); Harkin 2016 (26479070); Michie 2009 (19916637); Brehaut 2016 (26903136, list read via Foster 2021, 34404449); Koo 2008 (18211171); Chang 2017 (28228740); Wrosch 2003 (15018681); Williams 2011 (21321008).

**Web, not in PubMed (DOIs checked on Crossref):** Amershi 2019 (10.1145/3290605.3300233, full); Horvitz 1999 (10.1145/302979.303030, full); Iqbal 2008 (10.1145/1357054.1357070, full); Stawarz 2015 (10.1145/2702123.2702230, abstract); Kluger 1996 (10.1037/0033-2909.119.2.254, abstract); Jachimowicz 2019 (10.1017/bpp.2018.43, abstract).
