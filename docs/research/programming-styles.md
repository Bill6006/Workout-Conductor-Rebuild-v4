# Programming styles: the research and how the app uses it

Maintenance 15 (round E). A programming style decides how each set is done: sets, rep range, reps in reserve, rest. The goal still decides where the weekly volume goes. This page records what each style does in the engine, the studies behind it, and how Auto picks one.

Every source below was looked up on PubMed on 2026-09-18 and its abstract read before a claim was written. Where the app says "meta-analysis of 21 studies" the abstract says so. Reference numbers in square brackets point to the list at the end.

## What the research tells apart

The 2026 ACSM position stand is an overview of 137 systematic reviews covering more than 30,000 people [1]. Its main finding shapes this whole round: few prescription variables change the outcome at all. The ones that did:

- **Strength** was enhanced by heavier loads (80% of a one-rep max and up), a full range of motion, two to three sets, putting the lift at the start of the session, and two or more sessions a week [1].
- **Muscle size** was enhanced by higher volumes (ten or more sets a week) and eccentric overload [1].
- Training to momentary failure, equipment type, set structure, time under tension, and periodization **did not consistently change outcomes** [1].

So the list of styles is short on purpose. A style is here only if the evidence tells it apart from the others, or if it answers a situation the lifter is actually in (losing fat, new to lifting, limited weights).

## The styles

| Style                 | What the engine does                                                                                                                       | Evidence                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| **Hybrid**            | First lift heavy (the exercise's strength range, 4 sets, 2 reps in reserve, 150 s rest), then volume at the hypertrophy range              | Strong                                     |
| **Hypertrophy focus** | One set fewer on the heavy lift, one more on the main volume lift; moderate loads throughout                                               | Strong                                     |
| **Strength focus**    | The main volume lift also moves to the strength range; strength-priority session templates lead                                            | Strong                                     |
| **Undulating**        | The lifts that carry a session rotate heavy, moderate, and light, one zone per logged session of that lift; accessories unchanged          | Mixed                                      |
| **Lean-down**         | Hybrid's loads and sets, with nothing taken to failure: no zero-reserve finisher, no drop set, and the coach offers no extra sets          | Moderate                                   |
| **Light weights**     | Every loaded lift at the light end (from the top of its usual range up, never past 25 reps), 1 rep in reserve, volume as Hypertrophy focus | Strong for size; max strength is the trade |
| **Foundation**        | Moderate loads only (no heavy range), fewer sets, 2 to 3 reps in reserve, shorter rests, full-body or upper/lower sessions, no drop set    | Strong                                     |

The three original styles behave exactly as they did before this round; a unit test pins that.

### Hybrid

Strength is built by heavy loads on the lifts done first in a session [1][7]. Muscle size follows weekly sets and grows the same from light to heavy loads [1][2]. A heavy lift first with volume after it serves both in one session.

### Hypertrophy focus

More weekly sets meant more growth in a graded dose-response: each added weekly set was associated with a further 0.37% gain [4]. Growth was similar across loads when sets were taken to failure [2][3], so the sets can sit at moderate loads. Training a muscle twice a week beat once a week with volume matched [5].

### Strength focus

Heavy loads built more one-rep-max strength than light ones in two meta-analyses [2][3]. Strength rose most on the exercises done first [7]. Trained lifters needed rests longer than two minutes to get the most strength; one to two minutes was enough for new lifters [8]. Medium and high weekly set counts beat low ones for strength [10]. More sessions a week helped strength only through the extra volume they carry [6].

### Undulating (mixed evidence)

With volume matched, periodized training built more one-rep-max strength than non-periodized, and undulating beat linear in trained lifters but not in new ones [12]. An earlier meta-analysis also favoured undulating plans [13], and the original 12-week trial found daily changes beat changes every four weeks [14]. For muscle size the models came out the same (pooled difference -0.02) [15][12], so nothing is given up.

Against that, the 2026 position stand found periodization did not consistently change outcomes [1]. The app labels this style "Mixed evidence", says so on the coach card that offers it, and offers it only when two or more lifts have stalled at a fixed rep range under Hybrid or Strength focus, for a lifter past the beginner stage. Auto never picks it by itself.

### Lean-down (losing fat)

An energy deficit impaired lean-mass gain (effect size -0.57) but not strength gain, and a deficit of about 500 kcal a day was enough to stop lean mass rising [16]. In 38 trained men on a six-week deficit, five sets per exercise kept no more muscle than three [17], so the style holds its volume and the coach stops offering extra sets. In young adults, muscle and strength were retained on a third of the usual weekly sets [19]. Physique athletes in a deficit are advised to train each muscle twice a week or more, mostly at 6 to 12 reps [18]. Stopping short of failure costs no muscle [9], which is why nothing in this style goes to failure. Lifting itself lowers body fat a little, about 1.5 percentage points against no training [20]; the diet does the rest, and the app says so rather than implying the training does it.

### Light weights

Muscle grew the same from light to heavy loads when sets were taken to failure [2][3]; in trained men, 20 to 25 reps grew as much as 8 to 12 [23]. With light loads the effort is what counts: to failure they grew muscle, short of it they grew less, while at heavy loads failure added nothing [21]. Loads from 40% of a max up grew muscle equally and 20% was too light [22], which is why the range stops at 25 reps. Adding reps at a fixed weight worked as well as adding weight over eight weeks [24], which is also what the cap rule from Maintenance 12 does when a place runs out of weight. The trade is max strength, which grows less on light loads [2].

### Foundation

New lifters gained the most at about 60% of a max, three days a week, four sets per muscle group; trained lifters needed about 80% [11]. The 2009 position stand advises a novice moderate loads for 8 to 12 reps, one to three sets, two to three days a week [25], and the 2026 update kept two to three sets and two or more sessions a week [1]. Rests of one to two minutes were enough for new lifters [8], and stopping short of failure cost no muscle [9]. Foundation also switches a four-way split to full-body and upper/lower sessions, because frequency per muscle is what the dose-response data favour for a new lifter [11].

## How Auto picks

Auto reads the profile only: experience, the Losing fat switch in Goals, and the two goals. The rules run in this order, and the first that applies wins:

1. **Beginner** → Foundation. Losing fat does not change it: a new lifter's plan holds and the diet does the rest.
2. **Losing fat** → Lean-down.
3. **Strength and a size goal** (in either order) → Hybrid.
4. **Strength alone** → Strength focus.
5. **Size goals only** → Hypertrophy focus, with a line saying that adding Strength progress as a goal is what would change it.

Settings shows which rule decided, in a sentence, with the evidence grade and the sources folded under "The research".

Auto deliberately does not read the training log. A choice that moved with every good or bad week would change the plan under the lifter's feet. What the log can say comes through the coach as an offer with one tap: several lifts stalled at a fixed rep range → "Rotate the rep ranges" (Undulating, with its mixed evidence stated on the card).

Nothing is switched silently. A profile saved before this round keeps its style and gets one coach card ("Your goals point to Hypertrophy focus, not Hybrid", or a quieter tip when the goals already agree) with one action, **Let my goals choose**. Not now uses the usual decline memory. A profile that has picked a style by hand, or has Auto on, is never second-guessed.

## The weight follows the reps

A style that changes the rep range has to change the weight with it, and before this round the progression engine did not: last session's weight carried into whatever range was asked next, including when the same lift appeared in a different role. The rule now:

- A logged session counts toward today's target only when it was run at about the same rep range: the tops of the two ranges within 2 reps. The cap rule's +2 rep shift therefore never counts as a new range.
- When sessions at today's range exist and the newest is within 42 days of the lift's latest session, progression runs on those sessions alone. Misses, clean sessions, and tops are all counted within the range.
- When there is none, the load comes from the latest session's estimated one-rep max: 95% of what it implies for today's reps and reserve. The evidence line says so and the next logged set takes over.
- A break is measured from the lift's latest session at any range, so an undulating lift trained weekly is not treated as three weeks away from its heavy day.

A lift that stays at one range behaves exactly as before; 498 existing unit tests passed unchanged.

## Stored safely

The profile syncs between devices, and a copy of the app from before this round validates `trainingStyle` as a strict list of three. An unknown value there makes that copy reject the whole profile and ask for setup again, which would then overwrite the good one in the cloud. So the new choices ride in new optional fields:

- `programStyle` holds the choice, Auto included. `trainingStyle` always keeps the nearest original style (Undulating and Lean-down → Hybrid; Light weights and Foundation → Hypertrophy focus), so an older copy still reads the profile and trains sensibly.
- `goals.bodyweight` holds the Losing fat switch.
- Both fields read a value from a newer copy of the app as unset instead of failing the profile.

## Left out, and why

- **A time-efficient style.** The workout-length dropdown already is that control (owner, 2026-09-18). One way to say "less time today".
- **Power and muscular-endurance styles.** The research distinguishes them [1], but the app has no goal that would select them and the catalog has no jumps, throws, or Olympic lifts.
- **Top set and back-off sets.** Every working set of an entry shares one target in the engines; a second target per entry is a larger change than this round.
- **Auto reading the training log.** See above: stability first, the coach for the rest.

## References

1. Currier BS, D'Souza AC, Singh MAF, et al. American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. Med Sci Sports Exerc. 2026;58(4):851-872. doi:10.1249/MSS.0000000000003897. PMID 41843416.
2. Schoenfeld BJ, Grgic J, Ogborn D, Krieger JW. Strength and Hypertrophy Adaptations Between Low- vs. High-Load Resistance Training: A Systematic Review and Meta-analysis. J Strength Cond Res. 2017;31(12):3508-3523. doi:10.1519/JSC.0000000000002200. PMID 28834797.
3. Lopez P, Radaelli R, Taaffe DR, et al. Resistance Training Load Effects on Muscle Hypertrophy and Strength Gain: Systematic Review and Network Meta-analysis. Med Sci Sports Exerc. 2021;53(6):1206-1216. doi:10.1249/MSS.0000000000002585. PMID 33433148.
4. Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis. J Sports Sci. 2017;35(11):1073-1082. doi:10.1080/02640414.2016.1210197. PMID 27433992.
5. Schoenfeld BJ, Ogborn D, Krieger JW. Effects of Resistance Training Frequency on Measures of Muscle Hypertrophy: A Systematic Review and Meta-Analysis. Sports Med. 2016;46(11):1689-1697. doi:10.1007/s40279-016-0543-8. PMID 27102172.
6. Grgic J, Schoenfeld BJ, Davies TB, Lazinica B, Krieger JW, Pedisic Z. Effect of Resistance Training Frequency on Gains in Muscular Strength: A Systematic Review and Meta-Analysis. Sports Med. 2018;48(5):1207-1220. doi:10.1007/s40279-018-0872-x. PMID 29470825.
7. Nunes JP, Grgic J, Cunha PM, et al. What influence does resistance exercise order have on muscular strength gains and muscle hypertrophy? A systematic review and meta-analysis. Eur J Sport Sci. 2021;21(2):149-157. doi:10.1080/17461391.2020.1733672. PMID 32077380.
8. Grgic J, Schoenfeld BJ, Skrepnik M, Davies TB, Mikulic P. Effects of Rest Interval Duration in Resistance Training on Measures of Muscular Strength: A Systematic Review. Sports Med. 2018;48(1):137-151. doi:10.1007/s40279-017-0788-x. PMID 28933024.
9. Refalo MC, Helms ER, Trexler ET, Hamilton DL, Fyfe JJ. Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy: A Systematic Review with Meta-analysis. Sports Med. 2023;53(3):649-665. doi:10.1007/s40279-022-01784-y. PMID 36334240.
10. Ralston GW, Kilgore L, Wyatt FB, Baker JS. The Effect of Weekly Set Volume on Strength Gain: A Meta-Analysis. Sports Med. 2017;47(12):2585-2601. doi:10.1007/s40279-017-0762-7. PMID 28755103.
11. Rhea MR, Alvar BA, Burkett LN, Ball SD. A meta-analysis to determine the dose response for strength development. Med Sci Sports Exerc. 2003;35(3):456-464. doi:10.1249/01.MSS.0000053727.63505.D4. PMID 12618576.
12. Moesgaard L, Beck MM, Christiansen L, Aagaard P, Lundbye-Jensen J. Effects of Periodization on Strength and Muscle Hypertrophy in Volume-Equated Resistance Training Programs: A Systematic Review and Meta-analysis. Sports Med. 2022;52(7):1647-1666. doi:10.1007/s40279-021-01636-1. PMID 35044672.
13. Williams TD, Tolusso DV, Fedewa MV, Esco MR. Comparison of Periodized and Non-Periodized Resistance Training on Maximal Strength: A Meta-Analysis. Sports Med. 2017;47(10):2083-2100. doi:10.1007/s40279-017-0734-y. PMID 28497285.
14. Rhea MR, Ball SD, Phillips WT, Burkett LN. A comparison of linear and daily undulating periodized programs with equated volume and intensity for strength. J Strength Cond Res. 2002;16(2):250-255. PMID 11991778.
15. Grgic J, Mikulic P, Podnar H, Pedisic Z. Effects of linear and daily undulating periodized resistance training programs on measures of muscle hypertrophy: a systematic review and meta-analysis. PeerJ. 2017;5:e3695. doi:10.7717/peerj.3695. PMID 28848690.
16. Murphy C, Koehler K. Energy deficiency impairs resistance training gains in lean mass but not strength: A meta-analysis and meta-regression. Scand J Med Sci Sports. 2022;32(1):125-137. doi:10.1111/sms.14075. PMID 34623696.
17. Roth C, Schwiete C, Happ K, Rettenmaier L, Schoenfeld BJ, Behringer M. Resistance training volume does not influence lean mass preservation during energy restriction in trained males. Scand J Med Sci Sports. 2023;33(1):20-35. doi:10.1111/sms.14237. PMID 36114738.
18. Helms ER, Fitschen PJ, Aragon AA, Cronin J, Schoenfeld BJ. Recommendations for natural bodybuilding contest preparation: resistance and cardiovascular training. J Sports Med Phys Fitness. 2015;55(3):164-178.
19. Bickel CS, Cross JM, Bamman MM. Exercise dosing to retain resistance training adaptations in young and older adults. Med Sci Sports Exerc. 2011;43(7):1177-1187. doi:10.1249/MSS.0b013e318207c15d. PMID 21131862.
20. Wewege MA, Desai I, Honey C, et al. The Effect of Resistance Training in Healthy Adults on Body Fat Percentage, Fat Mass and Visceral Fat: A Systematic Review and Meta-Analysis. Sports Med. 2022;52(2):287-300. doi:10.1007/s40279-021-01562-2. PMID 34536199.
21. Lasevicius T, Schoenfeld BJ, Silva-Batista C, et al. Muscle Failure Promotes Greater Muscle Hypertrophy in Low-Load but Not in High-Load Resistance Training. J Strength Cond Res. 2022;36(2):346-351. doi:10.1519/JSC.0000000000003454.
22. Lasevicius T, Ugrinowitsch C, Schoenfeld BJ, et al. Effects of different intensities of resistance training with equated volume load on muscle strength and hypertrophy. Eur J Sport Sci. 2018;18(6):772-780. doi:10.1080/17461391.2018.1450898. PMID 29564973.
23. Morton RW, Oikawa SY, Wavell CG, et al. Neither load nor systemic hormones determine resistance training-mediated hypertrophy or strength gains in resistance-trained young men. J Appl Physiol. 2016;121(1):129-138. doi:10.1152/japplphysiol.00154.2016. PMID 27174923.
24. Plotkin D, Coleman M, Van Every D, et al. Progressive overload without progressing load? The effects of load or repetition progression on muscular adaptations. PeerJ. 2022;10:e14142. doi:10.7717/peerj.14142. PMID 36199287.
25. American College of Sports Medicine. Progression models in resistance training for healthy adults (position stand). Med Sci Sports Exerc. 2009;41(3):687-708. doi:10.1249/MSS.0b013e3181915670. PMID 19204579.
