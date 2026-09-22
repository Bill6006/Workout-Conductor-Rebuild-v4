# Maintenance 18: the gym barcode

Shipped on 2026-09-22 on the owner's go ("let's do the gym barcode part now"), from his
earlier ask: when he starts a workout at his gym, his membership barcode pops up so it can be
scanned, with an X in case it was already scanned, and a setting to stop it popping up.

## Delivered

- **Added once, on a sheet of its own.** Plan, Where you train, Barcode on the Gym row opens a
  sheet with the barcode and nothing else: no equipment. Add a barcode takes a screenshot from
  the gym's app or a photo of the card or key tag (the phone offers the camera or the gallery).
  It saves the moment it is picked, and says so. Every place but Home can have one. (A first
  version put it at the bottom of Edit Gym, under the equipment; the owner saw the evidence
  screenshot mid-build and it moved to its own sheet.)
- **Redrawn sharp where the phone can read it.** Chrome on Android can read a barcode from a
  picture. When it does, the app keeps the code and draws it itself: black bars on white,
  full width, with the number under it, which a scanner reads more easily than a photo with glare
  or at an angle. It draws Code 128, Code 39, Code 93, Codabar, ITF, EAN-13, EAN-8, UPC-A, UPC-E
  and QR codes. A code it cannot draw (a PDF417 or an Aztec, say), or a picture with nothing
  readable, shows as the picture itself. The sheet says which it will be.
- **Pops up as the workout starts.** Tap Start Workout at a place with a barcode and it comes up
  full screen on white, the place's name at the top and a large X to close it. It keeps the
  screen from dimming while it is up. The phone's Back closes it too and stays on the workout.
  "Show the picture" at the bottom switches between the drawn code and the picture.
- **The switch.** "Show when I start a workout here", on the same sheet, on by default. Off,
  Start does not bring it up.
- **Always one tap away.** At a place with a barcode, Today's card has a small Show barcode button
  under the length and the place, before the workout and during it. On the barcode sheet the
  picture itself opens it full screen (no separate Show button, at the owner's word), beside
  Replace and Remove (with a confirm).
- **It stays on the phone.** The barcode is kept in its own store on the device. It never goes
  to the cloud copy, never into a backup, an automatic snapshot, or an export, and a restore
  leaves it as it is. Deleting the place removes it.

## What it cannot do

- **Pop up on arrival.** A web app gets no location in the background, so the pop-up is tied to
  Start Workout at that place, not to walking in.
- **Raise the brightness.** Browsers do not let a page set screen brightness. The plain white
  page and full contrast do that job, and the screen stays awake while it is up.
- **Read the barcode on this build machine.** Desktop Chromium has no barcode reader, so the
  camera-to-drawn-code path was tested with a stand-in reader and the drawing itself against the
  published symbol tables. It needs one try on the phone.

## Robustness

- Reading a picture gives up after six seconds and keeps the picture, so adding one can never
  hang on "Reading the picture…"; a read that fails does the same.
- If the drawing code is slow to load or fails, the overlay shows the picture after a second and
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
- Store: saves on the device, pops up at Start only at that place and only while switched on,
  opens when asked, comes back after the app is reopened, goes with its place, is refused for a
  place that is gone; never in a backup, a snapshot, the outbox or the cloud copy, and a restore
  leaves it alone.
- Screens: Start pops it up drawn with the number; the switch shows the picture; the X and Back
  close it and spend the history entry it added; Escape closes only the barcode, not the sheet
  under it; Today's button opens it mid-workout; the barcode sheet holds no equipment and the
  place editor no barcode; nothing is offered for Home or at a place without one; the picture
  shows when the drawing is slow or fails.
- Browser (`e2e/barcode.spec.ts`, all three device projects): a picture added on the Gym's
  barcode sheet opens full screen from its preview, comes up full screen on white at Start, the
  X closes it, and a reload mid-workout does not bring it back; at Home, the Gym row's Use,
  Barcode and Edit fit on one line at 360 px; with the stand-in reader the code is redrawn at
  full width, switched off it stays closed at Start, Today opens it, and Back closes it.

## Review

Live app: https://bill6006.github.io/Workout-Conductor-Rebuild-v4/

1. Plan, Where you train, tap Barcode on the Gym row, then Add a barcode. Pick a screenshot of
   the barcode from your gym's app (or take a photo of your card).
2. The line under the picture says whether it was read: "Code read" means it will show redrawn.
   Tap the picture to see it the way the desk will.
3. Tap Done, go to Today at the Gym, tap Start Workout: the barcode comes up. Try the X.
4. Today now has Show barcode under the length and the place.
5. If the desk cannot scan the drawn code, tap Show the picture, and tell me.
