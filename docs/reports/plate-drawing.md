# The plate drawing, as the owner's reference draws it (2026-11-20)

Built on the owner's word of 2026-11-20, outside the rounds, as its own chunk after the final polish.
YELLOW: waiting for the owner's phone review, like every round since 2026-10-11.

## The ask

The owner, with a reference picture of a plate calculator at 80 lb: "As you can see in the
reference, the barbell has a darker shade and the number is able to fit inside of it, and it
doesn't have anything like a circle or anything else around the number it's just white number. And
look at the plates. And compare it with yours. Continue to try to make it look as accurate to the
reference images possible. Generate a few ideas before pushing the design."

## Measured from the reference

Sampled from the picture's pixels, in CSS px:

| Part | The reference | The drawing before |
|---|---|---|
| The bar | one flat dark shade (`#333542` on a `#23232f` sheet): a sleeve 30 px thick with a rounded end, a collar 11 × 41 px, the bar 30 px thick, running on off the screen | a light silver gradient: an 11 px sleeve, a 7 px knurled bar |
| The bar's weight | "45 lb" in plain white bold inside the bar, 17.5 px in from the collar | in a bordered dark pill on the thin bar |
| The plates | every plate 34 px wide, 1 px apart, corners 4 px; the 2.5 and the 5 77 px tall, the 10 112 px | widths by thickness (18 to 25 px), heights by real diameters (35 to 88 px), edge-on shading, borders and shadows |
| Their colours | lit from the top: green `#3f9d56` to `#233f30` (2.5), blue `#2862a6` to `#16345a` (5), white `#fdfdfd` to `#c7c8ca` (10) | 2.5 chrome, 5 red, 10 white, flat |
| Their numbers | 17.5 px bold, centred on the bar: white on green and blue, black on white | 9.5 to 12 px |

## Three ideas

Each drawn in the app's own structure, in a panel as wide as the Plates panel at 412 px, at 80 lb
and at 185 lb, beside the reference and the drawing before:

1. **The reference, exact:** as measured; the plates above 10 lb by their real diameters (a 45 at
   192 px).
2. **The reference, kept compact:** as idea 1, the plates above 10 lb capped at 150 px (25 lb 128,
   35 lb 140, 45 lb 150) so a heavy bar keeps the card short. **Built.** At 80 lb it is idea 1; the
   reference shows no plate above 10 lb.
3. **Idea 2 with a little depth:** a hairline of light along the top of each part. Not built: the
   reference is flat.

## The build

- `src/components/PlateStack/plateLook.ts`: every plate as the reference's, 34 px thick with its
  number at 17.5 px bold, widened only for a longer number (1.25 kg); lit from the top
  (`plateFill`). In pounds a plate takes the colour of the kilo plate nearest it, as the reference's
  three do: 2.5 green, 5 blue, 10 white, 25 green, 35 yellow, 45 blue. Kilo plates keep their
  competition colours, lit the same way, the 2.5 kg red as competition change plates are.
- `PlateStack.module.css` and `PlateStack.tsx`: the bar one flat dark shade across the panel, its
  weight in plain white inside it near the collar, the bar running on past it into the room the
  plates leave, as the reference's runs off the screen; the sleeve as long as the room allows. The
  small drawing under the set logger is the same in small, its 45 at 40 px as before.
- The sleeve holds six of the reference's plates; a side that needs more room is drawn once per size
  with its count, as before. At 360 px in a wide font the room is under five plates, so 290 lb (a
  2.5, a 5, a 25 and two 45s) draws the 45s once, with ×2; in a narrower font, as on the CI runner
  and the phone, all five show.

**Changed from Maintenance 25's drawing, on the owner's word:** the change plates are alike, not by
diameter; the 2.5 and the 5 share their colours with the 25 and the 45, told apart by size and
number; every plate is one thickness; and the plates above 10 lb are capped at 150 px.

## Tests

- `src/components/PlateStack/PlateStack.test.tsx`: the reference's heights, every plate's colour in
  pounds and kilograms, the gradient and the number size; every number at 4.5:1 or more against its
  plate's middle; the thickness, wider only for a longer number; the sleeve's room (six plates, five
  where they just fit, fewer in a wide font at 360 px); the small drawing's sizes.
- `e2e/plates.spec.ts`: at 80 lb the drawing's computed look: the bar's shade and thickness, its
  weight plain white with nothing around it, the bar running on past it, the collar, each plate's
  gradient. At 360 and 412 px in a wide font, every number inside its plate, the collar clear, the
  bar and its weight inside the drawing, at 80, 290 and 625 lb. At 290 lb it reads whether the
  drawing grouped the side and asks for the matching plates, and at 412 px for all five: the first
  CI run, in the runner's narrower font, fit all five at 360 px where Verdana groups them, and the
  check had assumed the grouping from the width alone (`f87cc7b`). Run in Verdana and in Arial.

## Review

One bounded adversarial review, with captures measured against the reference and probes. At 80 lb
the build matched the reference to a device pixel or two in every part measured: the sleeve's
thickness, the plates' widths, heights, gaps and corners, the collar, the numbers' height and place,
and "45 lb" from the bar's start. What remains differs outside this change: the panel's own colour
and the phone's typeface. It found seven:

1. **MEDIUM, the 2.5 kg black plate vanished** into the dark bar and the panel below it. Fixed: red,
   as competition change plates are.
2. **MEDIUM, four of Maintenance 25's revert entries no longer applied.** Fixed: 8c and 8d, the rules
   the reference replaced (each heavier plate taller, a colour of its own), retired, naming this
   table's D1 to D9; 8g and 8v re-anchored, and 8p with them.
3. **MEDIUM, half of the look was unguarded.** Fixed: every plate's colour pinned in pounds and
   kilograms, and the browser suite reads the drawing's computed look at 80 lb. Reverting each of
   four parts of the stylesheet (the weight in a pill, the bar ending at its weight, the thin
   sleeve, a flat plate) fails it.
4. **LOW, at 360 px five plates were drawn grouped though they fit.** The room counted a hairline
   after the last plate and kept 16 px of bare sleeve. Fixed: the hairlines between, and 12 px.
5. **LOW, a grouped side's width is never checked.** At 360 px in a wide font, 167.5 kg puts the
   1.25 a pixel past the drawing's left edge (6 at 130 % text), still inside the panel; the sleeve's
   rounded end is hidden. Left as a known limit.
6. **LOW, the bar ended just after "45 lb"**, so it could read as a box around the weight, the thing
   the owner asked to be rid of. Fixed: the bar runs on past it.
7. **LOW, the small drawing under the logger grew 5 px.** Fixed: its 45 is back at 40 px.

Checked and sound: every number inside its plate at 360 and 412 px, in the default font and a wide
one, in pounds and kilograms, at 130 % text; the collar clear; the bar inside the drawing; no
sideways scroll; long sides; weights the plates cannot make; the empty bar. The app has no light
theme.

## Reverts

`tools/reverts/mutate-plate-drawing.py`: 22 entries, each the revert of one part alone, all caught;
the stylesheet's four, above, caught by the browser suite. Of Maintenance 25's plate entries, 8c
and 8d retired, 8g, 8v and 8p re-anchored, and the rest run again: all caught but 8w, the small
drawing's 17 px floor for a plate's height. Its shortest plate is now the reference's 77 px change
plate at 40/150, 21 px, so the floor never acts: with it reverted the whole unit suite passed
(4021). Retired in Maintenance 26's runner, D17 guarding the small drawing's heights. Every runner
finds every anchor (Maintenance 26's: 1187 entries).

## Verification

- `npm run verify` on the final code: lint, type check, unit tests (4021 passed + 5 skipped
  by design, 668 files, and the day rules in two more zones), the build, the privacy
  scan, verify-build, and the browser suite (446 passed + 14 skipped by design).
  In the first run one storage test, outside this change, found the page still on Plan after its
  navigation under load; alone it passed 9 of 9, and the whole browser suite then passed. After the
  290 lb check was fixed (`f87cc7b`, the test alone), its spec passed in Verdana and in Arial at
  360 and 412 px, with lint and the type check.
- The drawing captured from a local build at 412 and 360 px at 80, 185, 495 and 625 lb, and compared
  with the reference.
- CI on the branch: run 45106263155 on `dc2334f` failed the 290 lb check at 360 px (above); run
  45108736972 on `f87cc7b`: green.
- Deploy Pages run 45111300899: the live marker reads `f87cc7b`. The live suite from the
  owner's machine: 431 passed + 14 skipped by design; 5 failed and the PWA projects (10) were held back by them. Two failures timed out loading the live page. The third, a coach test on all three widths, ran in the last hour of a Sunday: it seeds its sessions 7 to 28 days back in 24-hour days, and across the 1 November clock change the oldest fell on a Monday, in the same week as the next, leaving three weeks of training where the card needs four (the app read the dates rightly; a test-clock fault, outside this change). After midnight both specs passed, 27 of 27, and the PWA projects 5 passed + 5 skipped by design. The drawing on the live build: captured at 80 and 185 lb.

## Review on the phone

In a Chrome Incognito tab at the live URL, tap **Use defaults and skip setup**: the tab has its own
empty storage and no cloud token, so nothing here reaches your own plan or history.

1. **Today**, **Start workout**. On the first barbell lift, open **Plates**, tap the weight and set
   80 lb. The drawing: a long dark bar; a green 2.5, a blue 5 and a taller white 10; a dark collar;
   "45 lb" in plain white on the bar, with nothing around it, the bar running on past it.
2. Set 185 lb: a green 25 and a taller blue 45 against the collar.
3. Under the set logger, the same plates small, then "each side".

Close the Incognito tab: everything in it goes.
