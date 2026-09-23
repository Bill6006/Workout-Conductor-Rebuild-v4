# Maintenance 20: round B, pain you can trust and a hold timer

Built on 2026-09-22 on the owner's GREEN for Maintenance 19 and go for the next phase. Round B
is the owner's items 3 and 1.

## 3. Pain you can trust

**From the owner:** double-check that the pain knowledge is accurate: "I don't remember reporting
any pain for chin ups".

**Found:** the end-of-workout rating stored only pain yes or no, never where. The next workout then
picked any exercise of today's that had also been in that workout, Chin-ups here, and called it
the pain, whatever had hurt. The rating's pain line also promised that "the next session works
around that joint first", which nothing did, and the same line was printed three times on the
summary.

**Delivered:**

- The end-of-workout sheet asks Pain with two plain answers, No pain (the default) and Some pain.
  Some pain opens Where?, with the joints as chips. The joint is saved with the rating.
- The next workout's coach card names the joint, the exercise of today's that loads it and where
  the report came from: "Shoulder pain last time: Barbell Bench Press loads it", then
  "Sep 12, Push + arms: shoulder." and the stress. Its one action is the swap.
- It reads only the newest saved workout, however long ago: it is "last time" until the next
  workout is saved, which answers the question again. Pain saved without a joint (every rating
  before this round) names nothing, so nothing is guessed. A joint marked as hurting during
  today's workout has its own card, and this one gives way to it, so one Not now quiets both.
- Until then, the coach's added exercises and the ranked alternatives keep away from that joint:
  high stress on it is left out, moderate stress ranks lower with the reason "moderate stress on
  your shoulder, sore last time".
- The summary says it once, under Next time: "Shoulder pain noted: next time the coach flags
  exercises that load it." No exercise loads the neck, hip or ankle, so for those it says only
  "Neck pain noted." History shows the joint with the rating, and the fatigue reading names it.

## 1. A hold timer for held exercises

**From the owner:** "a timer feature for non rep related exercises like doing planks having to
hold that for a certain amount of time".

**Found:** nothing treated a hold as timed. Plank's 30-60 and Farmer Carry's 20-40 were read as
reps everywhere: the logger asked for reps and reps in reserve, Plank's target never moved, a
40-second carry counted as a 40-rep set in the estimated max (about 105 lb from a 45 lb carry,
which then raised other lifts' starting weights), in records and in volume, and the time estimate
costed a 45-second plank as 45 reps, almost four minutes a set.

**Delivered:**

- Plank and Farmer Carry are holds. Their seconds stay in the existing reps fields, so older
  records, other devices, backups and the cloud copy keep working unchanged.
- The logger shows Seconds instead of Reps, and no RIR. Above Log set: Start hold · 30 s. It
  counts down with Stop; when it runs out, or is stopped, the seconds held go into the dial
  ("Held 30 s") and the set logs with the usual button. Start again redoes it.
- The countdown lives on the workout like the rest timer: it freezes with Pause, keeps counting on
  another tab, and survives the app being closed. Starting a hold ends a running rest.
- Sounds: the rest timer's three ticks and end tone, on the same Rest timer sounds switch, played
  separately so neither silences the other. One buzz at the end where the phone allows it. The
  screen stays awake only while a hold counts.
- Progress: today's seconds start at the bottom of the range and grow by five once every set
  reached them, never past the top. A set short of it holds the target. At the top on every set,
  Plank says it is ready for a harder variation; Farmer Carry takes the next weight and starts
  again from the bottom. Only the hold's own sessions count.
- Holds stay out of the weight maths: no estimated max, no max offer, no cross-lift estimate, no
  records, no volume, no stall routes, no rep tempo, no drop sets, no mid-workout rep
  adjustments, and none of the coach's rep cards. The time estimate counts the real seconds.
- Everywhere a hold's number shows it reads as seconds: the set rows, Up next, Today's preview,
  supersets, History, Progress, the exercise's details ("Seconds 30-60 s"), the summary's next
  targets ("Plank: hold 35 s").

**Worth knowing:** a Farmer Carry logged before this round was entered as reps; the app now reads
those numbers as seconds, so its first target after the update may start low. Log one session and
it follows what you do.

## Verification

- Unit: pain named only from the newest saved workout, never without a joint, never once the
  workout is finished, and not beside today's card for the same joint; the source line; the joint in the alternatives and the
  accessory picker; the two plain answers in the sheet. Holds: the catalog flags, the light day
  keeping a hold's range, the first target, growth by five past the shortest hold, never past the
  top, a short set holding the target, the harder-variation line, a carry keeping its load until
  the top and then adding weight from the bottom, the full seconds again when the rack has
  nothing heavier, the next real dumbbell when it skips a step, back to the bottom after a long
  break (a carry a step lighter), the target repeated when fatigue is high, a related exercise's
  reps ignored. No estimated
  max, cross-lift estimate or record from a carry; a hold's seconds in the time estimate. The
  store: Start ends the rest, the full seconds when it runs out, Stop with the seconds held,
  Pause and Resume, a reload, an unreadable countdown dropped without the workout, running again
  when an edit resumes a paused workout, cleared by a log, a skip, an undo, a delete that moves
  off its set and a swap to a non-hold, never started on a lift. The logger's seconds
  mode and fill; the timer's three states, a paused countdown, and one buzz per countdown; the
  hold's sounds on their own player.
- Browser (`e2e/holdAndPain.spec.ts`, all three device projects): a Plank at 30 s, Stop at 12,
  then a full run to "Held 30 s", logged as "30 s", and the next hold ending the rest; the sheet's
  Some pain and Shoulder, the summary saying it once, History naming it; a shoulder report ten
  days old and today's first exercise the Bench Press: the card and its source line.

## Review

Live app: https://bill6006.github.io/Workout-Conductor-Rebuild-v4/

1. Finish a workout, tap Some pain and a joint. The summary says it once. The next workout's
   coach card names an exercise that loads that joint, and when you reported it.
2. On the Lower day, open Options on the core finisher (Ab Wheel Rollout or Dead Bug) and swap
   in Plank; a shrug or Wrist Curl offers Farmer Carry the same way. Tap Start hold: it counts
   down with ticks at the end, and the seconds go into the dial. Try Stop part way.
