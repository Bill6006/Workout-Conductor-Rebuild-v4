# Install the app, and the launcher icon (2026-10-24)

Built on 2026-10-24 on the owner's word. YELLOW: waiting for the owner's phone review, like every
round since 2026-10-11. Named by its topic, not a maintenance number: Maintenance 31 to 33 (rounds
M, N and O) are under way in the cloud session.

**Phone review 1, the same day:** the install works on the owner's phone; the launcher
icon was too small at 58%. Every icon now comes from the owner's new artwork, the launcher's
dumbbell sized on the owner's phone (section 4). YELLOW until the owner confirms it.

**Phone review 2, 2026-10-25:** the angled dumbbell of section 4 reached the owner's installed
app as an update, in place, with no reinstall: the first run of section 3's path on the phone,
seen in the owner's screenshot. The owner then sent a fourth artwork and asked for the dumbbell to
reach closer toward the tile's edges, like the widest icon beside it (section 5). YELLOW until the
owner confirms it.

## 1. Install the app, from Settings

**As asked:** "Add Life Mirror's proven PWA install fix from commit "99bae2e" to Workout Conductor.
Capture "beforeinstallprompt" at startup and retain it. Show "Install the app" in Settings only
while that offer exists. On tap, call "prompt()", read "userChoice", then clear the offer. Clear it
on "appinstalled". Do NOT change the manifest "id", "start_url", or "scope"."

**The cause, as in Life Mirror on 2026-10-03.** Every app here shares one site,
bill6006.github.io. Once any of them is installed on an Android phone, Chrome's menu asks whether
any installed app exists for the site, not for this one. So it says "This app is already
installed" on every page of the site, and its "open the app" fails ("Could not open app"), because
no installed app covers Workout Conductor's pages. The browser's own install dialog, asked for by
the page itself, checks only this app's start page, so it installs.

**Delivered:**

- `src/app/pwa/installOffer.ts` holds the browser's offer (`beforeinstallprompt`) from start-up:
  `src/main.tsx` starts watching before the app renders, so an offer made on Today is there when
  Settings opens. The browser's own prompt is held back for the app's button.
- While the offer stands, Settings shows one card at the top: "Workout Conductor can sit on your
  home screen as an app of its own, without Chrome's address bar." and **Install the app**. With no
  offer, no card.
- A tap calls `prompt()`, reads the answer from `userChoice`, then clears the offer: an offer is
  good for one prompt, and the browser makes a new one if it can still install. While the dialog is
  open the button is off, and a second tap asks nothing. A prompt the browser refuses clears the
  offer too, silently; an offer the browser makes while the dialog is open is kept for the next tap.
- `appinstalled` clears the offer, however the app was installed.
- The manifest's `id`, `start_url` and `scope` are unchanged (`/Workout-Conductor-Rebuild-v4/`);
  `verify-build` and the browser suite now check all three.
- Ported, not copied: Life Mirror clears the offer before calling `prompt()`; this follows the
  owner's order (prompt, answer, then clear), with the button off while the dialog is open.

**On a real Android Chrome** (the emulator, Chrome 133, this build served on its localhost): Chrome
made its offer, the card showed at the top of Settings, the button opened Chrome's own "Install
app" dialog, and the card was gone behind it once the offer was used.

## 2. The launcher icon, inward

**As asked:** "Scale only the launcher/maskable presentation farther inward so the full dumbbell
has comfortable space on all sides. Keep the dark background full-bleed. Do not redesign the icon.
Do not change the working in-app icon."

**Measured on a real launcher, not assumed.** Chromium's code pads a maskable icon so its safe
circle (80% of its width) fills Android's 66 dp safe zone; a launcher would then show the centre
87% of it. The Pixel launcher on the emulator (Android 16, Chrome 133) showed something else: from
the plates' positions against the artwork, its circle shows the centre 66.8% of the icon, Android's
72 of 108 dp with no padding at all. There the live icon (the artwork at 90%) lost both ends of the
dumbbell, as the owner saw: "cut off". A first pick of 72%, chosen for the padded case, still
filled 89% of the tile there.

**Delivered first** (phone review 1 then replaced it; section 4):

- Only `public/icons/icon-maskable-512.png` changed: the same artwork at 58% of the icon, its own
  dark edge carried out to the border, so the background is still full bleed with no seam.
  - Where a launcher shows the centre two thirds (measured): the dumbbell is 71% of the tile's
    width, about 14% clear on each side; its farthest point sits at 0.73 of the circle's radius.
  - Where the icon is padded as the standard intends: 55% of the tile.
  - On the emulator's launcher it measured 71% of the circle, 14% and 15% clear at the sides.
- The header logo, the notifications' icon, the tab's icons, the iOS icon and the 512 icon are
  byte for byte as before.
- `scripts/generate-icons.mjs` checks every icon it writes: dark and opaque to every edge, and the
  dumbbell's farthest point within its band, then as a share of the narrowest launcher circle seen
  (a third of the width): 0.65 to 0.8 for the launcher icon, the artwork's own 1.25 for the others.
  Section 4 measures against the maskable standard's circle instead. CI renders the icons before
  every build, so a run that drifts stops there.

## 3. Why the icon did not change on the phone, and the fix

**As asked:** "Check manifest references, generated 192, 512, and maskable assets,
service-worker/cache behavior, and WebAPK update behavior so future icon changes can propagate
correctly without requiring uninstall/reinstall."

**Three causes:**

1. **Chrome looks at the icon's address, not its picture.** Since Chrome 144 (January 2026), an
   installed app's icon counts as unchanged while the manifest's `icons` entries are unchanged
   ("Icons are now considered unchanged if the icons field in the manifest remains the same as the
   last applied version": developer.chrome.com/blog/improvements-to-web-app-updates). The new
   dumbbell kept the old address, `icons/icon-maskable-512.png`, so Chrome saw no change.
2. **The service worker answered with its own copies.** The manifest and the icons were precached.
   A new release waits for Reload, so until then any update check read the release the phone ran.
3. **A home-screen shortcut never updates.** Chrome makes a shortcut, not an installed app, when it
   cannot install one: when its menu thinks the app is already installed (section 1), or, as on
   the emulator, when Google Play will not build the app ("WebAPK service unknown_account" on a
   device with no Google account). A shortcut carries a small Chrome badge and is not in Android's
   Settings, Apps, as Workout Conductor was not. Only a reinstall changes its icon.

**Delivered:**

- Each manifest icon's address carries its content's hash (the launcher icon is
  `icons/icon-maskable-512.png?v=70f224d6`), computed at build time from the file the build ships,
  so a new picture is a new address and Chrome sees it. `verify-build` checks each hash against its
  file; the browser suite checks the served files against the served manifest.
- The manifest is no longer precached. It is read from the server whenever there is a network, past
  the browser's ten-minute copy, its last copy kept for offline. An installed app's update check
  then reads the deployed manifest even while an older release still runs, and the new icon's
  address is in no older precache, so it comes from the server too. The icons stay precached under
  their plain addresses for the app's own use. Opened in a tab, the manifest and an icon show the
  file, not the app.
- After that, Chrome does the rest: when the installed app opens it compares the manifest; a new
  icon is a change it asks the owner to accept (a dialog, or "Review app update" in Chrome's menu);
  the new app is built and installed in the background, typically once the app is closed and the
  phone is on Wi-Fi.
- **Once, for this release:** the phone's current release still holds the old manifest. Taking this
  release (Reload on "New version available") moves it; from then on, icon and name changes reach
  the installed app without a reinstall.

## 4. Phone review 1: the icon sized on the owner's phone, then the owner's new artwork

**As found on the owner's phone:** "The new Workout Conductor icon is working correctly on my
actual [...] phone, but the dumbbell is visibly too small inside the launcher tile." The owner
asked for "the largest balanced size that: looks appropriately sized next to the other installed
app icons on my [...] launcher; keeps the entire dumbbell visible; leaves reasonable breathing
room; does not return to the earlier cropped/cramped appearance", and to "Use my actual phone
result as the primary visual validation rather than optimizing solely for the emulator's more
aggressive crop."

**Measured on the owner's screenshot** (a folder on the home screen):

- Every tile is 147 to 151 px. The glyphs of the six apps beside Conductor span 54% to 82% of the
  tile's width (50% to 78% of its height); one of them is an angled dumbbell, 81% by 60%.
  Conductor's, with the artwork at 58% of the icon: its dumbbell 56% of the tile (28%).
- From the dumbbell's known size in the icon, the phone's tile shows the centre 85.3% of the icon:
  the installed app there is placed as the maskable standard intends, padded, not as the emulator's
  shortcut was. The owner's first picture of the cramped icon (90%, about 87% of the tile) fits the
  same placement.
- A preview painted each candidate into the owner's own screenshot through that placement and the
  tile's shape. It reproduces the 58% tile to the pixel: 82 px of 147, painted and real.
- The size chosen: the dumbbell at about 75% of the tile's width, an eighth of it clear on each
  side, between the 56% found too small and the 86% that was cramped. A first version gave the old
  dumbbell that size (78% of the icon); it was not shipped, because the owner then sent new art.

**The owner's new artwork, "use this one instead everywhere":** first a neon-green dumbbell on a
dark textured surface, in four versions (a rounded tile, then full-bleed framings). Then a new
render, "these are the ones that I want I'm sure now": an angled dumbbell in three framings, to
"Pick whichever fits the best" and "makes the most sense".

**Delivered:** every icon is cut from the angled dumbbell framed at 73% of the width, its pixels
exactly as provided, in `assets/app-icon.png`. The file leaves out the provenance record the image
tool embedded in it, which carried a certificate authority's email address; the earlier artwork
carried none.

- Of the three framings it is the best centred (18 px right of its frame's centre and 9 px up,
  against 43 and 45 px high in the other two), and it leaves the most of its own surface around
  the dumbbell. The largest (83%) could not come down past about 73% of the icon without mirroring
  its plates into the margin.
- The launcher icon, `icon-maskable-512.png`: the dumbbell's width at 61.4% of the icon, 72% of the
  owner's tile, and 57% of its height, beside the angled dumbbell's 81% (60%). Angled, its ends
  point toward the corners, where a round launcher cuts first: they reach 0.868 of the maskable
  standard's safe circle (40% of the width from the centre), which every launcher that follows the
  standard leaves whole. The band is 0.84 to 0.92.
- Its margin is its own surface mirrored 115 px past each side, 39 px clear of the plates, at the
  very edge of what the owner's launcher shows (about 2 px of it inside the tile). Cut much
  closer, the plates' glow reaches the mirrored margin: at 58.5% its edge reaches a luminance of
  114, against 59 for the icon shipped, and the edge check (100 at most) refuses it.
- `icon-192.png` (the header's logo and the notifications' icon), `icon-512.png`,
  `apple-touch-icon-180.png` and `favicon-32.png`: cut closer, the dumbbell's width at 82%, its ends
  at 1.16 of that circle, inside the icon.
- One picture everywhere: the launcher icon and the app's logo are the same render.
- `scripts/generate-icons.mjs` measures the dumbbell on the artwork (its bright metal and strong
  green in dense clusters, which the textured surface's lone specks never form), cuts each icon
  around the artwork's centre, and checks each written file: decoded at its size; showing the
  artwork, compared with the artwork itself drawn straight from the source; opaque and dark to
  every edge (luminance 100 at most; the icons reach 72); the dumbbell's reach in its band. Every
  run writes the same bytes.
- The earlier versions were handled on the way (the rounded tile's surface rebuilt past its rim,
  then a full-bleed framing cut at 64%); none of them ships.
- The new icons' addresses, `icons/icon-maskable-512.png?v=d9b649cb` and the two others, are how
  the installed app learns of them (section 3): no reinstall. The five icons weigh 1.3 MB, up from
  0.5 MB, because the textured surface does not compress; each phone downloads them once.

## 5. Phone review 2: the owner's fourth artwork, reaching toward the tile's edges

**As asked:** "I have a different icon I want you to switch with the current for the workout
app", then: "that's kind of how I hoped mine to be where the dumbbell reaches closer towards the
edges like the [...] icon, which is closer than the previous icon that you swapped for me".

**Measured on the owner's second screenshot** (the same folder, 1080 x 2340):

- The widest glyph beside Conductor, an angled dumbbell, spans 81.4% of its tile's width (61.4% of
  its height).
- Conductor's dumbbell, as section 4 shipped it, spans 71.9% (57.5%): the placement measured in
  section 4 (the tile shows the centre 85.3% of the icon) predicted 72% (57%), so it holds.

**The artwork:** an angled dumbbell, brushed metal with neon-green rings, on a smooth dark studio
backdrop, lighter toward the top right. Its pixels are kept as provided in `assets/app-icon.png`,
without the image tool's provenance record, as in section 4. Unlike the earlier artwork, the
dumbbell spans 90% of the frame and sits 107 px above its centre, its shadow beneath it.

**Delivered:**

- The launcher icon, `icon-maskable-512.png`: the dumbbell's width at 69% of the icon, 81% of the
  owner's tile, as far toward its edges as the widest glyph beside it. Its ends reach 0.90 of the
  maskable standard's safe circle, so every launcher that follows the standard shows it whole. The
  band is 0.86 to 0.94.
- `icon-192.png` (the header's logo and the notifications' icon), `icon-512.png`,
  `apple-touch-icon-180.png` and `favicon-32.png`: cut closer, the dumbbell's width at 82%, its
  ends at 1.06 of that circle. The band is 1.02 to 1.11.
- Every cut is centred on the dumbbell, not on the frame.
- The five icons weigh 0.8 MB, against the textured artwork's 1.3 MB.

**How the margin is made.** Mirroring the artwork's edge, as before, would mirror the plates into
the margin: they come within 50 px of the frame. The backdrop is a smooth gradient instead, so it
goes on past the frame:

- Inside its frame, the artwork exactly as provided.
- A cubic in x and y for each channel, fitted to the backdrop's 32-px blocks: those even in
  shade, refitted without the ones it misses (the dumbbell's shadow). It holds 740 of the 868 even
  blocks and misses them by 1.22 levels on average.
- Past the frame: the fit's value at the nearest point of the frame, plus the artwork's own
  departure from the fit there (over its outer 8 px, averaged over 33 px along the side), fading
  over 60 px, and bent over about 50 px so it leaves the frame on the artwork's own trend there
  (how its shade changes over the last 32 px). At the frame it is the artwork's own shade and
  slope, so the frame leaves neither a step nor a crease; the dark beside the right end cap goes on
  and fades instead of stopping; farther out it is the fit. A shorter bend creased the frame (a
  groove of 1.6 at 20 px); a longer one lingered (2.9 off the fit far out at 60 px). Past a corner
  the two sides' shades and trends are weighted by how far the point lies past each, so the corner
  meets both sides without a seam.

**Tried and set aside, each seen in a render first:**

- Fading the artwork into the fit over its outer 24 px left a faint outline of the frame.
- Keeping the artwork whole and carrying a corrected backdrop past it drew the right end cap's
  glow out as a streak.
- A fit extrapolated as it is (a quadratic, in the first trials) made the top-right corner lighter
  than any shade in the artwork, 104 against 85.
- Redrawing the backdrop inside the frame as well, the artwork kept only where it departed from
  the fit and handed over to it across its outer 56 px (over 8 px, a step of 5.9 levels). The
  review found the cost: beside the right end cap the artwork's backdrop is 9 to 13 levels darker
  than the fit right up to the frame, and the hand-over lifted it, a soft wall 15 px wide inside
  the owner's tile, in the very band the step check then compared fit with fit.
- Carrying the artwork's shade past the frame without its trend. The artwork darkens a little over
  its last 64 px; the carried shade climbed straight back, a groove along the frame of about 2
  levels, faint at twice the size, unseen at the tile's (the re-check found it).

**New checks in `scripts/generate-icons.mjs`**, each on the written file, besides the earlier ones:

- the fit holds at least three quarters of the even blocks and misses them by 2.5 levels at most,
  or the backdrop is not a smooth gradient and the run stops;
- every edge pixel within the artwork's own shades along its frame, give or take 3 (28.7 to 85.0
  now; the icons' edges run 27.9 to 81.9);
- at 512 px, along the frame's line in 16-px stretches: the 3 px just inside, the artwork, against
  the 3 px just outside, never more than 3 levels apart (a step; 0.8 at most now); and the 3 px on
  the line against the mean of the 3 px 8 px either side, never more than 1.5 apart (a groove or a
  ridge; 0.9 now, 2.2 without the bend);
- where a frame line runs on past the artwork, into the margin round a corner, the 3 px either
  side of it never more than 1.6 apart (a seam where two sides' backdrops meet; 1.1 now, the
  backdrop's own slope, and 2.2 to 2.5 with the two sides simply averaged);
- three fades and more past the frame (180 px of the artwork), every edge pixel within 3 levels
  of the fit (all 1,559 of the launcher icon's, within 1.8).

The new icons' addresses, `icons/icon-maskable-512.png?v=055e3700`, `icon-192.png?v=257f1527`
and `icon-512.png?v=23ffa36e`, reach the installed app as section 4's did.

## Tests

- Unit: `src/app/pwa/installOffer.test.ts` (10) and `src/features/settings/installCard.test.tsx` (5).
- Browser, `e2e/smoke.spec.ts`: Install the app (3 tests: no card without an offer; an offer made
  on Today is held, shown at the top of Settings, and a tap asks once; a dismissal clears it, a new
  offer brings it back, installing clears it); the launcher icon's geometry and the header logo's;
  each manifest icon named by its content; the manifest's id, start_url and scope.
- Browser, `e2e/pwaUpdate.spec.ts`: two real builds; under the old release's worker, with the new
  release waiting, the manifest and the launcher icon an update check reads come from the new
  release (`scripts/pwa-update-server.mjs` marks each file with the build it came from).
- Browser, `e2e/pwa.spec.ts`: under the worker, the manifest and a launcher icon open as themselves.
- `verify-build`: id, start_url and scope; each icon's hash; the manifest not precached; its
  network-first route.

## Review

An adversarial reviewer read the change against the code and the libraries, then a second pass
re-checked the fixes. Fixed:

- **LOW:** with neither file precached, the worker's page fallback answered a tab opened on the
  manifest or an icon with the app. Both are on its deny list now, with a test.
- **LOW:** a prompt the browser refuses left an error unhandled. Caught, with a test.
- **Coverage:** an offer made while the dialog is open is kept (a test); entries for every rule
  without one.
- **The revert runner:** a command entry could count a build error or a busy port as a catch, and a
  Vitest entry a time-out. Each command entry now names its assertion's text, and a time-out is no
  catch. On Windows, `cmd.exe` read `;` as part of an argument: three entries "failed" on that, not
  on their assertions, until the runner ran the generator step itself.
- **Kept, with the reason:** the icon addresses with `?v=` are not precached, and the manifest route
  has no time-out. Installing needs a network anyway, and the manifest never holds up a screen.
- **The reviewer's open question, settled on the emulator:** whether a launcher pads the maskable
  icon. The one measured did not, which is why the icon was at 58%, not the first pick of 72%; the
  owner's phone does (section 4).

**After phone review 1,** a third reviewer read the new artwork's code, its checks and this
report, then re-checked the fixes until a pass found nothing new. Fixed:

- **MEDIUM:** this report named the apps in the owner's screenshot and the phone's make, which say
  something of the owner's life. Neither was ever pushed; the measurements stay, the names do not.
- **LOW:** the icon generator's picture check compared each file with its own cut, so a wrong
  transform before the cut passed by construction. It compares with the artwork itself again, as
  before this round. An artwork drawn mirrored before the cut, which every other check and the
  comparison with the cut pass, now stops the run (G4).
- **LOW:** "dark to its edge" allowed a luminance of 140, a mid grey. It is 100 now, in the
  generator and the browser test alike; the icons reach 72 at most, and a margin the plates' glow
  reaches is refused (G2c, G2d).
- **LOW:** an artwork in which nothing is found passed the generator's first guard and failed
  later with a misleading error. The guard now requires a dumbbell. It has no revert entry:
  without it the run still stops, later and less clearly.
- **Wording:** the generator's log named the configured span as if measured; the 58.5% revert
  was called "about the 58% found too small", when that 58% was the old artwork's scale (its
  dumbbell 48% of the icon); the clipped tips are 1.4% of the width, not 1%; the margin is at the
  very edge of what the owner's launcher shows, not wholly outside it.
- **Also found:** the new artwork file carried the image tool's provenance record, with a
  certificate authority's email address. The repository's copy leaves it out; the pixels and
  every icon are byte for byte the same.
- **From the re-check:** G4 first mirrored the icon after the cut, which the comparison with the
  cut saw as well. It mirrors the artwork before the cut now: the comparison with the cut passes
  that (2 to 4 on average), the comparison with the artwork stops it (29.9).

**After phone review 2,** a fourth reviewer read the fourth artwork's code and rebuilt its
arithmetic in Node, which reproduced the fit and every figure. Fixed:

- **MEDIUM:** a soft wall beside the right end cap. The artwork's backdrop there is 9 to 13 levels
  darker than the fit, up to the frame, and the 56-px hand-over lifted it to the fit: a straight
  rise of about 10 levels over 15 px, inside the owner's tile. The frame check could not see it,
  since both its bands then held the fit. The artwork is now left as provided inside its frame,
  and its own shade there is carried past it, fading; the frame check compares the artwork with
  what goes on past it (G2d), and a new check holds the far edge to the fit (G2e).
- **LOW to MEDIUM:** the shades floor had 0.3 levels of headroom on the launcher icon's bottom
  edge, where a one-level drift in a newer Chromium would stop CI. The edges now run 27.9 to 81.9
  against 25.7 to 88.0.
- **Wording:** "82% of the tile" was 81%; the logo's ends reach 1.06, not 1.07; the step of the
  8-px hand-over was given as both 5.9 and 4.9 (the launcher icon's and the 512's); and the
  revert results were written before the run had ended.
- **From the re-check (LOW):** the frame still read as a faint groove, about 2 levels, where the
  artwork darkens toward it and the carried shade climbed straight back; the step check, comparing
  the two sides' means, read a symmetric groove as nothing. The carried shade now bends onto the
  artwork's own trend, a groove-or-ridge check holds the line (G2h), and the step check compares
  the 3 px either side of the line, so the backdrop's own slope is no step.
- **From the re-check (LOW):** the extrapolation entry named the file it failed on by 0.6 levels,
  so a small drift would have moved the failure to another file: the entries name no file now.
  Two comments described removed code.
- **From the last pass (LOW):** past a corner the two sides' shade and trend were simply averaged,
  while each side beside it used its own: a straight seam of up to 1.6 levels along the frame
  lines run on into the margin, two of them inside the owner's tile, and no check looked there.
  The corner now weights each side by how far the point lies past it, and a check holds those
  lines (G2i). A pass after that found nothing new.

## Reverts

`tools/reverts/mutate-install-icon.py`: 54 entries, 54 caught, each on its own assertion. Every
command entry names the text its failure must print, and a Vitest entry that only times out is no
catch (one did, I7, until its test asserted the missing guard directly). Run in a copy of the
repository (`--repo=`) from a green baseline. After each phone review the icon entries ran again
on the new code, 18 of them on the fourth artwork's; the other 36 test code those changes did not
touch.

- **I1 to I23**, the offer and the card: Vitest, and the start-up watch in `main.tsx` by the browser
  suite.
- **G1 to G5**, the icons: each by the generator's own check, and G1, G2, G3 and G5 again by the
  browser suite on the served file.
  - G1 reverts the launcher icon to the size before, 61.4% (its ends at 0.80 of the safe circle),
    and to 76% (0.99); the band refuses both.
  - G2 takes the backdrop away past the artwork's edge; extrapolates the fit instead of holding
    its value at the frame (lighter than the artwork's own shades); carries the fit alone, without
    the artwork's own shade at its frame (a step of 11.0 beside the right end cap); lets that shade
    run on without fading (off the fit at the icon's edge); drops the bend onto the artwork's trend
    (a groove of 2.2); averages the two sides past a corner instead of weighting them (a seam);
    fits the backdrop without leaving out the shadow (off by 4.64 on average); or fits a plane
    (which holds 377 of 868 blocks). Their failure texts name no file, since which
    cut meets a flaw first can change.
  - G3 cuts the logo as loosely as the launcher icon.
  - G4 draws the artwork mirrored before the cut, which only the comparison with the artwork
    itself sees.
  - G5 centres the cut on the frame instead of the dumbbell (its ends at 1.16 on the logo).
- **On the way:** with the angled artwork, two entries first failed on the edge check, not their
  own, until their revert stayed within the surface the artwork had. With the fourth, before the
  second review, a revert to 61.4% was refused by the shades check before the band; the backdrop
  past the frame no longer drifts, and the band refuses it now.
- **P1 to P9**, a changed icon reaching the installed app: each by `verify-build`; the hashed
  addresses, the precache and the network-first route again by the two-release test, and the deny
  list by the worker test.

## Verification

**After phone review 2: commit `f70a6c1`, the fourth artwork.**

- `npm run verify` on the final code, run alone: lint, types, unit 2539 passed + 5 skipped by
  design (278 files), the day rules in two more zones, build, privacy scan (819 files, no
  findings), verify-build, browser 431 passed + 14 skipped by design.
- Deployed by Deploy Pages run 40168951031 (success). CI rendered the same icons, every check's
  figure as here and the same bytes (the live hashes are the local ones); browser 431 passed + 14
  skipped, none flaky.
- Live: the bundle's marker `shortCommit` `f70a6c1`. The manifest's id, start_url and scope are
  unchanged, and its icons are `?v=257f1527`, `?v=23ffa36e` and `?v=055e3700`, each the hash of
  the file served. The worker precaches no manifest, reads it network first, and leaves the
  manifest and the icons out of its page fallback.
- Live suite: 426 passed + 19 skipped by design. In the full run one Plan test failed on loading
  the live page (`net::ERR_TIMED_OUT` before the app ran), and the 10 worker tests that wait on
  the rest did not start; run again, all 11 behaved as designed (6 passed, 5 skipped).

**After phone review 1: commit `e0883c0`, the angled artwork.**

- `npm run verify` on the final code, run alone: lint, types, unit 2539 passed + 5 skipped by
  design (278 files), the day rules in two more zones, build, privacy scan (819 files, no
  findings), verify-build, browser 431 passed + 14 skipped by design.
- Deployed by Deploy Pages run 40154530852 (success). CI rendered the same icons, each check's
  figures as here (the launcher icon: the artwork within 4.2, the dumbbell reaching 0.868); browser
  431 passed + 14 skipped, none flaky.
- Live: the bundle's marker `shortCommit` `e0883c0`. The manifest's id, start_url and scope are
  `/Workout-Conductor-Rebuild-v4/`, and its icons are `?v=c2861ebc`, `?v=19a9f646` and
  `?v=d9b649cb`, each the hash of the file served. The worker precaches no manifest, reads it
  network first, and leaves the manifest and the icons out of its page fallback.
- Live suite: 426 passed + 19 skipped by design (the update tests cannot switch a live site). In
  the full run two logger tests failed on loading the live page (`net::ERR_TIMED_OUT` before the
  app ran), and the 10 worker tests that wait on the rest did not start; run again, all 12 behaved
  as designed (7 passed, 5 skipped).

**The first release: commit `719af67`.**

- `npm run verify` on its code, run alone: lint, types, unit 2539 passed + 5 skipped by design
  (278 files), the day rules in two more zones, build, privacy scan (819 files, no findings),
  verify-build, browser 431 passed + 14 skipped by design.
- Deployed by Deploy Pages run 40135961082 (success). CI rendered the same icon
  bytes (the launcher icon reaches 0.729 there too); browser 430 passed + 1 flaky + 14 skipped. The
  flaky one, `e2e/storage.spec.ts` (the cloud copy's barcode line, a 5-second wait), passed on its
  retry; this change does not touch it.
- Live: the bundle's marker `shortCommit` `719af67`. The manifest's id, start_url and scope are
  `/Workout-Conductor-Rebuild-v4/`, and its icons are `?v=da2b1d5d`, `?v=537db2de` and
  `?v=70f224d6`, each the hash of the file served. The worker precaches no manifest, reads it
  network first, and leaves the manifest and the icons out of its page fallback.
- Live suite: 426 passed + 19 skipped by design (the update tests cannot switch a live site), none
  failed.
- On the emulator, as in sections 1 and 2.

## Known limits

- **The emulator could not install the app itself.** Google Play builds the installed app only for
  a device with a Google account, so the emulator made a shortcut, which uses Chrome's own
  placement. The installed app's own icon was measured on the owner's phone instead (section 4).
- **The emulator's Chrome is 133**, older than the Chrome 144 behaviour in section 3; its update
  check was not run end to end there.
- **Sized for the owner's phone, as asked, not for the narrowest launcher seen.** Where a launcher
  shows only the centre two thirds of the icon, as the emulator's shortcut did, the tips of the
  dumbbell's end caps would be clipped by about 2.5% of the icon's width (13 px of 512; 1.4% with
  section 4's icon). Chrome makes such a shortcut only when it cannot install the app.
- **The frame's lines run on into the margin are checked for a step, not a groove or a ridge,**
  and their limit, 1.6, sits about 0.5 above this backdrop's own slope there. A ridge along them
  would pass (it reads 0.76 now, unseen), and an artwork whose backdrop is steeper near a corner
  could trip the limit with no seam there. Both were the last pass's notes, not defects.
- **This machine's antivirus re-signs every HTTPS connection** for scanning, which the emulator
  does not trust, so the emulator reached the live site only while the owner paused that scanning;
  the new build was checked on the emulator over a plain localhost tunnel instead.

## Review on the phone

**Phone review 1 (2026-10-24):** the install works on the owner's phone (steps 1 to 3 of
the first list passed); the launcher icon was too small at 58% (section 4).

**Phone review 2 (2026-10-25):** section 4's icon arrived on the phone as an update, in place,
with no reinstall; the owner asked for the fourth artwork, reaching closer toward the tile's edges
(section 5).

YELLOW until the owner confirms the new icon. It reaches the installed app the same way. The
steps:

1. Open Workout Conductor from its home-screen icon. If "New version available" shows, tap Reload.
   Settings, About this app shows the build under Verification.
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

Never clear Chrome's site data or storage: one clear wipes every app at bill6006.github.io.
