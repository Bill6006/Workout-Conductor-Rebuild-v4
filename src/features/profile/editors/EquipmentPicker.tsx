import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CATEGORY_LABELS,
  GYM_DEFAULT_EQUIPMENT,
  HOME_DEFAULT_EQUIPMENT,
  equipmentByCategory,
  normalizeEquipment,
} from '../../../catalog/equipment/equipment';
import { ChipSelect } from '../../../components/Form/ChipSelect';
import styles from './editors.module.css';

interface EquipmentPickerProps {
  values: readonly string[];
  onChange: (values: string[]) => void;
  label: string;
}

/** Grouped equipment chips with quick presets; shared by onboarding, Settings, and Plan. */
export function EquipmentPicker({ values, onChange, label }: EquipmentPickerProps) {
  const grouped = equipmentByCategory();
  const selected = new Set(values);

  function setCategory(categoryIds: readonly string[], next: string[]) {
    const outside = values.filter((id) => !categoryIds.includes(id));
    onChange(normalizeEquipment([...outside, ...next]));
  }

  return (
    <div className={styles.stack}>
      <div className={styles.inline}>
        <span className={styles.count}>{values.length} selected</span>
        <button
          type="button"
          className={styles.preset}
          onClick={() => onChange([...GYM_DEFAULT_EQUIPMENT])}
        >
          Full gym preset
        </button>
        <button
          type="button"
          className={styles.preset}
          onClick={() => onChange([...HOME_DEFAULT_EQUIPMENT])}
        >
          Home preset
        </button>
        <button type="button" className={styles.preset} onClick={() => onChange([])}>
          Clear
        </button>
      </div>
      {EQUIPMENT_CATEGORIES.map((category) => {
        const items = grouped.get(category) ?? [];
        const ids = items.map((item) => item.id);
        return (
          <div key={category} className={styles.group}>
            <p className={styles.groupTitle}>{EQUIPMENT_CATEGORY_LABELS[category]}</p>
            <ChipSelect
              label={`${label}: ${EQUIPMENT_CATEGORY_LABELS[category]}`}
              values={ids.filter((id) => selected.has(id))}
              options={items.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(next) => setCategory(ids, next)}
            />
          </div>
        );
      })}
    </div>
  );
}
