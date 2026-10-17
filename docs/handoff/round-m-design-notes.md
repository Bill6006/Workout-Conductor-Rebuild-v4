# Round M (Maintenance 31): items 12 and 32, design notes (pre-build)

_Written 2026-10-11 before the build; carried into the repository on 2026-10-17. The week model
this round builds is specified in `docs/proposals/week-model-readiness-time.md` (part 1); build
it here so the later rounds read the same model._

## The owner's words
- 12: "On a day you didn't tick, Today says so in one line and offers a shorter catch-up session
  built only from the muscles behind this week. The full session stays one tap away."
- 32: "A second workout the same day should lead with what you missed ... and go easy on what you
  already did."

## Research (`docs/research/catch-up-and-second-workout.md`; 70 PMIDs read)
- Weekly sets per muscle drive results; frequency is neutral for size once volume is equal.
- Near-failure work needs 24-48 h (72 h for squats); 3 RIR leaves nothing measurable at 24 h.
- No trial adds a second full dose the same day; splitting one day's dose works (trained).
- Short sessions: at least 2 sets per exercise; diminishing returns.
- Missing a session costs little: offer, never push.
- Novices: more damage, slower recovery; no twice-a-day trials.

## The five owner questions, settled by evidence plus existing conventions
1. Catch-up size: the research's default, 3 working sets per behind muscle (2 for a beginner),
   never more than the muscle's remaining weekly shortfall, nor its usual sets in one session. The
   catch-up is "shorter" by construction (behind muscles only), and never longer than the Default.
2. "Behind" = projected shortfall: sets done this week (Monday to Sunday, the item 46 week) plus
   sets still planned on this week's ticked days ahead fall under the weekly target.
3. The 48-h rule after a catch-up: unchanged (changing it would change an approved rule).
4. Item 32, remainder vs exclusion: the owner's own words, "go easy on what you already did" -> a
   muscle trained today takes only what is left of one session's dose, at 3+ in reserve; in the
   usual case (a full first session) that is nothing, so it sits out.
5. Novice = the profile's experience 'beginner' (the coaching policy's own line): muscles trained
   today always sit out of a second session; catch-up sets 2, at 2-3 in reserve.

## Code map (to read before building; line numbers are from before Round L and have moved)
- Today's plan: store.ensureSession() (appStore ~1218) -> generateWorkout(... duration 'default').
- Week plan: engine/planning/weeklyPlan.ts planWeek (sessions ahead, simulated records).
- Weekly volume: engine/volume/weeklyVolume.ts (rolling 7 days); targets weeklyTargets(profile).
- Behind: engine/alternatives/signals.ts muscleLoads ('behind' <= 40% of target, rolling 7 days).
- Templates/slots: generate.ts Template/Slot; pickForSlot; pickAccessoryFor.
- Today screen: features/today/TodayScreen.tsx, WorkoutPreviewCard.tsx; useTodayWorkout.ts.
- Unplanned day: profile.schedule.availableDays (Weekday[]); localWeekday(now).
- Same-day second session: history has a record started today (localDayKey) -> planWeek's
  trainedToday.

## Open design points to settle while reading the code
- Where the catch-up lives: a session variant (constraints.catchUp) built by the generator from a
  synthetic template of behind muscles; the full session "one tap away" = a switch on the preview.
- How a second session the same day is detected after a completed workout (the store's new
  session after completion) and what the line says.
- The muscles' main lift: each behind muscle's slot from the templates (first slot listing it),
  deduplicated by pattern; strength placement early.
