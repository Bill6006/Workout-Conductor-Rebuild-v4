# Numbers that look like slips are questioned (the owner's item 40)

Approved on 2026-10-09 for Maintenance 26 (round H). The proposal said: the max sheet previews the
target it will set, but nothing questions an unlikely number (2250 instead of 225 saves with one
tap); the app would ask once when a typed number is far above the lifter's history, or above the
reference max for their bodyweight and experience. Which numbers count as slips is a product
judgement; the research below only says how far real numbers move.

## What the app does today

- **The set logger** takes a typed weight as it is, reps from 0 to 200 and a reserve from 0 to 10.
  A slip logged becomes history: its estimated max feeds the next target, the records, Progress and
  the stall rules.
- **The max sheet** takes a weight of 1 or more with reps (the field says 1 to 30, but more were
  taken and read as thirty), or a one-rep max. On a lift with no logs of its own, a slip sets the
  first target at 90% of what it implies (held at the heaviest weight the place has); on a lift
  with logs it moves the target two steps at most, and it stays saved, read again after a break.
- **Bodyweight** (Settings, and setup) takes any positive number up to 1000. It sets every first
  target that starts from the body, and the load of every lift done at bodyweight.

## What the research says (how far real numbers move)

Every paper was checked on PubMed (E-utilities) on 2026-10-09.

- A one-rep max retested on another day varies by a median 4.2% (Grgic, Lazinica, Schoenfeld and
  Pedisic, 2020, Sports Medicine - Open, PMID 32681399), and reps to failure by about a rep (Mitter,
  Csapo, Bauer and Tschan, 2022, PLoS One, PMID 35511896). A real set or max far above everything
  logged for the lift is rare.
- After time away a lower number is expected: stopping training lowers maximal force, more the
  longer the break (Bosquet and colleagues, 2013, Scandinavian Journal of Medicine and Science in
  Sports, PMID 23347054, already cited in `entered-maxes.md`).
- Epley's reading of a set stays within about 6% of the measured means from 5 to 20 reps (Nuzzo and
  colleagues, 2024, PMID 37792272; `entered-maxes.md`), so sets in that range are a fair reference.

## The design that follows (product judgement)

1. **Ask once, never refuse.** The question names the number and what it was compared with, and
   keeping it is one tap; changing it goes back to the number. A real number costs one tap. The
   safe answer, "Change it", stands where the button pressed stood and takes the focus, so a
   second tap or Enter changes the number and never keeps it (the review of item 40: on the max
   sheet a double tap saved the slip unread). In the set logger "Keep" answers only once the
   question has shown for about half a second, the logger's own pause after a log, each question
   its own wait, so quick taps meant for Log never keep a slip (the re-check and the third pass).
   Both buttons carry the question as their description for a screen reader; an edit keeps its
   Cancel while it asks.
2. **A number kept once is not asked about again.** Every set of the lift logged today counts as
   the lifter's word. The one being corrected may spare a question, never make one: a correction
   within one and a half times its own reading (a rep or a step either way, or lighter) is not
   asked about again, and at its own weight it spares the ceiling and the bar too (the third and
   fifth passes); a set logged a digit short and corrected is judged as if typed new, never held
   to its old number (the fourth pass), and a kept slip corrected to another weight is asked about
   as any weight is (the fifth pass).
   A set logged today as heavy or heavier, of as many reps or more, says all a new one does (a
   ramp kept once too); a weight alone does not, since 155 lb for 6 says nothing of 155 for 30
   (the third pass).
3. **A weight, logged or entered on the max sheet,** is questioned when the max it implies is more
   than one and a half times the lift's own best: its logged sets, today's working sets so far, and
   the max the lifter saved for it, whichever says most (the review: a heavier set kept once was
   asked about again on every later set, and a lower max than one saved was asked about). The
   logged sets and the number typed are read alike, as the max sheet reads a set, every rep up to
   thirty, so like is compared with like (the third pass: a long set was dropped; the fourth: read
   at twenty against one read at thirty, a real set was asked about). That is far past the
   day-to-day variation (about 4%) and any single session's progress. With none of those, it is
   compared with three estimates, whichever allows more: two and a half times what the lift's
   family says (its sets converted by their reference ratios; a family lift done at bodyweight logs
   weight added, not a max, and is not read); three and a half times what the lifter's other lifts
   suggest, the estimate a lift's first target reads before the body's (the seventh pass: with no
   bodyweight saved, a tenfold slip of a target the bench set for a curl went in unasked): every
   lift with a load ratio logged in the last 180 days, through the same reference ratios, each at
   its best set read every rep up to thirty, and a max entered in those 180 days where it is
   higher, never weighed as older than the logs it stands over and never lowering the ceiling (the
   higher of it with and without the maxes is read), a ceiling erring heavy (the eighth
   pass: a light day on the bench made a real first leg press look like a slip; a first target
   reads the newest session, erring light; the ninth: one set of a hundred reps held the ceiling up
   for months, and a year-old max counted as today's once the logs after it had aged out; the
   tenth: an old max lowered the ceiling for a lift trained the day before, a set logged at no
   weight halved it, and a max dated a year ahead counted as the newest); and three and a half
   times the starting estimate from the body when a
   bodyweight in the range is set (the re-check: a light set on a related lift made a real weight
   look like a slip; the eighth pass: a bodyweight kept at 18 lb estimated "about 2 lb"). The other lifts' estimate takes the body's
   factor: both read the reference ratios between lifts, which a lifter's own strengths can sit far
   from. The body's estimate is low by design: ordinary first sets of beginners read up to about
   3.2 times it (the third pass), and a typing slip of a cautious first set from about 3.6 (the
   fourth pass), so three and a half sits between them. An estimate that rounds to nothing is none
   (the seventh pass: "a max of about 0 lb" on a bodyweight kept out of range). No estimate questions what the app
   itself asks: the empty bar, or the set's own target read at the reps typed, three and a half
   times which is the least the limit can be (the fifth pass: a light beginner's prefilled first
   target, which never goes under the bar or a load step, was asked about). With no estimate (no
   bodyweight in the range, nothing related logged, and no other lift logged or max entered),
   nothing is asked by one: the target only raises a limit, never makes one (the sixth pass: a
   light target made a limit where no estimate was, and a real first set was asked about).
   - **A hold** is compared by its load alone: its seconds are no reps.
   - **Weight added to the body** (a chin-up, a dip) is read with the bodyweight, as the whole
     weight moved; with no bodyweight saved, or one kept out of the range, there is nothing to read
     it with, short of the ceiling (the ninth pass: with 18 lb kept, 20 lb added was asked "as much
     as you weigh"). On an upper-body lift, as much again as the lifter weighs, added, is
     questioned: their bodyweight typed in the weight dial. Not on the lower body, where a strong lifter adds that much
     to a split squat or a glute bridge (the third pass).
4. **A logged weight the place cannot load** (heavier than the heaviest it records for the lift) is
   questioned too, until the lift is logged that heavy at that place; and any weight past what
   almost anyone loads: 1000 lb (450 kg) on a bar or a stack, 2000 lb (900 kg) on a sled (a
   plate-loaded leg press or hack squat), 250 lb (115 kg) per dumbbell or kettlebell, or added to
   the body on any lift done at bodyweight: the catalog adds it with dumbbells (the fourth pass: a
   bar's ceiling on the lower body let a tenfold slip through). These are asked about once a
   lift: a weight the lift has lifted before, today or in its history, is not asked about for
   what it weighs again (the third pass: a kept number was asked about at the first set of every
   session). **A bar lift lighter than its empty bar** ("13" for 135) is questioned on any set of
   the day, against the bar's own weight: a place records its weights, not its bar. A lighter bar
   of the lifter's own (a fixed barbell, a 15 kg bar) is asked about once: once the lift's logged
   sets include that weight or lighter, it is not asked again (the re-check).
5. **Reps** on a working set are questioned past three times the top of the range and 15 over it,
   unless the lift has logged as many before, today or in its history (the re-check: sixty calf
   raises were asked about on every set); a hold's seconds are not reps and are not questioned.
   The max sheet takes a recent set of up to 30 reps, as the field says, and refuses more rather
   than reading them as thirty.
6. **Bodyweight** is questioned when it moves by more than a quarter from the one confirmed (saved
   as the editor opened, then typed and left, or kept), or falls outside 30 to 300 kg (66 to 660
   lb). A quarter's change is judged against the confirmed bodyweight converted to the units shown:
   switching pounds to kilograms and typing the bodyweight anew is no slip, and typing the pounds
   figure in kilograms is (the re-check). A saved bodyweight that is itself out of the range is the
   slip, and its correction is not questioned (the third pass). A plausible number the typing pauses
   on is confirmed, and the next change is judged against it: Settings saves it at that pause (the
   fourth pass), and setup's question calls it the bodyweight entered, not saved, as setup saves only
   at Finish (the fifth to seventh passes: setup named an older number while a newer one stood).
   After a units switch the question names the one confirmed as it was, with what it comes to in
   the units shown ("180 lb, about 81.6 kg"; the seventh pass: a converted figure was named as
   saved). A number a units switch lets in is confirmed, as one kept is (the eighth pass: the
   next change was judged against the older one). While it asks, the
   bodyweight stays the last plausible one the typing paused on, or the one it had as the typing
   began, never an emptied field, so nothing typed on the way is saved (165 on the way to 1650; the
   third pass: 182 saved, then 1820 asked about, put 180 back). A held number that a units switch makes
   plausible goes in with the new units; one left unanswered when Settings closes or setup finishes
   is said in a message that names the bodyweight that stands. More than a profile keeps (1000)
   offers only "Change it".
7. **A lower weight or max is never questioned.** It is plausible (a break, a bad day, Bosquet 2013)
   and only ever makes targets lighter; a bar lighter than empty is the one exception (it cannot be
   real). Bodyweight is questioned either way, by the rules above, since it sets loads both ways.
8. **Reps in reserve are not questioned.** The logger takes 0 to 10; a slip there moves the next
   target by at most one load step, and in-session autoregulation corrects the sets after it.

## Uncertainty

- The factors (one and a half, two and a half, three and a half, a quarter) are judgements about
  typing slips,
  which are usually an extra or a missing digit, and so a factor of ten. They are set well past real
  progress so a real number is rarely questioned; a slip under them (245 for 225) passes, as a
  plausible number, and in-session autoregulation corrects the sets after it.
- A first set at a new place may be heavier than anything logged at home; the question then costs
  one tap.
- The ceilings are set past what almost anyone loads, not past every record: a world-class lifter
  may meet the question once, and keeping the number costs one tap.
- The family's, the other lifts' and the body's estimates are rough, which is why their margins
  are wide and the one that allows most is used. The body's is low by design (a safe first target), so its margin is three
  and a half: a beginner who starts far below it may slip unasked, and one far above it is asked
  once.
- The app does not record a lifter's own bar. A lighter one than the standard is asked about once
  on each lift, then read from the log.
- Switching units does not convert the bodyweight saved (as before this round): the number stays
  and is read in the new units. Within one visit to the editor the question converts the one
  confirmed; opened again, the number kept is read as it stands (180 kg), and the bodyweight typed
  anew is asked about once. Converting it is Proposed in the Maintenance 26 report.
- A tenfold slip that lands on a ceiling exactly (25 lb added typed as 250) passes on a lift done
  at bodyweight with nothing logged when no bodyweight is saved, or on the lower body (a step-up, a
  split squat, a glute bridge): such a lift has no estimate to compare with. With a bodyweight
  saved, an upper-body one (a chin-up, a dip) asks it as much as the lifter weighs (the seventh
  pass).
- A workout record keeps no units, so after a switch the lift's logged sets are read in the new
  units, and its first set may be asked about once.
