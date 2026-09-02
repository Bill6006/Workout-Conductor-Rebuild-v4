/**
 * Equipment model (Phase 1 foundation). Phase 2 extends this with the full
 * structured exercise catalog; the ids here are stable and referenced by
 * LocationProfile.equipment.
 */

export const EQUIPMENT_CATEGORIES = [
  'free-weights',
  'benches-racks',
  'cables',
  'machines',
  'bodyweight',
  'bands-tools',
] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

export interface EquipmentItem {
  readonly id: string;
  readonly name: string;
  readonly category: EquipmentCategory;
}

export const EQUIPMENT: readonly EquipmentItem[] = [
  { id: 'barbell', name: 'Barbell + plates', category: 'free-weights' },
  { id: 'ez-bar', name: 'EZ curl bar', category: 'free-weights' },
  { id: 'trap-bar', name: 'Trap bar', category: 'free-weights' },
  { id: 'dumbbells', name: 'Dumbbells (full rack)', category: 'free-weights' },
  { id: 'adjustable-dumbbells', name: 'Adjustable dumbbells', category: 'free-weights' },
  { id: 'kettlebells', name: 'Kettlebells', category: 'free-weights' },
  { id: 'flat-bench', name: 'Flat bench', category: 'benches-racks' },
  { id: 'adjustable-bench', name: 'Adjustable bench', category: 'benches-racks' },
  { id: 'squat-rack', name: 'Squat rack / power rack', category: 'benches-racks' },
  { id: 'smith-machine', name: 'Smith machine', category: 'benches-racks' },
  { id: 'cable-station', name: 'Cable station', category: 'cables' },
  { id: 'functional-trainer', name: 'Dual cable / functional trainer', category: 'cables' },
  { id: 'lat-pulldown', name: 'Lat pulldown', category: 'cables' },
  { id: 'seated-row', name: 'Seated cable row', category: 'cables' },
  { id: 'chest-press-machine', name: 'Chest press machine', category: 'machines' },
  { id: 'shoulder-press-machine', name: 'Shoulder press machine', category: 'machines' },
  { id: 'pec-deck', name: 'Pec deck / rear delt fly', category: 'machines' },
  { id: 'leg-press', name: 'Leg press', category: 'machines' },
  { id: 'hack-squat', name: 'Hack squat', category: 'machines' },
  { id: 'leg-extension', name: 'Leg extension', category: 'machines' },
  { id: 'leg-curl', name: 'Leg curl', category: 'machines' },
  { id: 'preacher-curl-machine', name: 'Preacher curl bench / machine', category: 'machines' },
  { id: 'pull-up-bar', name: 'Pull-up bar', category: 'bodyweight' },
  { id: 'dip-station', name: 'Dip station', category: 'bodyweight' },
  { id: 'suspension-trainer', name: 'Suspension trainer', category: 'bodyweight' },
  { id: 'resistance-bands', name: 'Resistance bands', category: 'bands-tools' },
  { id: 'ab-wheel', name: 'Ab wheel', category: 'bands-tools' },
  { id: 'weight-vest', name: 'Weight vest', category: 'bands-tools' },
];

const EQUIPMENT_BY_ID: ReadonlyMap<string, EquipmentItem> = new Map(
  EQUIPMENT.map((item) => [item.id, item]),
);

export const ALL_EQUIPMENT_IDS: readonly string[] = EQUIPMENT.map((item) => item.id);

/** A typical commercial gym. */
export const GYM_DEFAULT_EQUIPMENT: readonly string[] = ALL_EQUIPMENT_IDS.filter(
  (id) => !['weight-vest', 'suspension-trainer'].includes(id),
);

/** A common home setup. */
export const HOME_DEFAULT_EQUIPMENT: readonly string[] = [
  'adjustable-dumbbells',
  'adjustable-bench',
  'pull-up-bar',
  'resistance-bands',
];

/** Hotel gym or on the road. */
export const TRAVEL_DEFAULT_EQUIPMENT: readonly string[] = [
  'dumbbells',
  'adjustable-bench',
  'resistance-bands',
];

export function isEquipmentId(id: string): boolean {
  return EQUIPMENT_BY_ID.has(id);
}

export function equipmentLabel(id: string): string {
  return EQUIPMENT_BY_ID.get(id)?.name ?? id;
}

/** Drops unknown ids and duplicates, keeping catalog order. */
export function normalizeEquipment(ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  return ALL_EQUIPMENT_IDS.filter((id) => wanted.has(id));
}

export function equipmentByCategory(): ReadonlyMap<EquipmentCategory, EquipmentItem[]> {
  const grouped = new Map<EquipmentCategory, EquipmentItem[]>();
  for (const category of EQUIPMENT_CATEGORIES) {
    grouped.set(
      category,
      EQUIPMENT.filter((item) => item.category === category),
    );
  }
  return grouped;
}

export const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  'free-weights': 'Free weights',
  'benches-racks': 'Benches and racks',
  cables: 'Cables',
  machines: 'Machines',
  bodyweight: 'Bodyweight stations',
  'bands-tools': 'Bands and tools',
};
