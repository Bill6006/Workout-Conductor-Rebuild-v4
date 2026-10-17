# Item 11: top set plus back-off sets

_Research report, 2026-10-10, for Round N (Maintenance 32). Carried into the repository on 2026-10-17 for the cloud handoff (docs/handoff/CLOUD_HANDOFF.md). EB = evidence-based, PJ = product judgement._

The raw notes and saved abstracts stayed on the working machine and are not in the repository; every claim below cites its PubMed ID (or DOI) so it can be checked again.

**Method.** I searched PubMed through E-utilities with curl, run unsandboxed. I read the abstract of every PMID under "Verified" below on 2026-10-10. Where a PMC full text existed and mattered, I read that too; those are marked [FT]. No code was changed.

To fit the design to the app, I read `src/engine/progression/roles.ts`, `src/engine/planning/styles.ts` and `docs/progression-engine.md`.

What the app does today for primary-strength under Hybrid, Strength focus and Lean-down:
- 4 working sets in the strength range (default 4–6), all at RIR 2, 150 s rest.
- The strength rule adds one increment when every set clears the floor with reps in reserve.
- Stall detection reads the best set's Epley e1RM, using a per-lift constant.


## Bottom line
1. **No trial compares the two structures directly.** No study pits top set + back-offs against straight sets with volume and effort matched. Every related comparison found no difference in strength or hypertrophy: ascending and descending pyramids, DeLorme vs Oxford, and planned load drops. The samples were small. On outcomes, the evidence cannot tell the two structures apart.
2. **The evidence does support the reasoning behind the design.** Heavy loads build 1RM. Hypertrophy does not depend on load when effort is high enough. Failure is unnecessary and costly. Load must come down across sets to hold a target RIR.
3. **Some parameters have trial use; the rest are coaching convention.** In trials: one top set at RPE 8–9.5, back-offs anchored to that day's top-set load and 2–20% lighter, and back-off effort from about RPE 6.5 up to the top set's own RPE. Everything finer than that is convention.
4. **Recommendation.** Use it for the primary-strength role under Hybrid, Strength focus and Lean-down, and keep straight sets everywhere else. Drive both the load step and e1RM from the top set; the back-off loads follow it.

## Q1. Outcomes against straight sets and related schemes

**Close comparisons (all found no difference):**
- **Angleri 2017**, Eur J Appl Physiol, PMID 28130627. 32 well-trained men; legs randomized within each subject; 12 weeks; volume equated.
  - Arms: traditional 3–5 sets × 6–12 reps at 75% 1RM; crescent (ascending) pyramid 3–5 × 6–15 at 65–85%; drop sets.
  - Muscle cross-section (CSA): +7.6%, +7.5%, +7.8%. Leg-press 1RM: +25.9%, +25.9%, +24.9%. Leg-extension 1RM: about +16–17% in all arms.
- **Angleri 2022**, Int J Sports Med, PMID 34100277. Individual responses from the same trial. CSA responses were the same. For leg-press 1RM, 4 of 15 responded more to the pyramid, 1 to traditional, and 10 equally. The authors suggest some people gain more from the heavier-load protocol. This is hypothesis-level.
- **Ribeiro 2017**, J Strength Cond Res, PMID 27749731: 25 older women, crossover, 8-week phases.
- **Ribeiro 2018**, J Strength Cond Res, PMID 29120984: 33 resistance-trained older women, 8 weeks.
  - Both compared 3×8–12RM at constant load with 12/10/8RM ascending. Strength and muscle mass changed equally.
  - The same comparison was also equal for muscle quality, phase angle and oxidative stress (PMIDs 26972635, 28394730, 28422533).
- **Fish 2003**, Am J Phys Med Rehabil, PMID 14627926. 50 participants (training status not stated); randomized; evaluator-blind; 9 weeks of knee extension, 3×10 based on a weekly 10RM.
  - DeLorme works up to the 10RM. Oxford starts at the 10RM and removes weight, which is a top set + back-off scheme.
  - 10RM gains: +71.9 vs +67.5 kg, not significant. 1RM change also not different.
- **Eifler 2016**, J Strength Cond Res, PMID 26670986. 200 recreationally trained people (12 months or more); 6 weeks.
  - Constant, increasing, and decreasing load (with more reps) did not differ. Daily-changing load beat all three.
  - The abstract does not say whether load changed across sets or across sessions, so I give it low weight.
- **Lima 2018**, Int J Sports Physiol Perform, PMID 29584518. 21 moderately trained men; 16 weeks; curls, 3 sets to fatigue.
  - First set at 10RM, then −5% or −10% for sets 2–3, against a constant load.
  - Muscle thickness and 10RM gains were the same. The −10% arm rated effort lower (RPE 6.8 vs 7.0–7.3).

**Adding lighter work after heavy work.** These trials compare added sets against fewer sets, not against straight sets:
- **Androulakis-Korakakis 2021**, Front Sports Act Living, PMID 34527944 [FT]. Intermediate-to-advanced powerlifters; 6 weeks.
  - Study 3: a daily-max single at RPE 9–9.5 (n=8) vs the same plus 2×3 at 80% of the single (n=8). Probability of a meaningful gain in total: 6.3% vs 99.6%.
  - Study 4: single + back-offs (n=5) vs one AMRAP set at 70% to RPE 9–9.5 (n=4). Probability of a meaningful gain: 98% (after updating with Study 3) vs 41%.
  - Back-offs were logged at RPE 6.2–6.7. Soreness was 1.0–1.1 out of 5, against 2.1 for AMRAP.
  - **Androulakis-Korakakis 2018**, Sports (Basel), PMID 30158433: a pilot in 10 powerlifters; singles alone gave mixed results.
- **Goto 2004**, J Strength Cond Res, PMID 15574075. 16 men; 4 weeks of 5 sets at 90% 1RM, with or without one light high-rep set straight after. The added set gave larger leg-press 1RM, isokinetic strength and endurance gains. CSA showed a trend (p=0.08).
- **Drop-set relatives** (heavy set, then descending loads with no rest):
  - **Ozaki 2018**, J Sports Sci, PMID 28532248: 9 untrained men; one 80% set plus drops matched 3×80% for CSA and 1RM.
  - **Zeng 2025**, Front Physiol, PMID 40980811 [FT]: 80% to failure, then 65/50/40/30%, beat 5×10 at 67% not to failure on 1RM. Confounded by effort.
  - Neither is a top-set design.

**Reviews:**
- **Cardozo 2023**, J Bodyw Mov Ther, PMID 37330772. 15 studies, 9 of them longitudinal. Pyramids were not superior, but the evidence only covers 8–12 reps at 67–85% 1RM.
- **Tsartsapakis 2026**, J Funct Morphol Kinesiol, PMID 41718208 [FT]. 23 studies of advanced systems: strength g=0.35, hypertrophy g=0.05 (not significant). Its only pyramid study was Angleri 2017, so it says nothing specific about pyramids.
- **Krzysztofik 2019**, IJERPH, PMID 31817252 [FT]: again only Angleri for pyramids.
- **ACSM 2026 position stand**, Currier, Med Sci Sports Exerc, PMID 41843416 [FT].
  - Set structure "did not consistently impact" outcomes.
  - Its set-structure evidence came from reviews of cluster sets and rest redistribution (Jukic 2021, PMID 33417154), complex/contrast power training (Marshall 2021, PMID 33666895), and drop sets. None looked at pyramids or top/back-off. Its glossary defines "complex" as heavy sets followed by lighter sets, but the source review is about power training.
  - "Intrasession autoregulation" was rated as insufficient data.
- **McLeod 2024**, J Sport Health Sci, PMID 37385345: insufficient evidence that set configuration matters.
- **Rios 2026**, Sports (Basel), PMID 42646886: null results between methods come from small samples with no equivalence testing. "No difference" here does not prove equivalence.
- I found no meta-analysis of pyramids or top/back-off on PubMed.

**Why a heavy top set is still a reasonable idea (inference, not tested on top/back-off):**
- Heavier loads (>80% 1RM, or ≤8RM) build more 1RM, while hypertrophy is similar across loads: Schoenfeld 2017, J Strength Cond Res, PMID 28834797; Lopez 2021, Med Sci Sports Exerc, PMID 33433148; Currier 2023, Br J Sports Med, PMID 37414459 (178 studies); Lacio 2021, PMID 34769755; ACSM 2026.
- 1RM is partly skill. Practising 1RMs matched 4 sets to failure for 1RM gains: Mattocks 2017, Med Sci Sports Exerc, PMID 28463902 (38 untrained); Dankel 2017, Muscle Nerve, PMID 27875635 (5 trained).

## Q2. What the studies prescribe

| Parameter | Trial use | Status |
|---|---|---|
| One top set; a second only if the first was rated too easy | Helms 2018, JSCR, PMID 29786623; Helms 2017, JSCR, PMID 28933716 (same design and size, likely one cohort: 12 national-level powerlifters, 3 weeks) | Used, never compared with 2+ |
| Top-set effort | Helms: 8 reps @ RPE 8, 2 @ 8, 3 @ 9; lifters hit the target within about 0.33 RPE. Androulakis-Korakakis 2021: a single @ RPE 9–9.5. APRE/DAPRE: RM sets to failure (Mann 2010, PMID 20543732; Knight 1985, MSSE, PMID 4079735) | Used, never compared |
| Back-off drop | Helms 2018: 2/4/6% off the top set, same reps, repeated until the top set's RPE was reached ("RPE stop"). Bigger drops gave more volume (relative volume 74.6, 88.4, 114.4); volume was the only outcome. Androulakis-Korakakis 2021: 20% off a single, 2×3. | Volume data only; one outcome trial (small) |
| Load adjustment rule | 2% per 0.5 RPE outside the target (Helms 2018, Front Physiol, PMID 29628895 [FT]; 21 trained men, 8 weeks; RPE-chosen loads matched %1RM loads, with a small probable 1RM edge) | Used inside a trial, never tested on its own |
| Drops needed to hold reps | −5 to −10% per set (Medeiros 2013, IJSPP, PMID 23170750, 60 s rests). Squat and leg curl needed −15%, leg extension none (Willardson 2010, JSCR, PMID 19816212). About −10% for squat/pulldown, −10 to −15% for bench (Willardson 2012, JSCR, PMID 22130393, 1-min rests). Outcomes equal at −5/−10% (Lima 2018). | Acute data with short rests; longer rests need smaller drops |
| Back-off effort | Androulakis-Korakakis 2021: about RPE 6.5 (≈3–4 RIR), and the gains were still meaningful. Helms: stop at the top set's RPE. Lima 2018: to fatigue. | Observed, never compared |
| Number of back-offs, adding reps, e1RM- or "fatigue %"-based loads, per-goal drop sizes | none | Coaching convention |

## Q3. For whom, and for which exercises
- **Who has been studied.**
  - RPE top/back-off: only powerlifters.
  - Pyramids: trained men, and older women both novice and trained.
  - Oxford/DeLorme: knee extension, in a rehabilitation-style setting.
- **Load needs rise with training status.**
  - Untrained people gain best at about 60% 1RM and trained people at about 80% (Rhea 2003, MSSE, PMID 12618576). Athletes do best at about 85% (Peterson 2004, JSCR, PMID 15142003).
  - ACSM 2009 (PMID 19204579): novices 8–12RM. Intermediate and advanced lifters 1–12RM, periodized, with an emphasis on 1–6RM.
  - ACSM 2026: ≥80% 1RM helps strength, and its evidence is mostly from novices. It also says resistance training "is safe for healthy adults of all ages" and that untrained people benefit from various programs.
- **Beginners.** I found no position stand or trial that advises against top sets for beginners. The reasons to withhold it are indirect:
  - Moderate loads are enough for novices (Rhea 2003; ACSM 2009).
  - Novices rate RIR less accurately at near-maximal loads: Zourdos 2016, JSCR, PMID 26049792; Ormsbee 2019, JSCR, PMID 28301439 (the difference appeared only at 1RM). Against this, the meta-analysis found training status made no difference to RIR accuracy (Halperin 2022, Sports Med, PMID 34542869; Remmert 2023, PMID 37036795), and accuracy improves with practice (Hermann 2025, MSSE, PMID 40249908).
  - The RIR scale's own authors advise novices to practise rating before basing load or progression on it (Helms 2016, Strength Cond J, PMID 27531969 [FT], narrative).
  - Novices' 1RMs move quickly (Helms 2020, J Hum Kinet, PMID 33312273 [FT]).
  - Simple linear loading suits novices (Suchomel 2021, Sports Med, PMID 34101157, narrative).
- **Exercises.** The case for a top set rests on 1RM load specificity, which applies to the main compound lifts. For isolation and hypertrophy-role lifts, load does not change growth, so a heavy top set adds effort with no known benefit. RIR accuracy is similar on single-joint lifts (Remmert 2023), so there is no safety signal either way. Load drops on curls (Lima 2018) are a different tool: they keep reps in range.

## Q4. Fatigue and safety
- **Failure costs more and buys no strength.**
  - It increases acute fatigue (SMD −0.96 for biomechanical measures, plus more muscle damage and higher RPE; Vieira 2022, Sports Med, PMID 34881412).
  - It slows recovery by 24–48 h (Morán-Navarro 2017, EJAP, PMID 28965198).
  - Strength gains do not need it: Grgic 2022, JSHS, PMID 33497853 (ES −0.09); Robinson 2024, Sports Med, PMID 38970765 (strength was flat across RIR); Hermann 2025.
  - Hypertrophy improves a little closer to failure (Robinson 2024), but 1–2 RIR performs about the same as failure (Refalo 2024, J Sports Sci, PMID 38393985; Refalo 2023, Sports Med, PMID 36334240: trivial difference).
- **Fatigue scales with proximity to failure.**
  - Refalo 2023, Sports Med Open, PMID 36752989: 6 sets at 75% to failure, 1 RIR or 3 RIR cut velocity by 25%, 13% and 8% at 4 minutes. At 24 h: −3%, −3%, +2%. All equal by 48 h.
  - Sets stopped at 3 RIR held reps and velocity at a lower RPE (8.2 vs 10) than sets taken to failure, with the same recovery (Mangine 2022, JSCR, PMID 34941608).
  - Velocity-loss studies agree: less fatigue suits strength and power, more fatigue suits hypertrophy (Pareja-Blanco 2017, PMID 27038416; Hickmott 2022; Jukic 2023, Sports Med, PMID 36178597).
- **Acute cost of descending loads.**
  - Jump height fell 1.9% after a descending pyramid and did not fall after traditional sets (Costa 2021, JSCR, PMID 31009435).
  - Session RPE was higher (6.6 vs 5.9) with slightly lower affect (Enes 2023, Percept Mot Skills, PMID 37197987).
- **ACSM 2026.** Effort near failure, or a target of 2–3 RIR, is enough. There is "insufficient evidence to quantify exact RIR". Lifting to fatigue may be inadvisable for some groups, such as older adults.
- **How accurate RIR ratings are.**
  - People under-predict the reps they have left by about 1, so a called RIR 1 is on average nearer 2. Heterogeneity across studies is large.
  - Ratings are more accurate at 12 reps or fewer, nearer failure, and in later sets (Halperin 2022; Zourdos 2021, JSCR, PMID 30747900: the error was 2.1 reps at a called RPE 9 vs 3.7 at RPE 7).
  - So a low-rep top set is where ratings are most trustworthy. Back-off sets, with more reps further from failure, are the least trustworthy, so their load should come from the top set rather than from feel.
- **Injury.**
  - Powerlifting sees 1.0–4.4 injuries per 1000 h (Aasa 2017, BJSM, PMID 27707741; Tung 2024, BMJ Open SEM, PMID 39650568). Weight-training sports are low-risk compared with team sports (Keogh 2017, Sports Med, PMID 27328853). Traditional strength training is the safest form (Serafim 2023, PMID 37046275).
  - No study links set structure to injury.
  - One acute deadlift study (Sajedi Nia 2026, BMC Musculoskelet Disord, PMID 42323581; 12 powerlifters) suggests descending loads may be safer for trunk coordination. That conclusion is speculative.

## Q5. How progression is driven
- **In every trial, the heavy set's performance sets the load.**
  - APRE uses the reps achieved to set the next load. Over 6 weeks in 23 Division I football players it beat linear periodization on bench 1RM, estimated squat 1RM, and reps at 225 lb (Mann 2010).
  - DAPRE works the same way (Knight 1985).
  - Helms and Androulakis-Korakakis choose the top-set load by RPE each session and anchor the back-offs to it.
- **Autoregulated vs fixed progression.**
  - Zhang 2021, Front Physiol, PMID 33776802: ES 0.64 overall and 0.78 for APRE, from 8 studies in athletes. Its subgroup effect sizes of 4.64 and 3.21 are implausible, so treat it with caution.
  - Hickmott 2022, Sports Med Open, PMID 35038063: load autoregulation gave +2.07 kg of 1RM (p=0.09), not significant.
  - Larsen 2021, PeerJ, PMID 33520457: all autoregulated protocols raised 1RM.
  - In older adults, %1RM, RPE, RM and RIR progressions worked equally (Buskard 2019, MSSE, PMID 31107348).
  - Progressing reps or progressing load worked equally (Plotkin 2022, PeerJ, PMID 36199287).
  - ACSM 2009: add 2–10% when the lifter gets 1–2 reps over the target.
- **e1RM.**
  - Estimates from multi-rep sets are accurate up to about 10 reps, and best from about 5RM (Reynolds 2006, JSCR, PMID 16937972).
  - Reps at a given %1RM vary between people (Nuzzo 2024, Sports Med, PMID 37792272), and individual curves fit better than pooled ones (Mitter 2023, EJSS, PMID 35703009). The app's per-lift Epley constant already addresses this.
  - Prescribing by %1RM gives very different RIR across people (Pelland 2022, Sports Med, PMID 35247203).
- **Answer: both, read from the same set.** The top set's reps at its RIR drive the next load. Its e1RM is the trend signal. The back-offs follow.

## What the evidence can and cannot determine
**Can:**
- Top/back-off and related schemes give similar strength and hypertrophy to straight sets when volume and effort are similar. This holds consistently, but in small trials.
- Heavy loads matter for 1RM; load does not matter for hypertrophy.
- Avoid failure. RIR 2–3 is enough effort.
- Load must drop 5–15% across sets to hold reps under fatigue.
- Performance-based progression works at least as well as fixed progression.

**Cannot:**
- Show that the structure is superior.
- Set the optimal top-set RIR, the number of top sets, the drop size, or the back-off reps and RIR.
- Say how it suits novices compared with trained lifters.
- Say whether it helps isolation lifts.
- Say whether in-session extras (a second top set, RPE stops) add anything.
- Tell us anything beyond 16 weeks.
- Speak to hypertrophy under top/back-off specifically: the Androulakis-Korakakis and Helms studies did not measure muscle size.

## Recommended default design
**Where it applies:**

| Role | Hybrid | Strength focus | Lean-down | Hypertrophy focus | Undulating | Light weights | Foundation |
|---|---|---|---|---|---|---|---|
| primary-strength | On | On | On | Off (owner) | Off (owner) | Off | Off |
| all other roles | Off | Off | Off | Off | Off | Off | Off |

Secondary-strength stays straight in every style, including Strength focus; extending it is optional (see owner question 7).

**The sets:**
- **Count.** Keep the role's 4 sets: 1 top set + 3 back-offs. All four count as working sets for weekly volume.
- **Top set.**
  - The role's strength range (default 4–6), at RIR 1, with one top set and the warm-up ramps leading up to its load.
  - Never RIR 0. A logged RIR of 0 means "maintain", as the app's rule already does.
  - In Lean-down, RIR 1 is still not failure.
- **Back-offs.**
  - Load: the top set's logged load × 0.95, rounded to the equipment step and never under the empty bar.
  - Reps: the same range as the top set.
  - Effort: RIR 2.
  - Rest: the role's rest.
  - If the lifter changes the top-set load during the session, recompute the back-offs.
- **Why these numbers.** On common %1RM tables, a 4–6 top set at RIR 1 is about a 6RM load, roughly 85% 1RM. Taking 5% off gives roughly 81%, about a 7–8RM load. Fresh, 5 reps there leaves 2–3 RIR, and fatigue over three sets brings it to about 1–2. Every set stays at or near the ≥80% level that ACSM 2026 and Currier 2023 link to strength. The drop also sits inside Helms's tested 2–6% range.
- **Self-correction.** If back-offs average 1 RIR or more off target for two sessions running, shift the drop by about 4% per rep of miss, bounded 0–20%. The 4% comes from Helms 2018 FP's 2% per 0.5 RPE; the 0–20% bounds are the trial range. Waiting for two sessions is my judgment, because ratings have about a 1-rep error.
- **When the structure is suspended.** In the start, estimate, return, deload and regress modes, and when fatigue is high, use straight sets at that mode's load (judgment).

**How progression reads it:**
- **Load step.** Apply the existing strength rule to the top set alone: if the top set clears the floor at RIR ≥1, add one increment.
- **Back-offs.** They are never progressed on their own; they follow the top set. Back-off misses widen the drop rather than block the top-set step (judgment). If the top set misses too, the existing maintain and deload rules apply.
- **e1RM.** Stalls, returns, "Why this target" and the "a weight belongs to its rep range" reference should all read the top set only. That means tagging sets as top or back-off, so the lighter back-off sets never pull e1RM down or count as a zone reference.

## Uncertainties and questions for the owner
The evidence cannot separate the options in these. Items 1–4 and 7 are product choices between options the evidence treats as equal; items 5–6 are judgment calls where there is no evidence.
1. **On by default, or opt-in,** in the three styles where I recommend it? The outcomes match straight sets either way.
2. **Undulating:** leave it off, or use it on the heavy-zone day only? The undulating evidence base used straight sets. Varying loads across days matched constant loads (Schoenfeld 2016, IJSM, PMID 27042999).
3. **Hypertrophy focus:** offer it for primary-strength? Evidence says it is neutral for size.
4. **Lean-down:** include it? Top set at RIR 1, or RIR 2?
5. **Back-off misses:** should they ever hold back the top set's load step?
6. **In-session extras:** offer Helms's second top set or RPE-stop volume? There are no outcome data, and ACSM 2026 calls intrasession autoregulation insufficient.
7. **Numbers and roles:** the −5%, same reps and RIR 2 are convention plus table arithmetic. One alternative is −10% with +2 reps, if the owner wants back-offs to double as hypertrophy volume (the 20% drop in the trial applies after a single). Separately, should secondary-strength in Strength focus get the structure too?

**Other limits:**
- Samples are small (n 4–32 per arm) and trials are short (3–16 weeks).
- The RPE top/back-off work was done only in powerlifters.
- The Eifler 2016 design is ambiguous.
- The Zhang 2021 subgroup effect sizes are implausible.

## Verified PMIDs (abstract read)
- **Structure trials and reviews:** 28130627, 34100277, 27749731, 29120984, 26972635, 28394730, 28422533, 29945272, 32842644, 14627926, 26670986, 29584518, 34527944 [FT], 30158433, 15574075, 28532248, 40980811 [FT], 31009435, 37197987, 39072216 [FT], 42323581, 37330772, 41718208 [FT], 31817252 [FT], 42646886, 41843416 [FT], 37385345, 33417154, 33666895
- **Autoregulation and prescription:** 29786623, 28933716, 29628895 [FT], 20543732, 4079735, 33776802, 35038063, 33520457, 32813181, 34101157, 33312273 [FT], 27531969 [FT], 39787033, 34941608, 31107348, 36199287, 23170750, 19816212, 22130393
- **Load, effort and fatigue:** 19204579, 37414459, 33433148, 28834797, 12618576, 15142003, 34769755, 28463902, 27875635, 31797219, 38970765, 36334240, 33497853, 34881412, 28965198, 36752989, 38393985, 40249908, 27038416, 36178597, 27042999
- **RIR and e1RM:** 34542869, 30747900, 26049792, 28301439, 37036795, 16937972, 37792272, 35703009, 35247203
- **Injury:** 27707741, 39650568, 27328853, 37046275
- **Read but minor or off-topic:** 35998251, 26332783, 12853908, 25436635, 39440865, 40757557, 20042923/19858756 (one paper indexed twice), 35790622

**Not verified:**
- 31009432 (Graham & Cleather 2021) and 507268 (Knight 1979) have no abstract in PubMed. Europe PMC had none for Graham & Cleather either.
- Rodriguez et al. 2021, Strength Cond J, doi 10.1519/SSC.0000000000000623, "Utility of Back-Off Sets", is not in PubMed. I read its abstract on the institution page. It is a narrative review, and I did not rely on it.

**Web search, used only to find leads:**
- [Utility of Back-Off Sets: An Overview](https://scholars.nova.edu/en/publications/utility-of-back-off-sets-an-overview/)
- [Three different set methods](https://www.sportedu.org.ua/index.php/PES/article/view/1728): about supersets and giant sets, not relevant.
