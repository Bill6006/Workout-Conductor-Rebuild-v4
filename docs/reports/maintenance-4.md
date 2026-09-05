# Maintenance 4: richer fatigue and recovery signals, and week-aware selection

The last two items of the owner's "smarter coach" list.

## Delivered

- **Fatigue from more signals.** Beyond session density, consecutive days, RIR drift, and
  ratings, fatigue now reads the saved check-ins as a trend, rests that ran long between logged
  sets, and performance drift across each lift's estimated max. The same score and levels feed
  progression, the coach, and the strategy engine.
- **A deload week with a date.** When a dense fortnight meets elevated or high fatigue and a
  sign the body is not keeping up, the Plan tab's recovery card suggests a deload week starting
  on the next training day, with its reasons, and one "Plan it" button. A planned week lightens
  every generated session (one set fewer per exercise, one more rep in reserve, loads ten
  percent lighter), says so in "Why this workout", is kept in the meta store and backed up, can
  be cancelled, and expires on its own.
- **Week-aware selection.** The template choice counts muscles trained in the last two days
  against a session and muscles behind their weekly target for it. Candidates for behind
  muscles score a little higher, and after the anchor lift the accessories for behind muscles
  lead. "Why this workout" now says which muscles have recovered, which sit out, and which the
  accessories lead with.
- **Surfaces.** One line and one button on the Plan tab's recovery card; everything else lands
  in existing explanation lines. Nothing is planned or applied without a tap.

## Verification

- Unit: the new fatigue signals, deload recommendation and window arithmetic, week-aware
  template choice, accessory order and reasons, the deload adjustment reaching sets and loads,
  and the store planning, applying, reloading, expiring, and cancelling a week.
- Browser: the Plan tab shows the deload line; "Why this workout" carries the week-aware line.

## How to check on the phone

1. Plan tab, recovery card: with light training it reads "No deload week needed"; after a dense,
   hard fortnight it suggests a week with reasons and "Plan it". Plan it, then open Today: the
   preview says "Deload week" in Why this workout and the sets are lighter.
2. Today, "Why this workout": read which muscles recovered, which sit out, and which lead.
