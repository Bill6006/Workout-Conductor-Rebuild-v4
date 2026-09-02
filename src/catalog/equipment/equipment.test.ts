import { describe, expect, it } from 'vitest';
import {
  ALL_EQUIPMENT_IDS,
  EQUIPMENT,
  GYM_DEFAULT_EQUIPMENT,
  HOME_DEFAULT_EQUIPMENT,
  TRAVEL_DEFAULT_EQUIPMENT,
  equipmentLabel,
  normalizeEquipment,
} from './equipment';

describe('equipment catalog', () => {
  it('has unique ids and every preset uses known ids', () => {
    expect(new Set(ALL_EQUIPMENT_IDS).size).toBe(EQUIPMENT.length);
    for (const preset of [
      GYM_DEFAULT_EQUIPMENT,
      HOME_DEFAULT_EQUIPMENT,
      TRAVEL_DEFAULT_EQUIPMENT,
    ]) {
      for (const id of preset) expect(ALL_EQUIPMENT_IDS).toContain(id);
    }
  });

  it('normalizes to catalog order without unknowns or duplicates', () => {
    expect(normalizeEquipment(['pull-up-bar', 'barbell', 'barbell', 'jetpack'])).toEqual([
      'barbell',
      'pull-up-bar',
    ]);
  });

  it('labels known ids and echoes unknown ones', () => {
    expect(equipmentLabel('barbell')).toBe('Barbell + plates');
    expect(equipmentLabel('mystery')).toBe('mystery');
  });
});
