import type { Joint } from './exerciseSchema';

/** A joint in a sentence: "lower back". */
export function jointWord(joint: Joint): string {
  return joint.replace('-', ' ');
}

/** A joint as a label: "Lower back". */
export function jointName(joint: Joint): string {
  const words = jointWord(joint);
  return words.charAt(0).toUpperCase() + words.slice(1);
}
