import { z } from 'zod';
import { GYM_DEFAULT_EQUIPMENT, HOME_DEFAULT_EQUIPMENT } from '../../catalog/equipment/equipment';
import { LocationProfileSchema } from './location';

/**
 * Custom equipment presets (the owner, 2026-10-31: "Let me create unlimited custom reusable
 * equipment presets. I can name a preset and choose any combination of supported equipment ... A
 * preset is a TEMPLATE, not a live link to places. Applying a preset copies its equipment
 * configuration into that place."). Each is one record in the meta store, copied to the cloud and
 * kept in backups like every meta record, so a preset made on one device and another made offline
 * on a second both stay. A preset holds a name and equipment only: what a place can load (its
 * weights, a machine's pin stack or plates, a machine that serves two lifts) stays the place's own.
 */

export const PRESET_ID_PREFIX = 'equipment-preset:';

export const EquipmentPresetSchema = z.looseObject({
  id: z.string().startsWith(PRESET_ID_PREFIX).max(80),
  /** Named as a place is: the same length. */
  name: LocationProfileSchema.shape.name,
  /** Equipment as a place keeps it. */
  equipment: LocationProfileSchema.shape.equipment,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type EquipmentPreset = z.infer<typeof EquipmentPresetSchema>;

/** The built-in presets: always there, never renamed or deleted (the owner: "protected"). */
export const BUILT_IN_PRESETS: readonly { name: string; equipment: readonly string[] }[] = [
  { name: 'Full gym', equipment: GYM_DEFAULT_EQUIPMENT },
  { name: 'Home', equipment: HOME_DEFAULT_EQUIPMENT },
];

export function isPresetId(id: unknown): id is string {
  return typeof id === 'string' && id.startsWith(PRESET_ID_PREFIX);
}

/** A preset as stored; one that does not read is none, and is never written over. */
export function parseEquipmentPreset(raw: unknown): EquipmentPreset | null {
  const result = EquipmentPresetSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** The presets in the order they are shown: by name, as a person reads them. */
export function sortPresets(presets: readonly EquipmentPreset[]): EquipmentPreset[] {
  return [...presets].sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id),
  );
}

const sameName = (a: string, b: string) =>
  a.trim().localeCompare(b.trim(), undefined, { sensitivity: 'base' }) === 0;

/**
 * Why a name cannot be a preset's, or null where it can: none, too long, a built-in's (with or
 * without "preset"), or another custom preset's, case aside. `editing` is the preset being renamed,
 * whose own name is free to keep.
 */
export function presetNameProblem(
  name: string,
  presets: readonly EquipmentPreset[],
  editing: string | null = null,
): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Name the preset.';
  if (!LocationProfileSchema.shape.name.safeParse(trimmed).success) {
    return 'Keep the name to 40 characters.';
  }
  const builtIn = BUILT_IN_PRESETS.find(
    (preset) => sameName(trimmed, preset.name) || sameName(trimmed, `${preset.name} preset`),
  );
  if (builtIn) return `${builtIn.name} is built in; choose another name.`;
  if (presets.some((preset) => preset.id !== editing && sameName(preset.name, trimmed))) {
    return 'A preset already has that name.';
  }
  return null;
}
