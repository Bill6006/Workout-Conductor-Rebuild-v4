# Maintenance 18: the gym barcode

Shipped on 2026-09-22 on the owner's go ("let's do the gym barcode part now"), from the
owner's earlier ask: starting a workout at the gym brings up the membership barcode so it can be
scanned, with an X in case it was already scanned, and a setting to stop it popping up. A
second build the same day made the popup come first (see Changed after review).

## Delivered

- **One popup for the barcode.** Plan, Where you train, Barcode on the Gym row opens a popup with
  the barcode and nothing else: no equipment. Add a barcode takes a screenshot from the gym's
  app or a photo of the card or key tag (the phone offers the camera or the gallery). It saves
  the moment it is picked, and says so. Every place but Home can have one.
- **It comes up as the workout starts.** Tap Start Workout at a place with a barcode and the same
  popup comes up over the workout. Today's card has a small Show barcode button under the length
  and the place, before the workout and during it, that opens it too.
- **Full screen is a tap on the barcode.** "Tap it for full screen." sits under the picture. Full
  screen is white, the place's name at the top and a large X that goes back to the popup; the
  screen is kept from dimming while it is up. "Show the picture" at the bottom switches between
  the drawn code and the picture.
- **Redrawn sharp where the phone can read it.** Chrome on Android can read a barcode from a
  picture. When it does, the app keeps the code and draws it itself for full screen: black bars
  on white, full width, with the number under it, which a scanner reads more easily than a photo
  with glare or at an angle. It draws Code 128, Code 39, Code 93, Codabar, ITF, EAN-13, EAN-8,
  UPC-A, UPC-E and QR codes. A code it cannot draw (a PDF417 or an Aztec, say), or a picture with
  nothing readable, shows as the picture itself. "Code read." in the popup says it was read.
- **The switch.** "Show when I start a workout here", in the popup, on by default. Off, Start does
  not bring the popup up.
- **Back steps back.** The phone's Back closes full screen to the popup, then the popup, and stays
  on the screen underneath; the X, Done and Escape do the same one step at a time.
- **It stays on the phone.** The barcode is kept in its own store on the device. It never goes
  to the cloud copy, never into a backup, an automatic snapshot, or an export, and a restore
  leaves it as it is. Deleting the place removes it.

## Changed after review

The owner shaped it in three notes, two while it was being built and one on the first build:

- It first sat at the bottom of Edit Gym, under the place's equipment. It moved to a popup of its
  own.
- Its Show button went: the barcode on the popup is itself what opens full screen.
- Start and Show barcode first went straight to full screen. They now open the popup, as Plan
  does, and full screen is a tap on the barcode. "Stays on this phone" came off the popup.

## What it cannot do

- **Pop up on arrival.** A web app gets no location in the background, so the popup is tied to
  Start Workout at that place, not to walking in.
- **Raise the brightness.** Browsers do not let a page set screen brightness. The plain white
  page and full contrast do that job, and the screen stays awake while it is up.
- **Read the barcode on this build machine.** Desktop Chromium has no barcode reader, so the
  camera-to-drawn-code path was tested with a stand-in reader and the drawing itself against the
  published symbol tables. It needs one try on the phone.

## Robustness

- Reading a picture gives up after six seconds and keeps the picture, so adding one can never
  hang on "Reading the picture…"; a read that fails does the same.
- If the drawing code is slow to load or fails, full screen shows the picture after a second and
  a half instead of a blank screen, and never switches under the scanner by itself.
- The drawing libraries (JsBarcode 3.12.3, qrcode-generator 2.0.4, both MIT) load only when a
  code is drawn, in their own files, and the offline cache holds them.

## Verification

- Unit: Code 128 matches the symbol table module for module, check character included (worked
  by hand: 310 mod 103 = 1); EAN-13 at 95 modules with its guard bars; Code 39 between its star
  characters; Codabar, ITF, UPC-A, EAN-8; a QR code's size and finder pattern; values a format
  cannot carry are refused rather than drawn wrong. Reading: only drawable formats are asked
  for, the largest drawable code wins, a reader that throws or hangs leaves the picture alone,
  and HEIC, empty, oversized and non-picture files are refused with a message.
- Store: saves on the device; Start opens the popup only at that place and only while switched
  on, never full screen; Show barcode opens the popup; full screen needs a barcode; Home has no
  popup; it comes back after the app is reopened, goes with its place, is refused for a place
  that is gone; never in a backup, a snapshot, the outbox or the cloud copy, and a restore leaves
  it alone.
- Screens: Start brings up the popup, not full screen, with no "Stays on this phone"; a tap on
  the barcode goes full screen, drawn with the number; the X goes back to the popup and Done
  closes it, each spending the history entry it added; Back steps back one view at a time
  without leaving the workout; Escape closes only full screen, not the popup under it; Today's
  button opens the popup mid-workout; the popup holds no equipment and the place editor no
  barcode; nothing is offered for Home or at a place without one; the picture shows when the
  drawing is slow or fails.
- Browser (`e2e/barcode.spec.ts`, all three device projects): a picture added in the Gym's
  popup; Start brings up the popup over the workout, a tap on the barcode goes full screen on
  white, the X goes back to the popup and Done closes it on the workout; a reload mid-workout
  does not bring either back; at Home, the Gym row's Use, Barcode and Edit fit on one line at
  360 px; with the stand-in reader the code is redrawn at full width, switched off the popup
  stays closed at Start, Today's Show barcode opens it, and Back steps back twice to Today.

## Review

Live app: https://bill6006.github.io/Workout-Conductor-Rebuild-v4/

1. Plan, Where you train, tap Barcode on the Gym row, then Add a barcode. Pick a screenshot of
   the barcode from your gym's app (or take a photo of your card).
2. "Code read." under the picture means it will show redrawn full screen.
3. Tap Done, go to Today at the Gym, tap Start Workout: the popup comes up. Tap the barcode for
   full screen; the X goes back to the popup, Done closes it.
4. Today has Show barcode under the length and the place; it opens the same popup.
5. If the desk cannot scan the drawn code, tap Show the picture on full screen, and tell me.
