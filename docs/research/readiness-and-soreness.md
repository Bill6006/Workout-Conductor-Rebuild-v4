# Readiness: soreness, performance, RIR, pain, illness, sleep and stress

_Research report, 2026-10-11, for the readiness model and item 48. Carried into the repository on 2026-10-17 for the cloud handoff (docs/handoff/CLOUD_HANDOFF.md). EB = evidence-based, PJ = product judgement._

The raw notes and saved abstracts stayed on the working machine and are not in the repository; every claim below cites its PubMed ID (or DOI) so it can be checked again.

## Bottom line
- Mild or moderate soreness should NOT ease the session.
  - Soreness tracks damage and strength loss poorly (Nosaka 2002 12453160; Warren 1999 10028132).
  - Repeat bouts on sore muscle add no damage (Nosaka 2002 11834116; Chen 2001 11581559).
  - Frequency is neutral for growth (Schoenfeld 2019 30558493).
  - DOMS correlated r = -0.33 with next-session volume in trained lifters (Goulart 2021 32594858).
- **Today's performance against the plan is the best readiness signal** (reps at target RIR, e1RM, velocity).
  - Autoregulation is >= fixed loading (Hickmott 2022 35038063, SMD 0.21 NS; Zhang 2021 33776802).
  - Strength gains are similar across RIR (Robinson 2024 38970765); keep the load and add RIR or trim a set.
- **Illness and pain are gates.**
  - Fever or below-the-neck symptoms: no session (Dick 2014 24790692; Schwellnus 2022 35863871).
  - Above the neck only: train (Weidner 1997 9140895; 1998 9813869; Metz 2003 12831664).
  - Known pain is trainable at <=5/10, settled by next morning (Thomee 1997 9413448; Silbernagel 2007 17307888).
  - Sharp, localized, snap, swelling, or pain rising set to set: stop that exercise (Mueller-Wohlfahrt 2013 23080315).
- **Sleep and stress have small effects.**
  - Strength -2.85% after <=6 h; lower body -3.4%; upper body NS; strength-endurance -9.9% from an unstable estimate; morning sessions largely spared (Craven 2022 35708888).
  - Max force SMD -0.35 (Kong 2025 40236824).
  - Consecutive short nights matter more (Reilly 1994 8112265; Knowles 2018 29422383).
  - Mental fatigue cuts reps to failure, g = -0.39 (Solon-Junior 2026 42168782).
  - Life stress slows gains and recovery (Bartholomew 2008 18545186; Stults-Kolehmainen 2014 24343323).
- **Wellness questionnaires:** they track load better than biomarkers (Saw 2016 26423706). Individual prediction of a session is weak to moderate (Gallo 2016 26637525: z = -1 gave -5 to -9%; Govus 2018 trivial; Brasch 2019 none; Munteanu 2026 42177355). Perceived fatigue is the best item (Thorpe 2017 27918668). Single items are not validated (Jeffries 2020 32957081). Compare to the individual's baseline (Hopkins 2000 10907753).
- **RIR accuracy:** lifters underestimate by about 1 rep; accuracy is good near failure, at <=12 reps and in later sets (Halperin 2022 34542869); errors are large far from failure in long sets (Zourdos 2021 30747900); 0.65 rep at 1-3 RIR on the bench (Refalo 2024 37967832).
- **HRV-guided resistance training:** no benefit (De Oliveira 2019 30702985; Bittencourt 2024 39742158). Not worth adding.

## Recommended decision model (order of authority)
1. **Illness gate.** Fever or whole-body symptoms: no session; resume gradually. Above the neck: train at >=2 RIR (2 RIR is judgement).
2. **Pain gate.**
   - Acute sharp or localized pain, a snap, swelling, pain rising set to set, or red flags: stop that exercise and continue pain-free work.
   - Known pain: <=5/10 and settled by next morning (evidence).
   - If exceeded, next time change the variation or range of motion, then the load, then remove the exercise (order is judgement).
3. **Today's performance (main signal).** Compare the first work set of the main lift with the lifter's recent baseline. Use only sets of <=12 reps at <=3 RIR (evidence for accuracy).
   - Within +/-1 rep (about +/-3% e1RM): noise (judgement, from the ~1-rep RIR error).
   - 2+ reps (about 5%) under: keep the load and add 1 RIR, or drop the last set. If the next main lift is also down, cut one set per exercise (judgement; keeping the load follows Robinson and Spiering).
   - 2+ reps over: +2.5-5% (judgement).
4. **Recent hard work on the same muscle** within 24-48 h lowers the expectation slightly (evidence). Assisting muscles count at 0.5 (extrapolated from Pelland).
5. **Check-in signals** (sleep, stress, energy, mood, motivation, soreness) against the lifter's own 4-week baseline.
   - Act only when 2+ items are at least 1 SD worse, or one is extreme (e.g. <5 h sleep for two nights).
   - The action lowers the EXPECTED first-set result by one step (1 rep or 2.5%), not the plan.
   - Soreness alone never counts. Thresholds are judgement; sizes are evidence-informed (Gallo, Craven).
6. **Trend.** Session RPE 2+ above plan for two sessions while performance falls: offer a lighter week (judgement).

## Owner questions
1. Ship the judgement thresholds and tune them from logs?
2. Should the check-in ever change the plan before the first set, or only the expectation?
3. Severe soreness limiting range of motion: swap automatically, or ask?
4. A head cold: as planned, or capped at >=2 RIR?
5. After how many sessions of reported pain should the app suggest a clinician?
6. Bar-speed input? (Probably no.)

## Soreness: the app line
- Never reduces the plan by itself.
- If severe soreness limits range of motion in today's main muscle: flag the lift and let the first work set decide; swap the variation if range is restricted.
- Don't frame soreness as weakness: being told to expect soreness cut reps (McLemore 2020 33467255).
- A new exercise explains soreness, not low readiness.
