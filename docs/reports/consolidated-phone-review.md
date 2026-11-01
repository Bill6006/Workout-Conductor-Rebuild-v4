# The consolidated phone review

One review on the phone covers every round waiting for the owner's acceptance. It skips what the
owner has already passed: Phases 0 to 7, and Maintenance 1 to 3, 6, 7, 12, 13, 18 to 20, 22 to 24
and 26, all GREEN. Only the owner marks a gate GREEN; until then every round below stays YELLOW.

- **Live app:** https://bill6006.github.io/Workout-Conductor-Rebuild-v4/
- **The release to check:** build `e3f7acf` (Settings, **About this app**).
- **Never clear Chrome's site data or storage:** one clear wipes every app at bill6006.github.io.

It comes in three parts:

1. **In an Incognito tab:** everything that needs setup, a workout or a change of data. An
   Incognito tab has its own empty storage and no cloud token, so nothing in it reaches your own
   log, places, presets or cloud copy.
2. **On your installed app, now:** what only your own phone and your own log can show. Each step
   only looks or turns a switch; none changes your log, places, weights or schedule.
3. **As it comes up in your training:** cards and lines that need a particular day or weeks of your
   own log. Check them when they appear; nothing needs forcing.

The table at the end says which steps close which gate.

## Part 1: in an Incognito tab

Each block below starts fresh: close every Incognito tab, open a new one at the live URL, and tap
**Use defaults and skip setup**. The defaults are gym access (a Home and a Gym) and four sessions a
week, on Monday, Tuesday, Thursday and Friday. When a block ends, close its Incognito tab and
everything in it goes. Each block stands alone, so the blocks can be done in any order and on
different days.

### 1A. Round I (Maintenance 27): the learning items

Set the lift to push before any workout: a lift gives up its place the day after a session of it.

1. Settings, **Schedule**: 2 sessions a week (each is full body, which has the bench press).
   Settings, **A lift to push**: Lift "Barbell Bench Press", then Target max 225. The row reads
   "Barbell Bench Press to 225 lb".
2. **Today**: the bench press is first, marked "Lift to push", and **Why this workout** says
   "Barbell Bench Press leads: the lift you are pushing to 225 lb goes first, where a lift gains
   most (Nunes et al. 2021)."
3. **Progress**: "Barbell Bench Press to 225 lb", "No reading yet", and "A reading is its first
   working set each session, at 12 reps or fewer with 3 or fewer in reserve."
4. Settings, **Programming**: turn on "Check how well I judge reps in reserve" (if it says your style
   takes nothing to failure, choose Hybrid first).
5. **Today**, **Start Workout**. Log the sets as they come, as filled in (**Log set**, then **Skip**
   on the rest timer), until a cable or machine lift whose set list ends "the last to failure"
   (Cable Triceps Pushdown, say). On its last set the logger says "Reserve check: ..." and asks the
   reps in all. Tick "It stalled before my usual stop", then "I stopped before failure": the first
   unticks; untick both. Log 12 reps at 1 in reserve with 15 in all: it says "You judged 1 left at
   12 and did 15 in all: 3 were left, 2 reps more than you judged."
6. Finish the workout and save it. Settings, **Learned from your log**: "How well you judge reps in
   reserve" says "Still learning: 1 check of the 4 it needs."
7. On the same page, "Each lift's own reps-to-weight curve" says "Learning: not in use on any lift
   yet.", and names the lift checked as "not sure enough yet, from 1 set to failure". Then turn the
   checks off in Programming: the reserve part says "Reserve checks are off: nothing is read through
   your 1 check."
8. **Progress**: "Building a baseline: 1 reading so far, 9 more sessions and 6 more weeks to go."
   and "Now about ... lb (estimated max)."
9. Settings, **A lift to push**: Lift "None". The bench press is no longer marked on Today.
10. Settings, **Learned from your log**: each part says what it has learned and why, or why not yet.
11. Under "How well you judge reps in reserve", tap **Start learning again**: it asks once more
    ("Confirm: start learning again", or "Keep it"); confirm, and it says "Last reset" with today's
    date and time.

### 1B. Round M (Maintenance 31): a second workout the same day

1. **Today** shows "Push + arms". On a Wednesday, Saturday or Sunday (days the defaults leave out),
   the line "Not one of your training days." sits above it with no button: a new lifter has no week
   to catch up yet, so the plan is the usual one. On the other days there is no line.
2. Tap **Start Workout**. Log Barbell Bench Press's four sets as filled in (**Log set**, then
   **Skip** on the rest timer). Then tap **End workout early**, **End and save**, **Done**.
3. **Today** now shows "Second workout" with the line "You trained today: this one leads with what
   you missed and goes easy on the rest." There is no button beside it. It is shorter than the
   hour; the line under its title gives its minutes. Barbell Bench Press is not in it, nothing is
   marked **Drop set**, and every lift reads @ RIR 1 or more.
4. **Why this workout** starts "A second workout today: it leads with what you missed, …". It names
   the muscles still short this week that you did not train. Then it says either "Chest and
   triceps, trained today, sit out." or that they "take only what is left of one session, three or
   more reps short of failure." In the second case their lift, Close-Grip Bench Press, reads @ RIR 3.

### 1C. Maintenance 33: recovery and readiness

**Today** shows "Push + arms".

1. Tap **Check in**, change nothing, and tap **Apply to today's workout**: "Feeling good: full
   workout kept." Then **Update check-in**, set Energy **Low** and Sleep **Short**, and apply:
   "Checked in: energy and sleep low. The plan stays; today's first sets are judged a step easier."
   No lift or set changes. (With fewer than five saved check-ins it compares you to the scale's
   middle; after that, to your own last four weeks: "under your usual".)
2. **Update check-in**: set Energy and Sleep back to **Okay** and Unwell to **Head cold**, then
   apply: "Adjusted for today (every set 2 or more short of failure for the head cold): …". Every
   lift reads @ RIR 2 or more, and **What changed** lists "EZ-Bar Curl: drop set removed, RIR 2."
   The incline press also loses a set: the set Maintenance 34 adds for what the week is short of
   waits on a day of illness.
3. **Update check-in**, Unwell **Fever or aches**, apply. The plan's line says "Fever or aches all
   over: rest today, and train again once they have gone." with **Update check-in** beside it, and
   there is no **Start Workout**. The **Workout** tab says the same, then "Update check-in on
   Today.", also with no Start Workout. Back on **Today**, **Update check-in**, Unwell **No**,
   apply: "Planned effort back: …". Start Workout and the drop set come back.
4. Tap Barbell Bench Press. Under **Hurts, protect it** the sheet says "Sharp, sudden or rising pain:
   stop and protect it. Known pain at 5 out of 10 or less that settles by the next morning is fine
   to train with." Close it.
5. **Plan**, Saved workouts: tap **Save today's workout**. Back on **Today**, tap **Start Workout**
   and log Barbell Bench Press's four sets as filled in (**Log set**, then **Skip**). Back on
   **Today**, **Update check-in**, Unwell **Fever or aches**, apply: the lifts still to come go to
   @ RIR 2, and a coach card "Fever or aches: finish here" offers **Finish here** (the Workout tab
   shows it too). Tap **Finish here**, then **End and save**.
6. The summary's **Recovery** reads "Recovery before loading them hard again: Chest and Triceps
   about 36 h." Tap **Done**: the next plan keeps the rest day's line, with nothing to start.
   **Update check-in**, Unwell **No**, apply. Then **Plan**, **Recovery balance**: Chest and Triceps
   are under **Recovering**, each with 36 or 37 h left, and the rest under **Fresh**.
7. **Plan**, Saved workouts: **Use** the copy from step 5 ("Push + arms · " and today's date). On
   **Today**, a minute or more after the workout, a coach card says "The chest may not have
   recovered", with "Worked hard 0 h ago; about 36 h to recover (sets two reps short of failure:
   36 h)." and "Lighter keeps the loads: a set fewer and a rep more in reserve on its lifts today."
   Tap **Lighter for the chest**: "Lighter today for the chest: 2 sets trimmed." Barbell Bench Press
   now reads "3 × 45 × 3-5 @ RIR 3": a set fewer, a rep more in reserve, the same load.
8. Settings, **Learned from your log**: **Your recovery** says "Nothing learned yet: it reads each
   session with hard work from this version on." It also says what it reads, and offers **Forget
   your recovery windows**, which asks once more ("Confirm: forget your recovery windows" or "Keep
   it").

### 1D. Round J (Maintenance 28): training time, not time left open

1. **Today**, **Start Workout**. Tap **Log set** at once, and again when the rest ends. Then leave
   the workout five minutes without a tap. **End workout early**, **End and save**: **Duration**
   reads about 3 min (up to your second set), not the eight or so minutes the workout was open.
2. **Progress**, **History**: the row reads "… · 3 min · 2 sets · … · ended early". Tap it: "3 min
   of … planned, ended early". Settings, **Learned from your log**, **Your pace**: "Still learning:
   none yet of the 3 workouts it needs." A workout this short is never read as a pace.

### 1E. Round K (Maintenance 29): the buzz, the screen kept on, the length line and Back

In this order: the barcode goes in before Start.

1. **Plan**, **Where you train**: on the **Gym** row tap **Barcode**, then **Add a barcode**, pick
   any screenshot, and tap **Done**.
2. **Today**: the **Workout length** box reads "Default: N min", and no "Default time: about N
   min." line repeats it. Pick **30 min**: "Fitted to 30 min: about N min." shows under it. (A
   "45 min would close …" line beside it comes from Maintenance 34.) Pick the Default again: the
   line goes.
3. Open **Progress**, then **Today**. Tap **Check in**, then the phone's Back: the check-in closes
   and Today stays. Tap **Check in** again and close it with its **×**: one Back now goes straight to
   Progress.
4. **Today**, **Location**: "Where are you training?" opens. Tap **Manage places on the Plan tab ›**:
   Plan opens. One Back: Today, with no sheet open.
5. **Today**, **Start Workout**: the **Gym barcode** opens over the workout. One Back: only the
   barcode closes, and the workout stays.
6. Tap **Log set**. Shorten the rest with **−15 s** if you like, and open **Progress** while it
   runs. With three seconds left you hear three ticks, each with a short buzz, then a longer tone
   with a double buzz (sound needs the media volume up). Back on **Workout**, tap **Log set** again
   and tap **Skip** early in its rest: nothing plays.
7. Settings, **Alerts**: turn **Rest timer sounds and vibration** off. **Workout**, **Log set**: the
   rest ends with no sound and no buzz. Turn the switch on again.
8. With the workout running, leave the phone untouched past its usual screen timeout: the screen
   stays on, on any tab. Switch to another app and back, then leave it again: it still stays on.
   Tap **Pause** and leave it: the screen sleeps as usual.

### 1F. Round L (Maintenance 30): Plates and Weights, pin stack or plates, loaded versions

A gym lower-body day; steps 1 to 5 come before the workout starts.

1. Settings, **Goals**: set **Secondary goal** to **No secondary goal**, then **Primary goal** to
   **More overall size**. **Today**'s workout is now **Lower body**.
2. **Today**: the calf raise is the **Leg Press Calf Raise**, and **Why this workout** says "Leg
   Press Calf Raise in place of the Standing Calf Raise: on two legs, bodyweight is too light for
   its reps." The **Bulgarian Split Squat** stays at **Bodyweight**.
3. Settings, **Exercise library**: search **Dumbbell Reverse Lunge**, **Dumbbell Bulgarian Split
   Squat** and **Standing Calf Raise Machine**. Each is listed, and each opens with its own
   **Setup**, **Do it**, **Key cues** and **Avoid**.
4. Settings, **Weights at your places**, **Place** **Gym**: **Plates** ("Plates at Gym"),
   **Dumbbells and kettlebells**, and **Machines**, one machine at a time from the **Machine** list.
   **Place** **Home**: **Dumbbells** only.
5. Back on **Gym**, **Machine** **Leg Press**: **Pin stack** is on. Tap **Set this machine**, fill
   **Lightest** 10, **Heaviest** 300 and **Jump** 10, and tap **Save for Gym**: "Stack: 10 to 300 by
   10 lb. Targets land on these and stop at 300 lb." Tap **Plates**: "Its weight is the plates
   loaded on it, the same on each side; the sled is not counted." Pick **Leg Press Calf Raise**: it
   is on **Plates** too, because the switch belongs to the machine. Pick **Leg Extension**, then
   **Leg Press** again, and tap **Pin stack**: the stack "10 to 300 by 10 lb" is back.
6. **Today**, **Start Workout**: the **Back Squat**'s tabs read **How to**, **Notes**, **Plates**,
   **Options**. Open **Whole workout** and tap each row. The Romanian deadlift, the leg curl, the leg
   extension and the leg press calf raise read **Weights**. The Bulgarian Split Squat and the Ab
   Wheel Rollout have no such tab.
7. On the **Leg Press Calf Raise**, tap **Weights**: **Pin stack** and **Plates**. Tap **Plates**:
   the tab now reads **Plates**, over "Its weight is the plates loaded on it, the same on each side;
   the sled is not counted." and the plates at Gym.
8. Tap **Back to the current set**. On the Back Squat, then on the Romanian deadlift, tap
   **Options**, **Skip today**. On the **Bulgarian Split Squat**, the hint under the weight reads
   "Bodyweight" in plain words. Type 20 on its weight: a **Weights** tab appears, and the set reads
   "Bodyweight plus 20 lb".

### 1G. The older reviews: Maintenance 4 to 25 and Phase 8

The Gym is today's place. The workout started in step 7 serves steps 7 to 18. Each step ends with
the reviews it closes.

1. **Settings**: each row shows its value and opens in place. **Schedule** reads "Intermediate · 4 a
   week · 60 min · Mon, Tue, Thu, Fri". **I have gym access**, **Rest timer sounds and vibration**
   and **Notifications** are switches in their rows, with nothing to open. **Your data** and
   **About** come last. Open **Cloud copy**: a **Database address** field and a **Database token**
   field with **Save**, and Token reads "Not set". Type nothing and tap nothing there. (M25, #26
   step 5; M9, #10)
2. **Settings**, **Exercise library**, **Leg Press**: its own video loops with **Slow**, and under it
   reads "The video lowers further than the steps: stop at about 90 degrees, before your hips
   lift." **Dumbbell Row** says "Shown with a kettlebell; a dumbbell is held and pulled the same
   way." **Band Pull-Apart** shows a diagram. Each loop starts again without a jump. Back in
   Settings, **About**, **Demonstration credits** lists who made each video and drawing. (M25, #26
   step 9)
3. **Settings**, **Programming**: **Auto** is first, with "Your goals choose: Hypertrophy focus right
   now". Tap it: the panel reads "Auto picked Hypertrophy focus" and says why. **The research**
   opens the studies. In **Goals**, turn on **Losing fat right now**: the Programming row now reads
   "Auto: Lean-down". Turn it off again. On **Today**, under **What the conductor knows**, Style
   reads "Auto · Hypertrophy focus". (M15, #16 steps 1-3)
4. **Today**: the first lift, **Barbell Bench Press**, is planned at 45 lb, the empty bar, because it
   has never been logged. In Settings, **Units and body**, enter Bodyweight 180 and Age 35, and pick
   **Male**. Back on **Today**, the bench press now has a starting weight and 2 warm-up sets, and the
   other lifts have weights too. (M5, #6 steps 1, 4)
5. **Plan**: **This week** lists the days with **Change days ›**, which opens Settings with
   **Schedule** open at the top of the screen. Back on Plan, **Every muscle on Progress ›** opens
   **Progress**. **Recovery balance** ends "No deload week needed. Fatigue fresh (score 0)." In
   Settings, **Where you train** opens Plan's **Where you train** card. (M25, #26 step 6; M4, #5
   step 1)
6. **Today**: pick **30 min** and open **Why this workout**. "Shortened rests toward the realistic
   minimum." shows once. The incline press has one line, "Trimmed 2 sets from Incline Dumbbell
   Press.", and no line repeats. Above them, a line ends "are behind this week: the accessories
   lead with them." Pick the Default length again and note its minutes ("Default: N min"). (M25,
   #26 step 4; M4, #5 step 2; M16, #17 step 1)
7. Tap **Start Workout**. **Elapsed** plus **Left** equals the Default minutes. On the bench press
   card, the tempo notation sits at the end of the tempo bar, with the phase labels under it. The
   demonstration stands alone on the right, and there is no empty space under the labels. Tap the
   bar, a label or the notation: four rows open, **Tempo**, **Cue**, **Effort** and **Rest**, with
   **Why: the research** closed. Open it: each line starts with a bold lead. (M16, #17 steps 2-3;
   M8, #9 step 1)
8. **Options**: **Why this target** reads "Starting estimate from your 180 lb bodyweight,
   intermediate lifter, male, age 35: about 166 lb max; …". Close it. Tap **Know your max?**: the
   sheet starts "No max attempt needed.", with **A recent set** and **I know my max**, and the reps
   box reads **Reps you got**. Type 135 and 8: "Estimated max about 171 lb from that set. First
   target: 120 lb × 4-6 reps at RIR 2." Tap **Save**: the line at the top reads "First target for
   Barbell Bench Press set from your max.", and the warm-up and the dial move up with it. Open
   **Options** again: **Your max** reads "171 lb, entered" with today's date, the button reads
   **Update your max**, and **Why this target** starts "Your max for Barbell Bench Press: 171 lb."
   (M5, #6 step 3 and comment; M14, #15 comment step 1)
9. Before logging anything, the hints under the dials read "Warm-up 60 lb", "Target 4-6" and "Easy,
   RIR 5", none cut off. Tap **Log warm-up set**: **Left** drops by the 5-minute warm-up plus the
   set. Log the second warm-up: the two fold into one line with **Undo**, and a tap opens them. The
   logger names the set, "SET 1 OF 3", and its small drawing shows the plates for 120 lb (35 and 2.5
   each side), not a warm-up's. Turn the reps down to 0: the green button reads **Skip set**. Turn
   them back up. (M21, #22 step 4; M16, #17 step 2; M11, #12 steps 1-2; M8, #9 comment)
10. **Plates**: one end of the bar is drawn as loaded. The heaviest plate sits against the collar,
    each plate shows its weight, and the bar shows 45 lb. Under it reads "120 lb = 45 lb bar + 37.5
    lb of plates each side". **Today** is selected and the plate buttons sit on one row. Tap
    **2.5**: it reads "No 2.5 today: the bar moves by 10 lb. Back next workout.", and the drawing and
    the target change at once; tap 2.5 again. **Default**: tap **35**: it is struck through and
    **All plates** appears. Reload the page and open **Plates**: 35 is still gone from the row. In
    Default, tap **All plates**. There is no **Done**. Tap the weight on the dial and type 600: every
    plate's weight is readable, and the collar covers none; a long side is drawn once per size, with
    its count. Type 120 back. (M25, #26 step 11)
11. Log a set of 6 reps with 1 in reserve, then one of 4 reps with 0 in reserve. The coach card
    reads "Rest 30 s longer before the next Barbell Bench Press set", with **Add 30 s to this rest**
    and **Not now**. Tap **Add 30 s to this rest** once: "Added 30 s to this rest." shows, the timer
    reads "3:00 planned", and the card goes. Each set you logged has its own line and opens to edit.
    (M25, #26 step 3; M8, #9 comment)
12. Leave the last bench set undone. On **Today**, tap **Location** (Gym ›): the sheet "Where are you
    training?" lists Home and "Gym · today". Tap **Home**: "Rebuilt for Home: …" appears with **What
    changed**. The bench press reads "Stopped: 2 of 3 sets done", and **Dumbbell Bench Press** follows
    it with the set still owed. Pick **45 min**, then the Default again: Dumbbell Bench Press is
    still right after the bench. Settings, **Where you train** reads "Home (current), Gym · on Plan".
    (M21, #22 comment; M8, #9 step 2)
13. **Workout**, on Dumbbell Bench Press, open **Weights** (the tab after **Notes**): it reads
    "Dumbbells at Home" and "Not set yet, so targets move by 5 lb with no upper limit." Tap **Set my
    dumbbells** and enter **Lightest** 5, **Heaviest** 20, **Jump** 5: the line under them reads "5 to
    20 lb in 5 lb jumps". Tap **Save for Home**: it reads "Dumbbells: 5 to 20 by 5 lb. Targets land
    on these and stop at 20 lb.", and the set is now planned at 20 lb with more reps. (M14, #15
    comment step 2)
14. **Options**, **Equipment busy**: "Dumbbell Bench Press moved after Incline Dumbbell Press: its
    equipment is busy. It comes up again once Incline Dumbbell Press is done." The incline press is
    now in front. Tap **Know your max?** and type 20 and 15: "Estimated max about 30 lb per hand from
    that set. First target: 20 lb × 6-10 reps at RIR 1." Change the reps to 20: "… 8-12 reps at RIR
    1. Held at the heaviest weight here (20 lb): the reps go up instead." Then 25: "… 16-20 reps at
    RIR 1. Held at the heaviest weight here (20 lb): about 10 more reps, to 1 in reserve." Tap
    **Save**: the incline press is planned at 16-20 reps. (M25, #26 steps 1-2)
15. Log the incline's warm-up, then a set of 18 with 1 in reserve and one of 15 with 0. The rest card
    comes back; tap **Not now** and it goes. **Options**, **Skip today**: no red box appears, and
    Dumbbell Bench Press is in front again. In **Whole workout**, tap **Incline Dumbbell Press**: the
    warm-up and the two sets are kept, and the rest read "skipped". (M21, #22 step 3; M11, #12 step
    3; M25, #26 step 1)
16. On **Today**, tap **Dumbbell Shoulder Press**, then **Skip today**. Do the same for **Band Fly**,
    **Overhead Triceps Extension** and **Lateral Raise**. That leaves **Dumbbell Curl**, marked DROP
    SET. Back on **Workout**, tap **Options**, **Equipment busy**: the bench press moves after
    Dumbbell Curl. Log the curl's sets as they come. After the last one, the drop set's line reads
    "Drop N lb", below the weight you just lifted, with "Aim 8-12" and "Last clean rep". Log it.
    (M11, #12 step 5; M25, #26 step 1)
17. Dumbbell Bench Press is in front with nothing after it. In **Options**, **Equipment busy** is
    greyed out, with "Nothing after it is left to do, so there is nothing to move it behind: do it
    now, skip it today, or finish the workout." **Whole workout**, tap **Barbell Bench Press**:
    "Viewing Barbell Bench Press." shows over its sets, each opening to edit. Tap **Back to the
    current set**. (M25, #26 step 1; M11, #12 step 4)
18. Log the last set, then tap **Finish workout**, **Save workout** and **Done**. **Today** now shows
    **Second workout**. Its **Why this workout** names the muscles that have had days to recover, and
    says those "trained in the last two days" sit out. (M4, #5 step 2)
19. **Progress**, Lifts: each lift you logged appears once, with "~N lb max" and its confidence. Tap
    one: its session. (M25, #26 step 7)
20. Settings, **Your data**, **Export and import**, **Export Full Backup JSON**: the file saves (to
    the phone's downloads; it holds only this tab's made-up workout, so delete it after).
    **Automatic backups** lists one copy, "After a workout". **Storage and save check**, **Run save
    check**: it reads "Passed". (Phase 8 step 16)
21. Last, and only if you have three hours: tap **Start Workout** on the second workout, log one
    set, and leave the Incognito tab open (the phone can lock). Three hours later the coach card
    reads "This workout has been open for 3 hours". **End and save it** opens the end-of-workout
    sheet, and **Not now** puts the card away for this workout. (M14, #15 step 4 and comment)

### 1H. Maintenance 37: custom equipment presets

1. Settings, Places, **Equipment presets**: Home and Full gym, each "Built in, always here", with
   no Edit.
2. **New preset**: name it "Hotel gym", tap **Full gym preset**, take a few things off, then **Save
   preset**: "Hotel gym" is listed with its count of items.
3. **Plan**, **Where you train**, **Edit** on Gym: **Hotel gym preset** sits beside Full gym preset
   and Home preset. Tap it, then **Save place**: Gym's line reads the preset's count of equipment.
4. Back in Equipment presets: **Edit** "Hotel gym", rename it "Hotel", take one more thing off,
   **Save preset**. Then **Edit**, **Delete**: it asks first ("Delete Hotel? The places you filled
   from it stay as they are."); **Delete preset**. On Plan, Gym's count is still the one in step 3.

### 1I. Maintenance 38: the split's order across the days

1. Settings, **Schedule**: 3 sessions a week, ticked on today and every other day after it (today,
   the day after tomorrow and two days after that), every other day off.
2. **Today**: the lower day. Under **Why this workout**: "Lower body today in place of Upper body: in
   this order the quads, hamstrings and glutes are not worked hard again inside their recovery
   windows in the week ahead."
3. **Plan**: lower, upper and full body, in that order, and under the week: "In this order the
   quads, hamstrings and glutes are not worked hard again inside their recovery windows."

### 1J. The priority-muscles fix

As in 1I, Settings, **Schedule**: 3 sessions a week, ticked on today and every other day after
it, every other day off.

1. **Today**: the lower day. The chips under its title read Glutes, Hamstrings, Quads, Abs. Under
   **Why this workout**: "Priority muscles today: Glutes: ..., Hamstrings: ..., Quads: ...", and no
   biceps or triceps.
2. **Plan**, **Priority this week**: the biceps and the triceps, as before.

## Part 2: on your installed app, now

### 2A. The update and the launcher icon

1. Open Workout Conductor from its home-screen icon. If "New version available" shows, tap Reload.
   Settings, About this app shows the build under Verification: `e3f7acf`.
2. Close the app and open it again. Chrome reads the manifest as the app opens and finds the new
   icon. If it asks about the new icon (a dialog, or "Review app update" in Chrome's menu), accept
   it.
3. Close the app. On Wi-Fi, Chrome rebuilds it in the background, usually within minutes, and the
   home-screen icon changes in place.
4. If nothing changes after that: in Chrome, open `about://webapks`, tap Update under Workout
   Conductor, then open and close the app once more.
5. The launcher icon: the new dumbbell, silver plates with green rings on a dark grey backdrop,
   whole, reaching toward the tile's edges about as far as the widest icon beside it, the backdrop
   to the edge. The logo in the app's header and the browser tab's icon show the same dumbbell,
   closer (after Reload in step 1).

### 2B. Coaching switches (Maintenance 34 and 36)

1. Settings, **Coaching**: "Too soon" warnings, "Longer would help", Goals and time and After a
   schedule change are each on, each with its line under it.
2. Turn "Longer would help" off: a line on Today reading "N min would close most of this week's ...
   gap", if one showed, goes. Turn it on again.
3. Turn After a schedule change off and on again: it stays as turned.

### 2C. Life Mirror's check-in (Maintenance 35, item 48)

1. Settings, **Life Mirror**: "Use Life Mirror's check-in" is off. Open Today's check-in: it asks as
   it always has.
2. Turn it on, after a Life Mirror check-in this morning: Today's check-in shows your energy, sleep
   and motivation from it, and its stress and mood, each "From Life Mirror" with the time; soreness,
   joints, illness and time are asked. Change one: its label goes.
3. Apply it: Today's summary names the stress and mood with the rest ("... motivation 3/5 · stress
   2/5 · mood 4/5.", your own numbers). Leave the switch on or off, as you want it.

### 2D. Round J (Maintenance 28): your pace

1. **Progress**, **History** (tap **Show N more** for older workouts): a workout once left open for
   hours reads the minutes of its sets, not the hours it stayed open. Under **Efficiency and
   patterns**, **Duration** reads the minutes you trained against the minutes planned.
2. Settings, **Learned from your log**: **Your pace** comes first. It says how your workouts run
   against the plan's own estimate: "Your workouts take about N% longer than the plan's own
   estimate, from the last N workouts it could read." (or "less time", or "Still learning: …").
   Leave **Forget your pace** alone.
3. **Today**, **Why this workout**: if your pace moves the plan by 2% or more, a line reads "Fitted
   at your own pace: your workouts take about N% longer than the plan's own estimate." The **Time**
   line ends "…, N min more at your pace." (or "less").

### 2E. Round N (Maintenance 32): your programming style

1. Settings, **Programming**: under Hybrid, Strength focus or Lean-down (or Auto with one of them),
   your main lifts run a top set and back-offs, checked in 3A. Under Hypertrophy focus, Undulating,
   Light weights or Foundation, every lift stays on straight sets and 3A's steps 3 to 7 have nothing
   to show.

### 2F. The older reviews on your own app: Maintenance 9, 10, 14, 17 and 25, and Phase 8

Look only. Change no setting, place, weight or schedule, and never touch the token or the database.

1. Open Workout Conductor from its home-screen icon (2A step 1 covers any update). Settings, **About
   this app**: Display reads "Installed app (standalone)", and there is no address bar. Your
   profile, places, schedule and settings are as you left them. **Progress** has your history: each
   lift appears once with its max and confidence (a pull-up or a band move shows none); tap a lift:
   its newest eight sessions show, the rest behind **Show N more**; under History, the five newest
   workouts show, the rest behind **Show N more**. (Phase 8 steps 13-14; M10, #11 step 1; M9, #10;
   M25, #26 step 7)
2. Settings, **Cloud copy**: the database is as before. Token reads "Saved on this device", Status
   reads "Last sync …", and Pending reads "0 changes waiting" once it has synced. **Not in the copy**
   names the Gym barcode, "with a second copy on this phone". Do not tap **Change database** or
   **Remove token**. (M9, #10; M10, #11 steps 1, 3; Phase 8 step 18)
3. **Storage and save check**: **Protected** reads Yes; if it reads Not yet, tap **Keep data on this
   device**. The **Token log** lists dated entries, each naming the copy, never the token.
   **Automatic backups** lists up to three, each made after a workout. (M10, #11 steps 2-3; Phase 8
   step 16)
4. **Plan**, **Where you train**, **Barcode** on the Gym row: your barcode shows; close it with
   **Done**. Swipe the app away and open it again: the barcode is still there. Turn on airplane
   mode, swipe the app away and open it again: still there. Still in airplane mode, Settings,
   **Exercise library**: an exercise you have watched in a workout plays; one you have not watched
   shows its first frame with "Shown as a still: the video plays here once you are online." Turn
   airplane mode off with it open: the video starts within a few seconds. At your next gym workout,
   **Start Workout** brings the barcode up as before. (Phase 8 step 17; M25, #26 step 10)
5. The update on return: leave the app in the background, not closed. A new release goes out: ask
   the builder to run Deploy Pages, or run it yourself on GitHub (**Actions**, **Deploy Pages**,
   **Run workflow** on main). When it has finished, switch back from the recent apps: "New version
   available" appears within a few seconds. Tap **Later** and it goes. Switch away and back: it is
   offered again. Tap **Reload**: **About this app** shows the newer build time, and your data and
   the barcode are unchanged. (Phase 8 steps 15, 17)
6. In your next workout, after a set or two, swipe the app away and open it from its icon: the
   workout is there at the set you were on, with your sets. If **Notifications** is on in Settings,
   **Alerts** (leave it as it is), log a set and switch to another app: when the rest ends, a "Rest
   is over" notification arrives (with the phone locked it may come late or not at all); tap it and
   the workout comes back. (M17, #18; M14, #15 steps 1, 3)
7. Phase 8's question: if your goals, schedule or places ever looked reset to their defaults around
   the days the barcode went missing, say so. An exported or automatic backup can put them back.
   (Phase 8 step 19)

## Part 3: as it comes up in your training

### 3A. On a day your schedule ticks

Before you start (Maintenance 34):

1. Where the week is short of your goals' muscles, a line under the length reads "45 min would close
   most of this week's biceps gap" (or the length and the muscles it names), with **Use 45 min** and
   **Not now**. **Use 45 min** changes the length and the line goes; **Not now** keeps yours. Either
   is an answer the app learns from. The line shows on two days in seven at most, all that day.
2. A lift whose reasons start "A set more for the …, which this week is short of.": the week's need
   carried into the room the length leaves. Pick a shorter length: those sets go first, and the
   plan's own stay. Pick your length again after.

Under Hybrid, Strength focus or Lean-down (Maintenance 32, 2E):

3. Before you start, the lift marked **Main lift** reads like "1 × 190 × 4-6 @ RIR 1, then 3 × 180 @
   RIR 2" (your numbers): one top set a rep short of failure, then back-offs at the same reps, about
   5% lighter (the nearest weight the place has), two short. Other lifts read plain straight sets.
   The main lift runs straight sets instead the first time it is logged, after a break, on an eased
   load (a deload, a reset, the coach's deload), when fatigue is high, in a deload week, on a
   catch-up or second workout, as your lift to push, or where the weights there cannot make the top
   set.
4. In the workout, the main lift's first working set is headed **Top set**, with "Target RIR 1". The
   list above the logger reads "… more sets · 4-6 reps @ RIR 1, back-offs @ RIR 2". Tap the tempo
   bar under the lift's name: **Effort** reads "RIR 1 · top set: stop 1 clean rep short of failure;
   the back-offs follow it".
5. **Options** on that lift: **Why this target** says "Top set, then 3 back-offs at 180 lb, 5%
   lighter at 2 in reserve: they follow the top set as you lift it, and back-offs missed never hold
   back the top set's next step: they widen the drop." (your numbers).
6. After the top set comes **Back-off 1 of 3**, with "Target RIR 2" and **Effort** "RIR 2 · back-off:
   after the top set, stop 2 clean reps short". If the top set went at another weight than shown,
   or clearly easier or harder than asked, the back-offs move with it, never above it as lifted, and
   a line near the top says so, for example "Barbell Bench Press: back-offs at 185 lb, from the top
   set at 195 lb."
7. After the workout, **Progress**, **History**, that session: the main lift reads "top 190 × 5 @ RIR
   1 · back-off 180 × 5 @ RIR 2 · …".

### 3B. On a day your schedule does not tick, after a workout earlier this week

Before you train (the app chooses the day's workout, and Maintenance 31):

1. **Today** shows "Catch-up" and the line "Not one of your training days: a N-minute catch-up for
   what is behind this week." N is under your Default (about 45 for an hour). No button chooses
   another kind of workout. Change the length or the place, and back: it stays the app's one
   workout.
2. **Why this workout** starts "A catch-up for what this week still lacks: …, a few sets each and
   none to failure." Every lift has 2 or more working sets at @ RIR 1 or more (2 for a beginner).
   None is marked **Drop set** or **Lift to push**, the main lift reads plain sets with no "then …
   back-offs", and nothing is for a muscle you trained in the last 48 hours.
3. If nothing is short this week, the line says "Not one of your training days, and nothing is
   behind this week." over the day's usual session. In a deload week it says just "Not one of your
   training days."

### 3C. Any evening after 8 pm (Maintenance 28)

1. **Plan**, **Upcoming sessions** lists only the days your schedule ticks, each with its right
   date. On a day it ticks, the list starts with **Today** until you train. Under **Saved
   workouts**, the name box ends with today's date, not tomorrow's.

### 3D. Where a lift sits at the heaviest weight a place has (the harder-variation fix)

1. Where the Adaptive Coach offers **A harder variation**, tap it: the lift's sheet opens with the
   harder variation first, its reasons saying "still heavy with the weights you have".
2. Where the lift's sheet lists none ("No safe alternative fits Home and your limitations"), the
   coach shows no such card, and the lift's own line says the reps go up instead.

### 3E. After weeks of your own log

1. After three weeks of short sessions with your goals' muscles under 4 sets a week (Maintenance
   34): a card "… under 4 sets a week for 3 weeks"; **Adjust time** opens Settings at the schedule.
2. Maintenance 27's items 45, 46 and 49 show a card only when your log shows its pattern: a pain
   pattern within 42 days, four weeks of a schedule, an accessory twelve weeks in the plan.
3. The schedule watch (Maintenance 36) shows a card only four to eight weeks after a change of your
   days or sessions a week, and only when two lifts fall clearly; **Go back to it** puts the
   schedule before it back.

## What closes each gate

| Gate | Closed by |
|---|---|
| The priority-muscles fix | 1J |
| Maintenance 38: the split's order across the days | 1I |
| Maintenance 37: custom equipment presets | 1H |
| Maintenance 36: the schedule watch | 2B step 3; its card (3E step 3) needs weeks, and the tests hold it |
| Maintenance 35: item 48, Life Mirror's check-in | 2C |
| Maintenance 34: time intelligence | 2B steps 1-2, 3A steps 1-2, 3E step 1 |
| The app chooses the day's workout | 1B step 3 (the second workout, with no button), 3B |
| The harder-variation fix | 3D |
| Install the app, and the launcher icon | 2A |
| Maintenance 33: recovery and readiness | 1C |
| Maintenance 32: round N, item 11 | 2E, 3A steps 3-7 |
| Maintenance 31: round M, items 12 and 32 | 1B, 3B |
| Maintenance 30: round L, items 6, 30 and 31 | 1F |
| Maintenance 29: round K, items 7, 8, 10 and 14 | 1E |
| Maintenance 28: round J, items 1, 3 and 4 | 1D, 2D, 3C |
| Maintenance 27: round I | 1A, 3E step 2 |
| Maintenance 25: round G (#26, steps 1-7 and 9-11) | 1G steps 1, 2, 5, 6, 10, 11, 14-17, 19; 2F steps 1, 4 |
| Phase 8 (steps 12-19) | 1G step 20; 2A; 2F steps 1-5, 7 |
| Maintenance 21 (#22) | 1G steps 9, 12, 15 |
| Maintenance 17 (#18) | 2F step 6 |
| Maintenance 16 (#17) | 1G steps 6, 7, 9 |
| Maintenance 15 (#16) | 1G step 3 |
| Maintenance 14 (#15) | 1G steps 8, 13, 21; 2F step 6 |
| Maintenance 11 (#12) | 1G steps 9, 15-17 |
| Maintenance 10 (#11) | 2F steps 1-3 |
| Maintenance 9 (#10) | 1G step 1; 2F steps 1, 2 |
| Maintenance 8 (#9) | 1G steps 7, 9, 11, 12 |
| Maintenance 5 (#6) | 1G steps 4, 8 |
| Maintenance 4 (#5) | 1G steps 5, 6, 18 |

## Covered or superseded, not asked

These were built and later changed, so the steps above check them as they are now:

- **Round M's choice of workout kind on Today** (Full session beside the catch-up's line, Catch-up
  instead, Go easy instead) went with the owner's word of 2026-10-31: the app chooses the day's one
  workout, and the line carries no button. A copy loaded with nothing left for today is not loaded
  ("Nothing in "<name>" is left for today: today's plan stays.") and has no Use.
- **The week ahead at the Default length** (rounds J and M) became, in Maintenance 34, each day at
  the length you usually train that weekday, and today at today's length.
- **Round J's count of training days in a row** in the fatigue score went in Maintenance 33, which
  took every day count out of fatigue.
- **Maintenance 33's "too soon" card, always on,** is behind Settings, Coaching, "Too soon" warnings
  since Maintenance 34 (on until turned off).
- **Maintenance 33's check-in** gains Life Mirror's stress and mood in Maintenance 35, behind a switch
  that is off until you turn it on.
- **The catch-up decision's step 2** (a second workout with no button) is 1B step 3.

Not on the phone, because they need weeks of history or long sequences; the tests hold them:

- **Maintenance 28:** the deload week, Consistency's weeks, export names and old exports read on the
  device's day, a pace that shortens no rest, and Left at your pace.
- **Maintenance 29:** the buzz stopping when a rest is paused or changed, a hold's own countdown, the
  screen let go after half an hour with nothing logged, and a Back pressed in the instant a sheet
  closes.
- **Maintenance 30:** the rule across workouts (a rep past the top of the range at bodyweight loads a
  move, and a hotel's bodyweight sets never undo the gym's loaded one), kept swaps and favourites, a
  plate missing today on a machine, and a weights save racing a Settings change or a place deletion.
- **Maintenance 31:** a catch-up leaving the split's turn as it was, the 48-hour rule across days,
  deload weeks, and plans emptied by your own changes.
- **Maintenance 32:** the drop's own correction (it moves only after two sessions running miss the
  back-offs' reserve the same way), and a lift leaving the structure after a change of style or
  split.
- **Maintenance 33:** the first-set check against rested sessions, the hard start's reading, windows
  learned from your sessions, two short nights running, the fatigue score, and the schedule card's
  line.

From the older reviews, not asked:

- **#5 (Maintenance 4) step 1,** the deload week suggested after a dense, hard fortnight, with Plan
  it: it needs six sessions in 14 days with fatigue scored 4 or more, and Maintenance 33 since reads
  fatigue from each set against what it asked. The unit tests hold the card; "No deload week
  needed" is 1G step 5.
- **#6 (Maintenance 5),** a first bench press starting on a ramp set at 45 lb: since Maintenance 13
  (passed), with no max and no bodyweight the bench starts at Set 1 on the empty bar, with no
  warm-up at 45.
- **#10 (Maintenance 9),** bringing a second person on (a new database, a token from the dashboard,
  a setup link): this review never asks for a database or a token. `e2e/cloudSetup.spec.ts` holds
  the link.
- **#11 (Maintenance 10) step 1,** opening the app once so it updates: 2A step 1. 2F step 1 checks
  the history as a whole.
- **#15 (Maintenance 14) step 1,** turning Notifications on: it would change a setting, and Chrome
  refuses notifications in Incognito; 2F step 6 checks one only where the switch is already on.
  **Step 2,** three ticks and a longer tone: since Maintenance 29, one switch adds a buzz to each;
  1E step 6 checks both.
- **#16 (Maintenance 15) step 1,** the gold card with Let my goals choose: it shows only on a
  profile saved before Maintenance 15, and its tap would change your real style; `e2e/styles.spec.ts`
  holds it. **Step 4,** Undulating's rotation: it shows only across several sessions of one lift;
  the unit tests hold it.
- **#22 (Maintenance 21) steps 1-2,** the chin-up card on a chin-up day: both need two real sessions
  short of 6 reps; `e2e/coachAndHints.spec.ts` holds both on seeded history. **Step 3,** Not now on a
  card with no button: such a card is a note built from weeks of logs; 1G step 15 checks Not now on
  a card with a button.
- **#26 (Maintenance 25) step 5,** Settings at about two and a half screens: Maintenance 27, 30 and
  34 to 37 added rows since, so Settings is longer; the rest of the step is 1G step 1. **Step 9,**
  Pause and Play on a diagram: there is no Pause since Maintenance 26, item 50 (passed).
- **Phase 8 steps 12 and 13,** opening from the icon and the build line: 2A steps 1 and 2; Display
  is 2F step 1.
