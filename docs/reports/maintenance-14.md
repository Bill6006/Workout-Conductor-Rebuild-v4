# Maintenance 14: alerts, round D

Started on 2026-09-18 after Maintenance 13 went GREEN. Two items from the owner's list: a sound
and a notification when the rest timer ends, and a notification when a workout has been left
unfinished for too long.

## What was found

- **The rest timer ended in silence.** Its only signal was a short vibration and the word Go, so
  a rest that ended while the lifter looked away simply ran on.
- **A workout left open stays open.** An active session is kept across days until it is ended,
  which is right, but nothing ever said so. Its sets are not in the history until then, so the
  next plan is built without them.
- **There is no server.** A web app cannot schedule a notification for a moment when it is
  asleep: the browser feature for that never shipped, and the alternative is a push sent by a
  server, which this app does not have and which would put training data through one. The owner
  was told this when the item was agreed, and the round is built inside that limit.

## Delivered

- **The rest counts itself in.** Three short ticks at three, two and one seconds, and a longer
  tone at zero. The cues are laid onto the audio clock a few seconds ahead, so they land on the
  second even when the page is busy, and they are cancelled the moment the rest is adjusted,
  paused, or skipped. They work from any tab of the app. The browser only lets a page make
  sound after a tap, so the tap that logs a set is what unlocks it. On by default, with a switch
  in Settings; web audio cannot see the phone's silent switch, so that switch is the control.
- **A notification when the rest ends**, shown only while the app is in the background, and put
  away when the app is looked at again. A tap on it brings the workout forward.
- **A nudge for a workout left open.** After half an hour without a logged set, in the
  background: "Workout still open", with how many exercises are logged. Once per idle stretch.
- **The coach names it, reliably.** Whatever the phone did with the notification, the next time
  the app is opened after three hours the one gold card says how long the workout has been open
  and that nothing is lost, and its one action opens the end-of-workout sheet, from Today or
  from the workout. It outranks everything but safety.
- **Permission is asked for once, from the switch.** Notifications are off until the Settings
  switch is turned on, which is the only thing that asks the browser. If the browser refuses,
  the switch stays off and one line says why.
- **Said plainly, in the app.** Under the switches: with the phone locked a notification may
  come late or not at all, because the app cannot wake itself. No promise the platform cannot
  keep.
- **Nothing leaves the device.** No server, no push service, no new network call. The two
  switches live in the device's local settings, outside backups and the cloud copy.
- **Surfaces.** One Alerts card in Settings with two switches and one line. Nothing new on the
  workout screen.

## Verification

- Unit: the cue plan for a full, short, and finished rest; the scheduler laying four tones on
  the audio clock, once per rest, and cancelling them on a change; the alerts hook laying sounds
  3.6 seconds ahead, staying silent when off or paused, notifying only in the background, and
  nudging once after half an hour; the coach's card at four hours, a day, and days, its silence
  in a normal session, and its rank; the Alerts card's defaults, the permission asked only from
  the switch, a refusal, and a browser without notifications.
- Browser (`e2e/alerts.spec.ts`, all three device projects): the sounds switch is on by default
  and remembered after a reload; notifications turn on only from the switch; with the clock
  moved four hours ahead the coach names the open workout, its action opens the end-of-workout
  sheet, and from Today the same tap lands on the workout with the sheet open.

## How to check on the phone

1. Settings, Alerts: turn Notifications on and allow them when the browser asks.
2. Log a set and wait out the rest with the app on screen: three ticks, then a longer tone.
3. Log a set, switch to another app, and wait out the rest: a notification says the rest is
   over. Tap it to come back.
4. Leave a workout open for three hours, then open the app: the coach card says how long it has
   been open, and End and save it opens the sheet.
