# Install the app, and the launcher icon (2026-10-24)

Built on 2026-10-24 on the owner's word. YELLOW: waiting for the owner's phone review, like every
round since 2026-10-11. Named by its topic, not a maintenance number: Maintenance 31 to 33 (rounds
M, N and O) are under way in the cloud session.

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

**Delivered:**

- Only `public/icons/icon-maskable-512.png` changed: the same artwork at 58% of the icon, its own
  dark edge carried out to the border, so the background is still full bleed with no seam.
  - Where a launcher shows the centre two thirds (measured): the dumbbell is 71% of the tile's
    width, about 14% clear on each side; its farthest point sits at 0.73 of the circle's radius.
  - Where the icon is padded as the standard intends: 55% of the tile.
  - On the emulator's launcher it measured 71% of the circle, 14% and 15% clear at the sides.
- The header logo, the notifications' icon, the tab's icons, the iOS icon and the 512 icon are
  byte for byte as before.
- `scripts/generate-icons.mjs` checks every icon it writes: dark and opaque to every edge, and the
  dumbbell's farthest point within its band, as a share of the narrowest launcher circle seen (a
  third of the width): 0.65 to 0.8 for the launcher icon (it is 0.729), the artwork's own 1.25 for
  the others. CI renders the icons before every build, so a run that drifts stops there.

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
  icon. The one measured did not, which is why the icon is at 58%, not the first pick of 72%.

## Reverts

`tools/reverts/mutate-install-icon.py`: 42 entries, 42 caught, each on its own assertion. Every
command entry names the text its failure must print, and a Vitest entry that only times out is no
catch (one did, I7, until its test asserted the missing guard directly). Run in a copy of the
repository (`--repo=`) from a green baseline.

- **I1 to I23**, the offer and the card: Vitest, and the start-up watch in `main.tsx` by the browser
  suite.
- **G1 to G3**, the icons: each by the generator's own check, and again by the browser suite on the
  served file. G1 reverts to the first pick, 72%, which the band refuses.
- **P1 to P9**, a changed icon reaching the installed app: each by `verify-build`; the hashed
  addresses, the precache and the network-first route again by the two-release test, and the deny
  list by the worker test.

## Verification

- `npm run verify` on the final code, run alone: lint, types, unit 2539 passed + 5 skipped by
  design (278 files), the day rules in two more zones, build, privacy scan (819 files, no
  findings), verify-build, browser 431 passed + 14 skipped by design.
- Commit `719af67`, deployed by Deploy Pages run 40135961082 (success). CI rendered the same icon
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
  placement. The installed app's own icon, built by Google's server, is the owner's to see.
- **The emulator's Chrome is 133**, older than the Chrome 144 behaviour in section 3; its update
  check was not run end to end there.
- **This machine's antivirus re-signs every HTTPS connection** for scanning, which the emulator
  does not trust, so the emulator reached the live site only while the owner paused that scanning;
  the new build was checked on the emulator over a plain localhost tunnel instead.

## Review on the phone

YELLOW until the owner's review. The steps:

1. In Chrome itself (not from the home-screen icon), open
   https://bill6006.github.io/Workout-Conductor-Rebuild-v4/. If "New version available" shows, tap
   Reload. Settings, About this app shows the build under Verification.
2. Settings: **Install the app** is at the top. (If it is not there yet, use the app for half a
   minute and open Settings again.) Tap it, then Install in Chrome's dialog. Workout Conductor
   appears on the home screen with no Chrome badge, and in Android's Settings, Apps.
3. If the old home-screen icon has a small Chrome badge, it is a shortcut: long-press it, Remove.
   That removes only the icon, none of the app's data. Never clear Chrome's site data or storage:
   one clear wipes every app at bill6006.github.io.
4. The launcher icon: the whole dumbbell with clear space on every side, the dark background to the
   edge. The logo in the app's header is as before.
5. If **Install the app** never shows and Workout Conductor is already in Settings, Apps, it is
   installed, and its icon changes in place: open it from the home screen, take the new release if
   offered, close it and open it again. When Chrome asks about the new icon (a dialog, or "Review
   app update" in Chrome's menu), accept it; it changes on the home screen once the app is closed,
   on Wi-Fi. To hurry it: in Chrome open `about://webapks`, tap Update under Workout Conductor, then
   open and close the app.
