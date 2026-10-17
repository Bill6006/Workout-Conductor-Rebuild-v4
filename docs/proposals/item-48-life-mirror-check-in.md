# Item 48: Life Mirror's daily check-in in Workout Conductor

_A read-only inspection of both apps' code (2026-10-11), carried into the repository on 2026-10-17 for
the cloud handoff. Life Mirror's private specifics are left out on purpose: this file names only the
readings Workout Conductor may use. Life Mirror's source is public (github.com/Bill6006/life-mirror);
file names below are from its `src/`, and may have moved._

The decision this feeds is in [week-model-readiness-time.md](week-model-readiness-time.md), part 3.
Workout Conductor never edits Life Mirror, its code, its database rows or its repository.

## Life Mirror's check-in

- One tap per reading, five phrases each, stored 1-5 from low to high of the named thing
  (`readings.ts`, `readings.json`, `checkin.tsx`).
- **energy** ("In the body", Drained … Buzzing): asked in every block, Full and Short depth.
- **mood**: every block. **stress**: every block; 5 = Crushing, the worst.
- **sleepHours** ("Last night"): 1 = under 5 h, 2 = 5-6, 3 = 6-7, 4 = 7-8, 5 = over 8. Morning
  only, Full depth only, and it can be retired.
- **sleepQuality** (Broken, Rough, Fair, Sound, Deep): morning only, Full only, retirable.
- **motivation** ("The pull to do things", None … Pulled): morning only, Full only, retirable.
- Full-only extras exist (focus, irritation, overwhelm, hunger, confidence, social energy,
  loneliness). Workout Conductor has no use for them.
- **Blocks:** morning 04:00-11:59, afternoon 12:00-16:59, evening 17:00-03:59 (after midnight counts
  as the previous day). Only the current block can be started; a missed block cannot be backfilled.
- Nothing is required: each tap saves; a reading can be edited or cleared; a check-in can be deleted.
- **Depths:** Short = mood, energy, stress. Low-demand = Short, evening only. Defaults: Full, three
  blocks a day, reminders off.
- Life Mirror also keeps other daily context (evening extras, free-text notes, day-context answers).
  It is private: Workout Conductor never reads, stores, logs or shows it.
- **Not recorded at all:** soreness, pain or joints, illness, alcohol, cycle, steps, bodyweight.
- Its Brain Worker derives facts (for example a short night = sleepHours <= 2) and writes rows under
  its own app name.

## Storage and sync

- **On the phone:** Dexie database `life-mirror` (schema version 18), store `checkins`
  (`'++id, &[day+block], day, completedAt'`). A record is
  `{id, day, block, asked[], startedAt, completedAt|null, updatedAt, answers{id: 1-5}, activeMs, extras}`.
- **In the shared Turso database** (`life-record`, table
  `records(app, store, id, day, body, updated_at, deleted, device_id, synced_at)`):
  - Life Mirror writes `app='life-mirror', store='checkins'`, with id = its local id, day and
    updated_at.
  - The whole body goes up, private fields included.
  - A deletion has `deleted=1`, body `'{}'` and day NULL.
  - A push follows about 2 s after a tap.
  - Duplicate rows for one block are possible: keep the later `updatedAt`.
- Each app writes only its own rows. Workout Conductor pulls only `app='workout-conductor'` today
  (`src/core/cloud/model.ts`).

## Workout Conductor's check-in today ("Quick check-in", `ReadinessSheet.tsx`)

- **Energy and Sleep** (1-5, default 3): <= 2 means one set fewer and one more RIR, and fatigue +2.
- **Motivation:** <= 2 means one set fewer and one more RIR, with no fatigue effect.
- **Soreness** (1-5, 5 is worst; default 2): >= 4 means one set fewer and fatigue +1.
- **Joint discomfort** chips: the joint becomes a pain area for the session; lifts that load it
  heavily are swapped or dropped.
- **Short on time** toggle: a Default session is fitted to 45 minutes.
- **Fatigue bonus:** energy >= 4, sleep >= 4 and soreness <= 2 together give -1 (`fatigue.ts`).
- **Downstream:** high fatigue holds loads and shows "Recovery first today"; a low check-in blocks
  the reserve check; the last three check-ins form a trend that feeds deload advice.
- **Storage:** per session (`session.constraints.readiness`, localStorage `wc.v1.session`), copied
  into the workout record on finish, and synced in `workouts`.
- **Side finding:** the `Readiness` type's comment says 1 = worst, but soreness runs the other way
  (5 = worst).

## Overlap

| Workout Conductor needs | Life Mirror has | Use |
|---|---|---|
| Energy | energy, latest block today | Exact. Show its time. |
| Sleep | sleepHours and sleepQuality, this morning | Partial. The conversion is a science decision (`docs/research/readiness-and-soreness.md`). |
| Motivation | motivation ("the pull to do things") | A weak hint only. It never cuts sets on its own. |
| Stress, mood | stress and mood today | New inputs for the personal baseline. Workout Conductor does not ask them. |
| Soreness, pain and joints, illness, time today | nothing | Always asked by Workout Conductor. |

## The data path

- **Chosen: Turso, read-only.**
  - On opening the check-in, read
    `SELECT id, day, body, updated_at FROM records WHERE app='life-mirror' AND store='checkins' AND deleted=0 AND day=?`,
    keeping the later updatedAt per block.
  - It is separate from the regular pull, and caches only the numbers it uses, on the device.
  - Both apps must use the same database. Life Mirror's URL is fixed; Workout Conductor can point at
    a per-person database. When they differ, item 48 is simply off.
- **Rejected: opening Life Mirror's IndexedDB directly (same origin).**
  - Opening it without a version can create an empty v1 database.
  - Opening it with a version can upgrade or wipe Life Mirror's stores.
  - A held connection blocks Life Mirror's upgrades; it has no versionchange handler.
  - The schema would become an unwritten contract.

## Missing, stale, partial and unknown data

- **Missing** (no token, offline, another database, nothing today, Short or Low-demand depth, a
  retired reading): the sheet as today, silently.
- **Stale:** only today's local-day check-ins count. Sleep and motivation come only from this
  morning's block. A session between 00:00 and 03:59 counts as missing.
- **Partial:** each reading is used on its own.
- **Unknown schema:** only whole numbers 1-5 for known reading ids count; anything else is missing.
  Never throw; never write back.
- **Always:**
  - Ask soreness, joints and time.
  - Label a prefilled value ("from Life Mirror, 07:40"), changeable with one tap.
  - Read when the sheet opens; never re-plan on later changes.
  - Record each value's source in an optional stored field with `.catch`.

## Privacy and consent

- Life Mirror's own privacy rules list who may receive its record, and Workout Conductor is not on
  that list. The precedent: Life Mirror reading Workout Conductor's workouts was added at the owner's
  word and disclosed on Life Mirror's Cloud screen.
- So item 48 needs three things:
  - the owner's word, given for the cloud run on 2026-10-17;
  - a Workout Conductor switch that stays off until the owner turns it on;
  - later, a disclosure line in Life Mirror. That is Life Mirror's own workstream, made when its
    gates allow edits; the Workout Conductor work never makes it.
- Synced check-in bodies carry private fields. Workout Conductor reads only the reading ids it uses
  and drops the rest of the body at once: nothing else is cached, logged, synced or shown.

## Open facts (the owner's, or for the evidence to settle)

1. The owner's live Life Mirror settings: depth, blocks, retired readings.
2. Whether one token reads both apps' rows (it does when both use the same database).
3. Whether the morning check-in usually comes before training.
4. The sleep conversion rule and the motivation substitute: evidence decisions.
5. A frozen Android PWA holding Life Mirror's IndexedDB open during an upgrade (matters only for
   the rejected path).
6. Other people using Workout Conductor on the owner's database.
