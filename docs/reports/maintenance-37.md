# Maintenance 37: custom equipment presets

Built on 2026-10-31 to the owner's definition of the same day: "Keep the built-in Home preset and
Full gym preset protected. They cannot be renamed or deleted. Let me create unlimited custom reusable
equipment presets. I can name a preset and choose any combination of supported equipment. ... A
preset is a TEMPLATE, not a live link to places. Applying a preset copies its equipment configuration
into that place. Editing or deleting the preset later must NOT change places that previously used
it. Custom presets must persist/sync through the same safe persistence/cloud path as the rest of
Workout Conductor. Preserve all existing per-place behavior, including: place-specific weights;
machine pin-stack vs plates; linked-machine behavior such as leg press/calf relationships." Approved
2026-10-17, defined 2026-10-31 (`docs/handoff/CLOUD_HANDOFF.md`). No training rule: product and
screen choices only. YELLOW: waiting for the owner's consolidated phone review.

## What it does

- **Home and Full gym, built in:** in the code, shown in Settings as built in, with nothing on them
  to rename or delete. A preset of the lifter's own never takes their names, in any case, with or
  without "preset".
- **The lifter's own, as many as they like:** each a name (up to 40 characters, as a place's) and any
  combination of the catalog's equipment, made, renamed, changed and deleted in Settings, Places,
  **Equipment presets**; Delete asks first. Two presets never share a name, "Hotel gym" and "Hotel gym
  preset" counting as one, and a name a preset already has is never refused (two devices can give two
  presets the same one offline).
- **Beside Full gym and Home wherever a place's equipment is set:** setup, Settings and Plan's place
  editor. A tap copies the preset's equipment in.
- **A template:** nothing keeps a link to a preset, so changing or deleting one leaves every place as
  it is.
- **Kept like the rest:** each preset is a meta record of its own, so one made on a phone and one made
  offline on a tablet both stay. Saved with the verified writes, which queue it for the cloud copy in
  the same step; a deletion is told to the cloud copy; in every backup and snapshot, and back with a
  restore. A preset kept that does not read is never written over, and equipment a newer copy's
  catalog added survives a save here.
- **Each place's own kept:** a preset is equipment only. A place's weights, its machines' pin stacks
  or plates, and a machine that serves two lifts, as the leg press does its calf raise, stay as they
  are when a preset fills it.

## Not taken

- **A place's equipment saved as a preset from the place editor:** not in the owner's definition; a
  preset is made in Settings.
- **Presets carrying weights or machine settings:** those stay each place's own, as the owner asked.

## Review

One bounded adversarial review, with probes of its own: no HIGH, one MEDIUM, six LOW. All fixed with
tests and revert entries, and each fix run again against the reviewer's own probe: every probe that
showed a fault now fails on the fixed code, and those that showed sound behaviour still pass.

1. **MEDIUM: a save here dropped equipment a newer copy's catalog added,** even on a rename alone,
   and the loss would have synced back to every device. Now it is kept. (S10)
2. **LOW: two presets of one name, made on two devices offline, blocked each other's edits,** and a
   reload during a save could hide a preset a sync had brought. Now a name a preset has is never
   refused, and the list is read again from the store after each change. (P6, S2)
3. **LOW: "Hotel gym" and "Hotel gym preset" could both be kept,** two buttons alike filling a place
   differently. Now they are one name. (P8)
4. **LOW: an edit to a preset deleted on another device said it "could not be read",** and the edit
   was lost. Now it is kept as a new preset. (S7)
5. **LOW: a save that finished after its sheet was closed closed the next preset's sheet.** Now the
   sheet never closes while it saves. (X8)
6. **LOW: Delete went at one tap, the save button said "Saving…" while it did, and the focus was
   lost after.** Now Delete asks first and says "Deleting…", and New preset takes the focus. (X5, X7)
7. **LOW: one meta record that could not be read kept the app from opening.** Now the presets stay
   as they were and the app opens. (S4)

Checked and found sound by the review: the built-ins' protection; unlimited presets of any equipment;
where presets show, setup's Home equipment included; the template (no place holds a link, and only a
place's equipment changes); the verified writes and the outbox; a deletion on another device reaching
this one; backups, snapshots and restores; an older copy of the app keeping, backing up and syncing
these records without reading them; one write at a time against a reload.

## Reverts

`tools/reverts/mutate-presets.py`, 32 entries (`table_presets.txt`), all caught on the final code: the
stored preset and its name (P), the store (S), where a place's equipment is set (U), and Settings (X).

- **The first run: 32 of 33 caught.** The other, P5, left the preset's own id out of the check for
  a name another preset has. The check before it already returns for a name the preset has, so P5
  could change nothing, and it went from the code.
- **The older tables:** the four entries on lines Maintenance 37 changed ran again on the final
  code: M27's 47c and R47-9, M30's 6j and M36's S3, all caught. Every table's anchors are found.

## Verification

- **Local**, `npm run verify` on the final code: lint and types clean; unit 3,909 passed + 5
  skipped by design (648 files); the day rules in two more zones, 96 + 96; the privacy scan, 1,240
  files; the build checked; the browser suite 443 passed + 14 skipped by design.
- **CI:** the branch's run 41245170228 on `696d587`, success, with the same counts; Deploy Pages run
  41246882231, success.
- **Live:** the marker reads `696d587`. Live suite from the owner's machine: 438 passed + 19 skipped by design, none failed.
- **The phone steps below,** walked as written on the live build in a fresh browser context:
  every line they quote was read from the app.

## Review on the phone

In a Chrome Incognito tab at the live URL, set up with gym access (any answers): it has its own
empty storage and no cloud token, so nothing here reaches your own places or presets.

1. Settings, Places, **Equipment presets**: Home and Full gym, each "Built in, always here", with
   no Edit.
2. **New preset**: name it "Hotel gym", tap **Full gym preset**, take a few things off, then **Save
   preset**: "Hotel gym" is listed with its count of items.
3. Plan, **Where you train**, **Edit** on Gym: **Hotel gym preset** sits beside Full gym preset and
   Home preset. Tap it, then **Save place**: Gym's line reads the preset's count of equipment.
4. Back in Equipment presets: **Edit** "Hotel gym", rename it "Hotel", take one more thing off,
   **Save preset**. Then **Edit**, **Delete**: it asks first ("Delete Hotel? The places you filled
   from it stay as they are."); **Delete preset**. On Plan, Gym's count is still the one in step 3.

Close the Incognito tab: everything in it goes.
