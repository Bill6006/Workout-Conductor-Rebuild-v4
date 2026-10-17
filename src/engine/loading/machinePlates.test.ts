import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { loadFromEquipment } from '../../core/validation/customExercise';
import { suitsReserveCheck } from '../progression/reserveCheck';
import { plateMath } from '../plateMath/plateMath';
import {
  MACHINES_BOTH_WAYS,
  sameMachine,
  switchMachine,
  loadingFor,
  loadingKeyFor,
  machineOnPlates,
  onPlates,
  type LoadingSpec,
} from './loading';

/**
 * Maintenance 30, the owner's item 30: "a per-machine pin-stack vs plate-loaded switch, starting
 * with a review of which machines come both ways". A machine set to plates here is loaded as a bar
 * is, by its plates, two of each, with its sled not counted.
 */
describe('a machine loaded with plates', () => {
  const press = requireExercise('leg-press-calf-raise');
  const plates: LoadingSpec = { kind: 'plates', perSide: [45, 25, 10, 5, 2.5] };

  it('makes its weights from the plates, two of each, the sled not counted', () => {
    expect(loadingKeyFor(press)).toBe('leg-press-calf-raise');
    const loading = loadingFor({ 'leg-press-calf-raise': plates }, undefined, press, 'lb');
    expect(loading.available?.slice(0, 5)).toEqual([0, 5, 10, 15, 20]);
    expect(loading.available).toContain(140);
    expect(loading.perSide).toEqual([45, 25, 10, 5, 2.5]);
    // It moves as a bar does, by its plates, not by the pins' ten pounds.
    expect(loading.step).toBe(5);
    expect(loading.cap).toBeNull();
    expect(machineOnPlates(press, plates)).toBe(true);
    expect(onPlates(press, plates)).toBe(true);
  });

  it('leaves out a plate missing today', () => {
    const loading = loadingFor(
      { 'leg-press-calf-raise': plates },
      { missingPlates: [2.5] },
      press,
      'lb',
    );
    expect(loading.perSide).toEqual([45, 25, 10, 5]);
    expect(loading.available).not.toContain(5);
    expect(loading.step).toBe(10);
    expect(loading.missingToday).toEqual([2.5]);
  });

  it('stays a pin stack until it is switched, and a bar stays a bar', () => {
    const stack = loadingFor({}, undefined, press, 'lb');
    expect(stack.perSide).toBeNull();
    expect(stack.step).toBe(10);
    expect(onPlates(press, null)).toBe(false);
    const bench = requireExercise('barbell-bench-press');
    expect(onPlates(bench, null)).toBe(true);
    expect(loadingFor({}, undefined, bench, 'lb').available?.[0]).toBe(45);
  });

  it('reads its plates a side, with no bar', () => {
    expect(plateMath(press, 140, 'lb', [45, 25, 10, 5, 2.5], true).line).toBe(
      '45, 25 each side · 140 lb',
    );
    const unmade = plateMath(press, 142, 'lb', [45, 25, 10, 5, 2.5], true);
    expect(unmade.kind).toBe('machine-plates');
    expect(unmade.line).toBe('The plates here make 140 or 145, not 142 lb');
    // Without the switch, a pin.
    expect(plateMath(press, 140, 'lb').line).toBe('Pin the stack at 140 lb');
  });

  it('comes both ways only on the machines the review found that do', () => {
    for (const id of MACHINES_BOTH_WAYS) expect(requireExercise(id).load).toBe('stack');
    for (const id of ['leg-press', 'leg-press-calf-raise', 'hack-squat', 'machine-chest-press']) {
      expect(MACHINES_BOTH_WAYS.has(id)).toBe(true);
    }
    // A cable station and a pec deck come with a stack only.
    for (const id of ['cable-fly', 'cable-curl', 'pec-deck', 'reverse-pec-deck', 'face-pull']) {
      expect(MACHINES_BOTH_WAYS.has(id)).toBe(false);
    }
  });
});

describe('one machine, one switch (the review)', () => {
  it('moves the leg press and the calf raise done on it together, and nothing else', () => {
    expect(sameMachine('leg-press').sort()).toEqual(['leg-press', 'leg-press-calf-raise']);
    expect(sameMachine('leg-press-calf-raise').sort()).toEqual([
      'leg-press',
      'leg-press-calf-raise',
    ]);
    expect(sameMachine('hack-squat')).toEqual(['hack-squat']);
    expect(sameMachine('cable-fly')).toEqual(['cable-fly']);
  });

  it('keeps each stack in its plates record, and puts it back', () => {
    const press: LoadingSpec = { kind: 'stack', ranges: [{ from: 50, to: 500, step: 25 }] };
    const onPlates = switchMachine(
      'leg-press-calf-raise',
      'plates',
      { 'leg-press': press },
      [45, 25],
    );
    expect(onPlates).toEqual({
      'leg-press': { kind: 'plates', perSide: [45, 25], stack: press.ranges },
      'leg-press-calf-raise': { kind: 'plates', perSide: [45, 25] },
    });
    expect(
      switchMachine('leg-press', 'stack', onPlates as Record<string, LoadingSpec>, [45]),
    ).toEqual({
      'leg-press': press,
      'leg-press-calf-raise': null,
    });
    // One already on plates keeps its own plates.
    const own: LoadingSpec = { kind: 'plates', perSide: [45, 10] };
    expect(switchMachine('leg-press', 'plates', { 'leg-press-calf-raise': own }, [45, 25])).toEqual(
      {
        'leg-press': { kind: 'plates', perSide: [45, 25] },
        'leg-press-calf-raise': own,
      },
    );
  });
});

describe('the standing calf raise machine as a machine (the review)', () => {
  it('gives a custom exercise made on it a pin stack, not dumbbells per hand', () => {
    expect(loadFromEquipment([['calf-raise-machine']])).toBe('stack');
  });

  it('is a machine station, as the leg press calf raise is, so it can take the reserve check', () => {
    const machine = requireExercise('standing-calf-raise-machine');
    expect(machine.station).toBe('machine');
    expect(suitsReserveCheck(machine)).toBe(true);
    expect(machine.locationSuitability).toEqual(['gym']);
  });
});
