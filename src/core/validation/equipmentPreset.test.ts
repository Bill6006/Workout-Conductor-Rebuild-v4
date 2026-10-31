import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_PRESETS,
  PRESET_ID_PREFIX,
  parseEquipmentPreset,
  presetNameProblem,
  sortPresets,
  type EquipmentPreset,
} from './equipmentPreset';

/**
 * Custom equipment presets as stored (the owner, 2026-10-31): a name and equipment, a record each;
 * Home and Full gym built in, their names never taken; a name never two presets'. Synthetic data.
 */

const AT = '2026-10-31T12:00:00.000Z';
const preset = (id: string, name: string, equipment: string[] = ['barbell']): EquipmentPreset => ({
  id: `${PRESET_ID_PREFIX}${id}`,
  name,
  equipment,
  createdAt: AT,
  updatedAt: AT,
});

describe('a preset as stored', () => {
  it('reads with its name and equipment, and keeps what a newer copy adds', () => {
    expect(parseEquipmentPreset({ ...preset('a', 'Hotel gym'), later: 1 })).toMatchObject({
      name: 'Hotel gym',
      equipment: ['barbell'],
      later: 1,
    });
  });

  it('is none where it does not read: not a preset id, no name, or a name too long', () => {
    expect(parseEquipmentPreset({ ...preset('a', 'Gym'), id: 'coach-switches' })).toBeNull();
    expect(parseEquipmentPreset({ ...preset('a', '') })).toBeNull();
    expect(parseEquipmentPreset({ ...preset('a', 'x'.repeat(41)) })).toBeNull();
  });
});

describe('a preset’s name', () => {
  const own = [preset('a', 'Hotel gym'), preset('b', 'Work gym')];

  it('is needed, and kept to a place’s length', () => {
    expect(presetNameProblem('  ', own)).toBe('Name the preset.');
    expect(presetNameProblem('x'.repeat(41), own)).toBe('Keep the name to 40 characters.');
    expect(presetNameProblem('Apartment gym', own)).toBeNull();
  });

  it('is never a built-in’s, with or without “preset”, case aside', () => {
    expect(BUILT_IN_PRESETS.map((item) => item.name)).toEqual(['Full gym', 'Home']);
    expect(presetNameProblem('home', own)).toBe('Home is built in; choose another name.');
    expect(presetNameProblem('Full Gym Preset', own)).toBe(
      'Full gym is built in; choose another name.',
    );
  });

  it('is never another preset’s, but a preset keeps its own', () => {
    expect(presetNameProblem(' work GYM ', own)).toBe('A preset already has that name.');
    expect(presetNameProblem('Work gym', own, `${PRESET_ID_PREFIX}b`)).toBeNull();
  });
});

describe('the presets shown', () => {
  it('are in the order of their names', () => {
    const shown = sortPresets([
      preset('a', 'work gym'),
      preset('b', 'Apartment'),
      preset('c', 'Hotel'),
    ]);
    expect(shown.map((item) => item.name)).toEqual(['Apartment', 'Hotel', 'work gym']);
  });
});
