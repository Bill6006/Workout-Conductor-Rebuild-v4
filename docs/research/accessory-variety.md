# Variety for accessories where it helps (the owner's item 49)

Agreed text: "Variety for accessories where it helps, settled from the research on exercise
variation and adherence first, with no fixed rotation: an exercise that is progressing and working
stays; a change is offered for adherence, staleness, repeated stalls or the lifter's preference,
tied into the stall monitoring; never the main lifts (Baz-Valle et al., 2019, is one starting
point)."

**Status: built in Maintenance 27.** Every study below was checked on PubMed (E-utilities) on
2026-10-10, its abstract read; Baz-Valle et al. 2019 and the 2026 ACSM position stand were read in
full through PubMed Central. The generator was probed before: every accessory slot kept the same
exercise for six weeks at every frequency, so there is no rotation to remove.

## What it does

- **No rotation on a timer.** An accessory that is progressing stays, however long it has been in
  the plan.
- **A stalled accessory's change is one named alternative, for four weeks.** The stall monitor's
  second step, "swap for a variation", and an exhausted route's "pick a different exercise", now
  offer an accessory one alternative as a four-week swap ("Use Cable Curl for 4 weeks"), the same
  lasting swap the exercise sheet's keep switch makes. A main lift keeps the sheet of variations.
- **An accessory gone flat gets one offer**: twelve weeks or more in the plan since its last break
  of three weeks or more, done at least four times in them, and its best estimated max in the last
  two weeks no higher than its best seven to nine weeks before (two weeks, so a deload week's
  lighter loads never read as flat), with no stall diagnosed or route open on it. One card, one
  alternative, four weeks; put away, its place goes to the next accessory gone flat.
- **Adherence and preference keep their routes**: the existing card for an exercise swapped or
  skipped in two of its last three or more sessions opens the alternatives with the keep switch, and
  the lifter can swap and keep any exercise at any time.
- **Never** a main lift, never within four weeks of a change to the exercise (a return from a break
  is one), never on a lift with a pain pattern (its own card and its own swap come first), at a
  route's step as on the flat card (the sheet of variations stands there instead), never in a
  deload week (no plateau card shows then), never on a finished workout. The alternative fits today
  as every offer reads it: the place, the lifter's limits, what they avoid today and the joints
  protected today.

## The evidence

- **Varying accessories neither helps nor hurts overall size or strength over 8 to 12 weeks**:
  systematic review of 8 studies (Kassiano et al., 2022, PMID 35438660); constant against weekly
  varied exercises in 70 women, not different (Kassiano et al., 2025, PMID 39388663); similar 1RM
  gains (Costa et al., 2022, PMID 35481889); variation added no arm lean mass (Fabrício Valério et
  al., 2026, PMID 41985475); varying training variables added no growth (Damas et al., 2019, PMID
  31268828). The 2026 ACSM stand judged the data on varied exercise selection insufficient (PMID
  41843416).
- **Frequent, random change may blunt gains**: drawing exercises at random each session cost bench
  practice and some growth (Baz-Valle et al., 2019, PMID 31881066, full text); excessive, random
  variation and redundant exercises may hinder adaptation (Kassiano 2022). So a change is planned,
  complementary and not frequent.
- **Planned variation can help where a muscle grows**: varied exercises grew every quadriceps head
  (Fonseca et al., 2014, PMID 24832974) and every site measured (Costa et al., 2021, PMID 33440446).
  Exercises differ in where and how much they grow a muscle (Maeo et al., 2021, PMID 33009197; Maeo
  et al., 2023, PMID 35819335; Kinoshita et al., 2023, PMID 38156065): a change must not trade a
  better stimulus for novelty, so the alternative is at least as suited to growth.
- **Variety and choice help motivation and enjoyment, a little**: intrinsic motivation rose with
  variation (Baz-Valle 2019); variety support raised adherence a little in a six-week trial (ηp² =
  .05; Sylvester et al., 2016, PMID 26546241); self-selected exercises raised training volume
  (Rauch et al., 2020, PMID 29016481). Adherence and preference are the best-supported reasons to
  offer a change, not to impose one.
- **A new exercise's first weeks are partly learning and repair**: early training-weight gains are
  mostly coordination (Rutherford and Jones, 1986, PMID 3698983; Mattocks et al., 2017, PMID
  28463902), and early protein synthesis goes to repair (Damas et al., 2016, PMID 27219125). So no
  new offer within four weeks of a change.
- **Never the main lifts**: strength is specific to the lift trained, gains on the trained task
  about twice the transfer (Saeterbakken et al., 2025, PMID 40314751), and frequency's effect was on
  multi-joint 1RM (Grgic et al., 2018, PMID 29470825).

## The rules as built

`src/engine/strategy/variety.ts`; the offers in `coachConductor.ts`.

1. **Scope**: catalog exercises with `compound: false`.
2. **The alternative**: the same movement, a single-joint lift measured the same way, fitting the
   place, the lifter's limits and today's (what they avoid today, the joints protected today: the
   conflict engine), not disliked, not one the lifter swapped
   out in the last twelve weeks (no ping-pong), not already in today's plan, with hypertrophy
   suitability at least the current exercise's, and no more stress than it on any joint the lifter
   flagged or protects today. Other equipment or station first (complementary, not redundant), then
   the best suited, then the least joint stress.
3. **Stalls**: the route's variation step and an exhausted route offer the alternative as a
   four-week swap; the route records the step once the swap is kept, and a swap that could not be
   kept says so and records nothing.
4. **Gone flat**: twelve weeks or more since the exercise's first session after its last break of
   three weeks or more, four or more sessions in them, and its best estimated max in the last two
   weeks no higher than its best seven to nine weeks before.
   No study defines an accessory's staleness; progress, not tenure, is what keeps an exercise.
5. **Spacing**: no offer, flat or at a route's step, for an exercise new in the last four weeks (one
   back from a break of three weeks or more is new), or swapped in or out in them, or with a pain
   pattern.
6. **One at a time**: a flat card put away leaves its place to the next accessory gone flat; one
   with a stall route open waits for the route's own step.
7. **When a four-week swap ends**, the plan's own pick competes for the slot again, and the
   exercise done in the last three weeks keeps the continuity it has always had: a swapped-in
   exercise that is working tends to stay, and the stall monitor watches it like any other.

## Not built (beyond the agreed text)

- A direct offer when an accessory opens a second stall route within twelve weeks of its last
  (closed routes are not kept).
- A "vary my accessories" setting that alternates two complementary accessories for a slot through
  the week (Costa 2021; Kassiano 2025): a new preference, for the owner to ask for.
- Position and muscle-length tags in the catalog, which would let the alternative be chosen for the
  region it grows.

## Uncertainty

- Every trial is short (8 to 14 weeks), most are in young men, and samples are small.
- The twelve weeks, the eight-week comparison and the four-week spacing are product judgements.
- The hypertrophy suitability scores are the catalog's own ratings, not measurements.

## References

- ACSM (Currier et al.). Med Sci Sports Exerc. 2026;58(4):851-872. PMID 41843416.
- Baz-Valle et al. PLoS One. 2019. PMID 31881066.
- Costa et al. Int J Sports Med. 2021. PMID 33440446.
- Costa et al. J Strength Cond Res. 2022. PMID 35481889.
- Damas et al. J Physiol. 2016. PMID 27219125.
- Damas et al. J Appl Physiol. 2019. PMID 31268828.
- Fabrício Valério et al. Res Q Exerc Sport. 2026. PMID 41985475.
- Fonseca et al. J Strength Cond Res. 2014. PMID 24832974.
- Grgic et al. Sports Med. 2018;48(5):1207-1220. PMID 29470825.
- Kassiano et al. J Strength Cond Res. 2022. PMID 35438660.
- Kassiano et al. Res Q Exerc Sport. 2025. PMID 39388663.
- Kinoshita et al. Front Physiol. 2023. PMID 38156065.
- Maeo et al. Med Sci Sports Exerc. 2021. PMID 33009197.
- Maeo et al. Eur J Sport Sci. 2023. PMID 35819335.
- Mattocks et al. Med Sci Sports Exerc. 2017. PMID 28463902.
- Rauch et al. J Strength Cond Res. 2020. PMID 29016481.
- Rutherford and Jones. Eur J Appl Physiol. 1986. PMID 3698983.
- Saeterbakken et al. Sports Med. 2025;55(7):1651-1676. PMID 40314751.
- Sylvester et al. J Behav Med. 2016. PMID 26546241.
