# Recovery time-course, individual differences and the noise in strength measures

_Research report, 2026-10-11, for the week-model, recovery and schedule-watch proposal. Carried into the repository on 2026-10-17 for the cloud handoff (docs/handoff/CLOUD_HANDOFF.md). EB = evidence-based, PJ = product judgement._

The raw notes and saved abstracts stayed on the working machine and are not in the repository; every claim below cites its PubMed ID (or DOI) so it can be checked again.

125 PMIDs were verified (99 abstracts newly read).

## Bottom line
1. **Fixed windows are too rigid as rules, but sound as starting estimates (priors).**
   - Recovery depends mostly on proximity to failure x the number of such sets; then lower-body compound work, exercise novelty, eccentric or long-length emphasis.
   - "Heavy" is the wrong trigger: 8x3 heavy recovered faster than 8x10 (28447186); at equal velocity loss, lighter loads recovered slower (30836680).
   - People differ widely: 286 men fell into clusters with lowest strength at 82%, 61% and 42% (27116346).
2. **Priors keyed to effort and region:**
   - about 24 h after 3+ RIR;
   - 36-48 h after 1-2 RIR;
   - about 48 h after failure, upper body;
   - up to 72 h after high-volume or failure lower-body compound work.
   - Deadlift is not slower than squat (30779596).
3. **Per muscle.** Fatigue is local (Behm 2021 33818751: SMD -0.02, none for strength). Consecutive days are not a problem in themselves (27682004, 29967584, 30363041). Add a light whole-body layer (sleep, stress, several hard days in a row), not a day cap.
4. **The best signal is performance at a known load** (load, reps and RIR, or velocity). Perceived recovery works within a person (35255478). Soreness, CK and hormones are poor (10028132, 12453160, 23247672).
5. **e1RM noise** is about 4% per session (1RM CV 4.2%: 32681399; 1-RIR load CV 2.7-6.2%: 36135029).
   - A single session must fall about 9-11% to mean anything.
   - Four weeks versus four weeks detects about 5% with 4 exposures per lift per block, about 4% with 8.
   - It cannot detect stalls: a trained lifter gains about 1% a month (32865942).

## Recommended model
**Prior R per muscle**, from its hardest prime-mover sets:

| Hardest sets | Upper body | Lower-body compound |
|---|---|---|
| 3+ RIR | 24 h (EB) | 24 h (EB) |
| 1-2 RIR | 36 h (PJ) | 48 h (EB) |
| 0 RIR, or 12+ reps near failure | 48 h (EB) | 72 h (EB) |

**Adjusters:**
- 6+ hard sets for the muscle in one session: +24 h, capped at 72 h upper, 96 h lower (direction EB, size PJ).
- New exercise, first 3 weeks, or 6+ months off: +24 h (direction EB: 18550979, 30722654, 11528337; size PJ).
- Eccentric or long-length (RDL, Nordic, deep fly, overhead extension): +12 h (direction EB: 11194107, 20852880; size PJ).
- Calves and lower-body isolation use the upper-body values (PJ).
- Synergists count at half (PJ, from 41343037, 28029681, 25807025).
- No sex or age adjustment (EB: 40112869, 40174882).
- **Whole-body layer:** <=6 h sleep, high stress, or 3+ consecutive hard days with low perceived recovery -> +12 h to all, or an easier session (direction EB: 35708888, 24343323, 28716692; size PJ).

**Signals, strongest first:**
1. First working set's e1RM versus that exercise's median over its last 3-5 rested exposures. Act on a single session only at >=8% below (PJ, from SD 4.4%, 15705040).
2. RIR at a known load 2+ worse (PJ).
3. Perceived recovery 3+ below the person's normal, on 0-10 (PJ; within-person only).
4. Soreness: a local tie-break only.
5. Velocity, if a sensor exists.
- Not used: CK, hormones, HRV.

**Learning R** (PJ, modelled on the 27967274 Bayesian individualisation):
- Log each hard re-exposure as early (< R) or rested.
- After >=5 of each: early mean within 2% of rested -> R -12 h; 5%+ below -> R +12 h.
- Bounds: R within 12-96 h and within 0.5-1.5x its prior.
- Skip sick or short-sleep days.

**"Too soon"** (PJ):
- Only when the planned work for that muscle is hard (any failure, or 3+ sets at <=2 RIR) and the elapsed time is < 0.75 R, or when the first-set check fails.
- Suggest a swap, fewer sets or a higher RIR.
- Never flag light work (34350481, 11834116).

## Schedule watch
- **e1RM per lift per session** = load x (1 + (reps + RIR)/30), using sets of <=10 reps at <=3 RIR (formula PJ; limits EB).
- **Typical error:** 4% (EB). After about 10 sessions, use the person's own SD around their trend (PJ).
- **Single session:** real only at 9.3% (90%) or 11% (95%).
- **Block means:** threshold = z x 4% x sqrt(2/n).
  - n = 4: 4.7% (90%) or 5.5% (95%).
  - n = 8: 3.3% or 3.9%.
  - Sessions needed per block = 2 x (z x 4 / decline)^2: 5 for a 5% fall, 14 for a 3% fall.
- **"Not working"** (PJ), when both hold:
  - the fall shows in >=2 lifts, or in the muscle average;
  - it persists after 3-5 easier days. A 6-day overload dip cleared in 3 days (27093538); nonfunctional overreaching takes weeks (16888042).
- Fewer than 4 exposures per block: extend to 6-8 weeks or pool lifts. Judge stalls over 8-12 weeks.
- Compare the same time of day (30704301). Log sleep, illness, stress and dieting (23247672, 32679567). 92.5% of unexplained drops involved stressors outside training (32679567).
- **Early warnings, not proof:** perceived recovery down 1-2 weeks; RPE rising at fixed loads; aches.

## Owner questions
1. "Too soon": warn, ease automatically, or block?
2. Strength or size first?
3. Bar-velocity data?
4. Learned windows silent, or shown for approval?
5. Is "5% e1RM fall in 2+ lifts, persisting after an easier week" the right trigger?
6. Ask sleep, stress and recovery daily?
7. Synergists at half, or exercise-specific?
8. Allow early re-exposure so the windows can learn to shorten?
