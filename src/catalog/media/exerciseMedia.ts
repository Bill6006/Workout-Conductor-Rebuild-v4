import type { MediaAsset, MediaCredit } from './mediaManifest';

/**
 * The licensed demonstrations (Maintenance 25, item 7): one for each exercise with a reusable
 * demonstration of its own exact variation, kept with the app (no hotlinks). A filmed clip is cut
 * to a short loop of the movement without sound, its end blended into its start so it plays on
 * without a jump; where the chosen film or drawings differ from the steps in a detail, a note says
 * so under it. Where no reusable film showed the exact variation clearly, a loop of licensed
 * drawings of its start and end takes its place. Every asset names its source, author, licence
 * and what was changed, here and in docs/media-license-register.md; the exercises with neither
 * keep a diagram of the movement, and the register says why. Each file is named by its content,
 * so a corrected clip reaches a phone that kept the old one.
 * Written by item 7's build script from the cut list; edit the script's tables, not this file.
 */

/** The line DVIDS asks every user of U.S. Department of War visual information to show. */
export const DOW_NOTICE =
  'The appearance of U.S. Department of War (DoW) visual information does not imply or constitute DoW endorsement.';

const CC_BY_3 = 'https://creativecommons.org/licenses/by/3.0/';
const CC_BY_SA_4 = 'https://creativecommons.org/licenses/by-sa/4.0/';

/** Each exercise's files, named by their content. */
const FILES: Readonly<Record<string, { clip: string; still: string }>> = {
  'barbell-bench-press': {
    clip: 'barbell-bench-press.7c2e9635.mp4',
    still: 'barbell-bench-press.a32cb9cc.webp',
  },
  'incline-barbell-bench-press': {
    clip: 'incline-barbell-bench-press.3403cb6d.mp4',
    still: 'incline-barbell-bench-press.a71f4595.webp',
  },
  'close-grip-bench-press': {
    clip: 'close-grip-bench-press.a8c5a383.mp4',
    still: 'close-grip-bench-press.2796f1cc.webp',
  },
  'dumbbell-bench-press': {
    clip: 'dumbbell-bench-press.48487f57.mp4',
    still: 'dumbbell-bench-press.0b76265a.webp',
  },
  'incline-dumbbell-press': {
    clip: 'incline-dumbbell-press.7bbcdcd8.mp4',
    still: 'incline-dumbbell-press.2dc46bf3.webp',
  },
  'machine-chest-press': {
    clip: 'machine-chest-press.1221e7a9.mp4',
    still: 'machine-chest-press.2f201a51.webp',
  },
  'smith-machine-bench-press': {
    clip: 'smith-machine-bench-press.035c6f5a.mp4',
    still: 'smith-machine-bench-press.2eef4570.webp',
  },
  'push-up': { clip: 'push-up.58d9c2d9.mp4', still: 'push-up.8ec6e23d.webp' },
  dip: { clip: 'dip.02bd9678.mp4', still: 'dip.41d5fc01.webp' },
  'cable-fly': { clip: 'cable-fly.a91788ed.mp4', still: 'cable-fly.d58ce883.webp' },
  'pec-deck': { clip: 'pec-deck.9d9a051d.mp4', still: 'pec-deck.da55d4b8.webp' },
  'dumbbell-fly': { clip: 'dumbbell-fly.4309802c.mp4', still: 'dumbbell-fly.79e23b11.webp' },
  'band-fly': { clip: 'band-fly.30d11437.mp4', still: 'band-fly.0829d67c.webp' },
  'band-chest-press': {
    clip: 'band-chest-press.6a4475a0.mp4',
    still: 'band-chest-press.f273343b.webp',
  },
  'overhead-press': { clip: 'overhead-press.895471ab.mp4', still: 'overhead-press.ce273f7b.webp' },
  'dumbbell-shoulder-press': {
    clip: 'dumbbell-shoulder-press.13a5aefa.mp4',
    still: 'dumbbell-shoulder-press.f5570d21.webp',
  },
  'arnold-press': { clip: 'arnold-press.544e9465.mp4', still: 'arnold-press.65e8d118.webp' },
  'machine-shoulder-press': {
    clip: 'machine-shoulder-press.1f4bd08c.mp4',
    still: 'machine-shoulder-press.afcab6ae.webp',
  },
  'lateral-raise': { clip: 'lateral-raise.ea265eec.mp4', still: 'lateral-raise.c4d73c6e.webp' },
  'cable-lateral-raise': {
    clip: 'cable-lateral-raise.875322ed.mp4',
    still: 'cable-lateral-raise.a5af8b23.webp',
  },
  'rear-delt-fly': { clip: 'rear-delt-fly.710d4be5.mp4', still: 'rear-delt-fly.f3233521.webp' },
  'reverse-pec-deck': {
    clip: 'reverse-pec-deck.e1e6a98e.mp4',
    still: 'reverse-pec-deck.070bd10c.webp',
  },
  'face-pull': { clip: 'face-pull.bd012256.mp4', still: 'face-pull.f9f47b50.webp' },
  'pull-up': { clip: 'pull-up.8ae2733a.mp4', still: 'pull-up.e224b998.webp' },
  'chin-up': { clip: 'chin-up.42c22574.mp4', still: 'chin-up.77f5b3c9.webp' },
  'lat-pulldown': { clip: 'lat-pulldown.66a204a7.mp4', still: 'lat-pulldown.1a7b00a6.webp' },
  'band-lat-pulldown': {
    clip: 'band-lat-pulldown.ed5cc287.mp4',
    still: 'band-lat-pulldown.a53b1fbb.webp',
  },
  'barbell-row': { clip: 'barbell-row.0399dddf.mp4', still: 'barbell-row.f22a00af.webp' },
  'dumbbell-row': { clip: 'dumbbell-row.eed15004.mp4', still: 'dumbbell-row.a0a7ce6d.webp' },
  'seated-cable-row': {
    clip: 'seated-cable-row.57b211c7.mp4',
    still: 'seated-cable-row.96bedc98.webp',
  },
  'band-row': { clip: 'band-row.00f86eb5.mp4', still: 'band-row.2b617d67.webp' },
  'inverted-row': { clip: 'inverted-row.70d5ec71.mp4', still: 'inverted-row.84fb4471.webp' },
  'straight-arm-pulldown': {
    clip: 'straight-arm-pulldown.0f6235bc.mp4',
    still: 'straight-arm-pulldown.a01f864f.webp',
  },
  'dumbbell-pullover': {
    clip: 'dumbbell-pullover.caa3b3d0.mp4',
    still: 'dumbbell-pullover.cb001d07.webp',
  },
  'dumbbell-shrug': { clip: 'dumbbell-shrug.d60d0f27.mp4', still: 'dumbbell-shrug.e20d83ab.webp' },
  'barbell-shrug': { clip: 'barbell-shrug.eb440fcc.mp4', still: 'barbell-shrug.e5774513.webp' },
  'farmer-carry': { clip: 'farmer-carry.1ed46e01.mp4', still: 'farmer-carry.3b7d67a3.webp' },
  'back-squat': { clip: 'back-squat.7eb5d991.mp4', still: 'back-squat.2497690f.webp' },
  'front-squat': { clip: 'front-squat.a32b95e7.mp4', still: 'front-squat.a6bfd297.webp' },
  'goblet-squat': { clip: 'goblet-squat.f66cc16b.mp4', still: 'goblet-squat.e161d367.webp' },
  'leg-press': { clip: 'leg-press.0f1afe71.mp4', still: 'leg-press.ce718692.webp' },
  'smith-machine-squat': {
    clip: 'smith-machine-squat.42ffba5d.mp4',
    still: 'smith-machine-squat.48f873e8.webp',
  },
  'bulgarian-split-squat': {
    clip: 'bulgarian-split-squat.2e5c70c6.mp4',
    still: 'bulgarian-split-squat.fa4c9cb6.webp',
  },
  'reverse-lunge': { clip: 'reverse-lunge.7ffe1071.mp4', still: 'reverse-lunge.4ff788b0.webp' },
  'step-up': { clip: 'step-up.b6fa9a35.mp4', still: 'step-up.61424958.webp' },
  'leg-extension': { clip: 'leg-extension.3f583167.mp4', still: 'leg-extension.4fdadd00.webp' },
  'leg-curl': { clip: 'leg-curl.097248ff.mp4', still: 'leg-curl.5c269cd0.webp' },
  'romanian-deadlift': {
    clip: 'romanian-deadlift.3d4f5234.mp4',
    still: 'romanian-deadlift.4c6c5754.webp',
  },
  'dumbbell-romanian-deadlift': {
    clip: 'dumbbell-romanian-deadlift.83f783f6.mp4',
    still: 'dumbbell-romanian-deadlift.ab355a89.webp',
  },
  deadlift: { clip: 'deadlift.6a4dedd4.mp4', still: 'deadlift.a065ad7b.webp' },
  'trap-bar-deadlift': {
    clip: 'trap-bar-deadlift.1794ae00.mp4',
    still: 'trap-bar-deadlift.2f6ef69e.webp',
  },
  'kettlebell-swing': {
    clip: 'kettlebell-swing.7a020843.mp4',
    still: 'kettlebell-swing.f984c238.webp',
  },
  'hip-thrust': { clip: 'hip-thrust.7d6cfe24.mp4', still: 'hip-thrust.fb2953c5.webp' },
  'glute-bridge': { clip: 'glute-bridge.2c9fadc8.mp4', still: 'glute-bridge.4d71dfab.webp' },
  'standing-calf-raise': {
    clip: 'standing-calf-raise.7784ed05.mp4',
    still: 'standing-calf-raise.6e242411.webp',
  },
  'leg-press-calf-raise': {
    clip: 'leg-press-calf-raise.76fcd859.mp4',
    still: 'leg-press-calf-raise.9a9428ca.webp',
  },
  'barbell-curl': { clip: 'barbell-curl.ca732c63.mp4', still: 'barbell-curl.c0b9c537.webp' },
  'ez-bar-curl': { clip: 'ez-bar-curl.85599d2c.mp4', still: 'ez-bar-curl.ed9b4817.webp' },
  'dumbbell-curl': { clip: 'dumbbell-curl.4b1a783e.mp4', still: 'dumbbell-curl.de9a0230.webp' },
  'hammer-curl': { clip: 'hammer-curl.13f2ba27.mp4', still: 'hammer-curl.69e8696c.webp' },
  'preacher-curl': { clip: 'preacher-curl.e489f20c.mp4', still: 'preacher-curl.972b2bd3.webp' },
  'cable-curl': { clip: 'cable-curl.0cbb59b9.mp4', still: 'cable-curl.9c345a3d.webp' },
  'band-curl': { clip: 'band-curl.13151fcd.mp4', still: 'band-curl.2f144dcf.webp' },
  'reverse-curl': { clip: 'reverse-curl.f6c4dd82.mp4', still: 'reverse-curl.98318c31.webp' },
  'skull-crusher': { clip: 'skull-crusher.45295bc8.mp4', still: 'skull-crusher.73ac31ff.webp' },
  'overhead-triceps-extension': {
    clip: 'overhead-triceps-extension.b0d6df18.mp4',
    still: 'overhead-triceps-extension.9783b0ab.webp',
  },
  'cable-overhead-triceps-extension': {
    clip: 'cable-overhead-triceps-extension.70b6dd26.mp4',
    still: 'cable-overhead-triceps-extension.4385884e.webp',
  },
  'cable-triceps-pushdown': {
    clip: 'cable-triceps-pushdown.1bf6c21e.mp4',
    still: 'cable-triceps-pushdown.524fedd8.webp',
  },
  'band-triceps-pushdown': {
    clip: 'band-triceps-pushdown.4621d5a2.mp4',
    still: 'band-triceps-pushdown.22d538d5.webp',
  },
  'bench-dip': { clip: 'bench-dip.450fda39.mp4', still: 'bench-dip.918d5850.webp' },
  plank: { clip: 'plank.b153266e.mp4', still: 'plank.71f3fdb2.webp' },
  'hanging-leg-raise': {
    clip: 'hanging-leg-raise.4650455a.mp4',
    still: 'hanging-leg-raise.8656274f.webp',
  },
};

/** Clips shown with the whole of the original frame. */
const UNCROPPED: ReadonlySet<string> = new Set([
  'barbell-bench-press',
  'incline-barbell-bench-press',
  'dumbbell-bench-press',
  'incline-dumbbell-press',
  'dip',
  'rear-delt-fly',
  'barbell-row',
  'standing-calf-raise',
]);

/** What was changed in a filmed clip. */
function clipChanges(exercise: string): string {
  const framing = UNCROPPED.has(exercise) ? 'resized' : 'cropped and resized';
  return `Cut to a short loop of the movement without sound, its end blended into its start, ${framing}; its first frame is the still.`;
}
/** The share-alike term, kept by every adaptation of a CC BY-SA original. */
const SHARED = ' This adaptation is shared under the same licence.';

function demo(
  exercise: string,
  form: 'video' | 'drawings',
  width: number,
  height: number,
  credit: MediaCredit,
): MediaAsset {
  return {
    id: `demo-${exercise}`,
    kind: 'production-loop',
    form,
    poster: `media/exercises/${FILES[exercise]?.still ?? `${exercise}.webp`}`,
    demo: `media/exercises/${FILES[exercise]?.clip ?? `${exercise}.mp4`}`,
    demoType: 'video/mp4',
    width,
    height,
    source: `${credit.title}, by ${credit.author}: ${credit.sourceUrl}`,
    license: credit.license,
    credit,
  };
}

/** A clip from DVIDS, the U.S. military's public media hub: a federal work, public domain. */
function dvids(exercise: string, id: number, title: string, width: number, height: number) {
  return demo(exercise, 'video', width, height, {
    title,
    author: 'Capt. Matthew Holfinger, U.S. Marine Corps Training and Education Command',
    byline: 'U.S. Marine Corps, via DVIDS',
    license: 'Public domain',
    licenseUrl: null,
    sourceUrl: `https://www.dvidshub.net/video/${id}`,
    changes: clipChanges(exercise),
    notice: DOW_NOTICE,
  });
}

/** A clip from wger's exercise database, by Goulart, under CC BY-SA 4.0. */
function wger(
  exercise: string,
  wgerExercise: number,
  title: string,
  file: string,
  width: number,
  height: number,
) {
  return demo(exercise, 'video', width, height, {
    title,
    author: 'Goulart',
    byline: 'Goulart, via wger',
    license: 'CC BY-SA 4.0',
    licenseUrl: CC_BY_SA_4,
    sourceUrl: `https://wger.de/en/exercise/${wgerExercise}/view/`,
    fileUrl: `https://wger.de/media/exercise-video/${wgerExercise}/${file}.MOV`,
    changes: clipChanges(exercise) + SHARED,
  });
}

/** A clip from Wikimedia Commons, under the licence its file page gives. */
function commons(
  exercise: string,
  file: string,
  author: string,
  byline: string,
  license: 'CC BY 3.0' | 'Public domain',
  width: number,
  height: number,
) {
  return demo(exercise, 'video', width, height, {
    title: file.replace(/\.webm$/, ''),
    author,
    byline,
    license,
    licenseUrl: license === 'CC BY 3.0' ? CC_BY_3 : null,
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replaceAll(' ', '_'))}`,
    changes: clipChanges(exercise),
  });
}

/** Everkinetic's start and end drawings of the exercise, by Greg Priday, under CC BY-SA 4.0. */
function drawings(exercise: string, title: string, name: string, width: number, height: number) {
  return demo(exercise, 'drawings', width, height, {
    title: `${title} (drawings)`,
    author: 'Greg Priday (everkinetic.com)',
    byline: 'Everkinetic',
    license: 'CC BY-SA 4.0',
    licenseUrl: CC_BY_SA_4,
    sourceUrl: 'https://github.com/everkinetic/data',
    fileUrl: `https://raw.githubusercontent.com/everkinetic/data/main/src/images-web/${name}-1.png`,
    changes:
      'Its start and end drawings shown in turn with a short blend, looped without sound; the first drawing is the still.' +
      SHARED,
  });
}

/** Every exercise's demonstration, in catalog order. */
export const EXERCISE_MEDIA: readonly MediaAsset[] = [
  commons(
    'barbell-bench-press',
    'Bench press - exercise demonstration video.webm',
    'FitnessScape',
    'FitnessScape',
    'CC BY 3.0',
    480,
    270,
  ),
  wger(
    'incline-barbell-bench-press',
    538,
    'Incline Bench Press - Barbell',
    '4349a6f6-4cee-4c09-828b-c5e7fc2c1ff1',
    480,
    270,
  ),
  {
    ...dvids('close-grip-bench-press', 679638, 'Close Grip Bench Press', 480, 240),
    note: 'The grip in the video is narrower than the steps: keep your hands at shoulder width.',
  },
  wger(
    'dumbbell-bench-press',
    75,
    'Benchpress Dumbbells',
    '080c799b-8afd-4130-8d72-9cef0cd79f54',
    480,
    270,
  ),
  wger(
    'incline-dumbbell-press',
    537,
    'Incline Bench Press - Dumbbell',
    'b9c937e9-daeb-42a9-be8e-7a77e368478c',
    480,
    270,
  ),
  {
    ...commons(
      'machine-chest-press',
      'Muscle Strengthening at the Gym - Chest Press.webm',
      'U.S. Centers for Disease Control and Prevention',
      'CDC',
      'Public domain',
      480,
      318,
    ),
    note: 'In the video the handles start at shoulder height: set the seat so they start at mid-chest.',
  },
  drawings(
    'smith-machine-bench-press',
    'Bench Press: Smith Machine',
    'smith-machine-bench-press',
    418,
    480,
  ),
  dvids('push-up', 638236, 'Pushups', 480, 270),
  wger('dip', 194, 'Dips', 'dd9a663f-d8ba-4621-823b-13788ccb66bc', 480, 270),
  {
    ...drawings('cable-fly', 'Cable Crossover', 'cable-crossover', 412, 480),
    note: 'The drawing leans forward and brings the hands low: stand tall and meet just below your chest.',
  },
  {
    ...commons(
      'pec-deck',
      '누구나 가슴운동을 해야 한다! 헬스장 기구 펙 덱 플라이 & 리어 델토이드 How to do Pec dec fly and rear deltoid.webm',
      '심으뜸의 마이너스 라이프 (Shim Eu-deum)',
      'Shim Eu-deum',
      'CC BY 3.0',
      480,
      316,
    ),
    note: 'The arms in the video are straight: keep the slight bend in your elbows the steps describe.',
  },
  drawings('dumbbell-fly', 'Dumbbell Flys', 'dumbbell-flys', 398, 480),
  drawings('band-fly', 'Crossover with Bands', 'crossover-bands', 404, 480),
  dvids('band-chest-press', 639894, 'Band Standing Chest Press', 320, 428),
  dvids('overhead-press', 692514, 'Military Press', 360, 420),
  dvids('dumbbell-shoulder-press', 636933, 'Dumbbell Shoulder Press', 338, 454),
  dvids('arnold-press', 636919, 'Dumbbel Arnold Press', 480, 266),
  wger(
    'machine-shoulder-press',
    543,
    'Shoulder Press, on Machine',
    'dbfd396b-1aab-4a64-a50b-2c31ff0a2cf7',
    480,
    360,
  ),
  wger('lateral-raise', 348, 'Lateral Raises', 'de69928a-8a35-4096-821c-1f46de5e0e03', 480, 360),
  {
    ...wger(
      'cable-lateral-raise',
      349,
      'Lateral Rows on Cable, One Armed',
      '9896d82e-d8b6-48af-bdd5-b8545dc523e9',
      480,
      360,
    ),
    note: 'The arm in the video rises a little above the shoulder: stop when it is level with it.',
  },
  wger(
    'rear-delt-fly',
    82,
    'Bent-over Lateral Raises',
    '437d79db-ac8f-49e2-8780-0365f94ee01c',
    480,
    270,
  ),
  commons(
    'reverse-pec-deck',
    '누구나 가슴운동을 해야 한다! 헬스장 기구 펙 덱 플라이 & 리어 델토이드 How to do Pec dec fly and rear deltoid.webm',
    '심으뜸의 마이너스 라이프 (Shim Eu-deum)',
    'Shim Eu-deum',
    'CC BY 3.0',
    480,
    316,
  ),
  wger('face-pull', 222, 'Facepull', 'eea93fcc-6a3c-4783-8f70-0234c791a001', 400, 400),
  commons(
    'pull-up',
    'Pull-ups - exercise demonstration video.webm',
    'FitnessScape',
    'FitnessScape',
    'CC BY 3.0',
    312,
    512,
  ),
  drawings('chin-up', 'Chin Ups', 'chin-ups', 302, 480),
  commons(
    'lat-pulldown',
    'Using a Power Rack in bodybuilding, powerlifting, strength training, resistance exercise.webm',
    'FitnessScape',
    'FitnessScape',
    'CC BY 3.0',
    360,
    480,
  ),
  dvids('band-lat-pulldown', 639891, 'Band Lat Pulldown', 320, 428),
  commons(
    'barbell-row',
    'Bent-over row - exercise demonstration video.webm',
    'FitnessScape',
    'FitnessScape',
    'CC BY 3.0',
    480,
    270,
  ),
  {
    ...dvids('dumbbell-row', 679697, 'Kettlebell Row - Single Arm', 400, 444),
    note: 'Shown with a kettlebell; a dumbbell is held and pulled the same way.',
  },
  wger(
    'seated-cable-row',
    512,
    'Rowing seated, narrow grip',
    'fff4c294-93f0-4926-b3a2-bf59ad4afaa5',
    400,
    400,
  ),
  dvids('band-row', 640249, 'Seated Band Row', 364, 274),
  dvids('inverted-row', 640257, 'Smith Machine Inverted Row', 480, 360),
  drawings('straight-arm-pulldown', 'Straight Arm Push Down', 'straight-arm-push-down', 196, 480),
  {
    ...drawings(
      'dumbbell-pullover',
      'Straight Arm Dumbbell Pullover',
      'straight-arm-dumbbell-pullover',
      480,
      416,
    ),
    note: 'The drawing lowers further than the steps: stop when your upper arms line up with your body.',
  },
  drawings('dumbbell-shrug', 'Shoulder Shrugs: Dumbbell', 'shoulder-shrugs', 216, 480),
  wger('barbell-shrug', 570, 'Shoulder Shrug', 'bd1f14a3-9d2b-4ec0-b6b9-e82d739f7e60', 400, 400),
  dvids('farmer-carry', 640980, 'Farmer Carry', 480, 268),
  dvids('back-squat', 548426, 'Barbell back squat', 360, 480),
  dvids('front-squat', 548433, 'Barbell Front Squat', 360, 480),
  dvids('goblet-squat', 548733, 'Kettlebell Goblet Squat', 360, 480),
  {
    ...wger('leg-press', 371, 'Leg Press', '6aae16b4-01b9-4eb4-935c-3250f84d2c59', 480, 270),
    note: 'The video lowers further than the steps: stop at about 90 degrees, before your hips lift.',
  },
  wger(
    'smith-machine-squat',
    341,
    'Squats on Multipress',
    '0cbfeace-dda9-4166-8424-f51358e88a4f',
    400,
    400,
  ),
  dvids('bulgarian-split-squat', 548728, 'Kettlebell Bulgarian Split Squat', 360, 480),
  drawings('reverse-lunge', 'Lunges: Dumbbell (Rear)', 'rear-lunges-with-dumbbell', 342, 480),
  drawings('step-up', 'Step Ups: Dumbbell', 'step-ups-with-dumbbells', 258, 480),
  drawings('leg-extension', 'Leg Extensions', 'leg-extensions', 314, 480),
  wger('leg-curl', 365, 'Leg Curls (laying)', 'becaf013-5044-40d0-bae9-7ed60c973737', 480, 270),
  dvids('romanian-deadlift', 548437, 'Barbell Romanian Deadlift', 480, 360),
  dvids('dumbbell-romanian-deadlift', 548459, 'Dumbbell Romanian Deadlift', 360, 480),
  dvids('deadlift', 548431, 'Barbell Deadlift', 360, 480),
  dvids('trap-bar-deadlift', 548726, 'Hexbar Deadlift', 400, 400),
  dvids('kettlebell-swing', 754731, 'Kettlebell Swing', 360, 480),
  wger('hip-thrust', 294, 'Hip Thrust', '45bacf4b-1bb6-4d47-8bd1-9f00eddd4019', 480, 270),
  commons(
    'glute-bridge',
    '누워서 하는 힙운동 7분 따라하기(Lying hip-up workout).webm',
    '심으뜸의 마이너스 라이프 (Shim Eu-deum)',
    'Shim Eu-deum',
    'CC BY 3.0',
    480,
    270,
  ),
  wger(
    'standing-calf-raise',
    622,
    'Standing Calf Raises',
    '461171e5-2b16-407d-bf27-27aeef43f105',
    480,
    270,
  ),
  drawings(
    'leg-press-calf-raise',
    'Calves Press on Leg Machine',
    'calves-press-on-leg-machine',
    480,
    326,
  ),
  wger(
    'barbell-curl',
    91,
    'Biceps Curls With Barbell',
    '483f4bff-e108-41f1-8e7b-0caf24952552',
    360,
    512,
  ),
  dvids('ez-bar-curl', 753252, 'EZ Bar Curl', 400, 400),
  wger(
    'dumbbell-curl',
    92,
    'Biceps Curls With Dumbbell',
    '8bfb917c-3d0d-49b9-8073-5d7e01c1b894',
    360,
    512,
  ),
  wger('hammer-curl', 272, 'Hammer Curls', 'df069052-2173-4f24-855f-a0eebe729f24', 360, 512),
  wger('preacher-curl', 465, 'Preacher Curls', '5d2339a4-815f-46ba-aa19-8a763cfdeba0', 400, 338),
  wger(
    'cable-curl',
    95,
    'Biceps Curl With Cable',
    'ab770931-47d3-44fd-aef0-ac7a64c3b794',
    360,
    512,
  ),
  dvids('band-curl', 636835, 'Band Standing Curl', 320, 428),
  drawings(
    'reverse-curl',
    'Biceps Curl: Dumbbell (Reverse)',
    'biceps-curl-reverse-with-dumbbells',
    230,
    480,
  ),
  wger(
    'skull-crusher',
    246,
    'Skullcrusher SZ-bar',
    '40ca562f-b46b-45c8-81fa-1ea8d544b1b8',
    480,
    360,
  ),
  wger(
    'overhead-triceps-extension',
    211,
    'Dumbbell Triceps Extension',
    '85f6eb25-a76c-409e-9af9-497794ac0dfb',
    480,
    360,
  ),
  wger(
    'cable-overhead-triceps-extension',
    659,
    'Triceps Extensions on Cable',
    '1f2eb3b6-3185-429f-8330-26dc88f39aff',
    360,
    512,
  ),
  drawings(
    'cable-triceps-pushdown',
    'Triceps Pushdown: Cable (Rope)',
    'triceps-pushdown-with-rope-and-cable',
    170,
    480,
  ),
  dvids('band-triceps-pushdown', 639904, 'Band Tricep Pressdown', 338, 450),
  {
    ...drawings('bench-dip', 'Bench Dips', 'bench-dips', 480, 356),
    note: 'The drawing rests the heels on a second bench: keep your feet on the floor.',
  },
  dvids('plank', 640237, 'Plank', 480, 240),
  {
    ...commons(
      'hanging-leg-raise',
      'Leg raises - exercise demonstration video.webm',
      'FitnessScape',
      'FitnessScape',
      'CC BY 3.0',
      320,
      512,
    ),
    note: 'Shown with straight legs, the harder version; start with bent knees.',
  },
];

/** The exercises with a licensed demonstration of their own. */
export const DEMONSTRATED_EXERCISE_IDS: ReadonlySet<string> = new Set(
  EXERCISE_MEDIA.map((asset) => asset.id.replace(/^demo-/, '')),
);
