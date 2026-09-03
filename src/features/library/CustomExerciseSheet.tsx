import { useState } from 'react';
import { EQUIPMENT } from '../../catalog/equipment/equipment';
import { MUSCLE_IDS, muscleName, type MuscleId } from '../../catalog/muscles/muscles';
import {
  MOVEMENT_PATTERN_IDS,
  movementPatternName,
  type MovementPatternId,
} from '../../catalog/movementPatterns/movementPatterns';
import { Button } from '../../components/Button/Button';
import formStyles from '../../components/Form/Form.module.css';
import { Sheet } from '../../components/Sheet/Sheet';
import { useToast } from '../../components/Toast/useToast';
import { CUSTOM_MEDIA_MAX_BYTES } from '../../core/validation/customExercise';
import { useAppStore } from '../../core/state/useAppStore';
import styles from './LibraryScreen.module.css';

interface CustomExerciseSheetProps {
  open: boolean;
  onClose: () => void;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * A compact creator for user-owned exercises: name, muscles, pattern,
 * equipment, and an optional photo or short video kept as user media. The
 * new exercise resolves everywhere a catalog exercise does.
 */
export function CustomExerciseSheet({ open, onClose }: CustomExerciseSheetProps) {
  const store = useAppStore();
  const toast = useToast();
  const [name, setName] = useState('');
  const [primary, setPrimary] = useState<MuscleId>('chest');
  const [pattern, setPattern] = useState<MovementPatternId>('horizontal-push');
  const [equipment, setEquipment] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName('');
    setEquipment([]);
    setFile(null);
  };

  const save = async () => {
    if (name.trim().length < 2) {
      toast.show('Give the exercise a name', 'error');
      return;
    }
    if (file && file.size > CUSTOM_MEDIA_MAX_BYTES) {
      toast.show('Media must be 3 MB or smaller', 'error');
      return;
    }
    setSaving(true);
    try {
      const created = await store.addCustomExercise({
        name,
        primaryMuscles: [primary],
        movementPattern: pattern,
        equipment: [equipment],
      });
      if (file) {
        await store.addCustomMedia(created.id, {
          kind: file.type.startsWith('video/') ? 'video' : 'image',
          mimeType: file.type || 'image/jpeg',
          sizeBytes: file.size,
          dataUrl: await readAsDataUrl(file),
        });
      }
      toast.show(`${created.name} added to your library`, 'success');
      reset();
      onClose();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      title="Add a custom exercise"
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          onClick={() => void save()}
          disabled={saving}
          data-testid="save-custom-exercise"
        >
          {saving ? 'Saving…' : 'Save exercise'}
        </Button>
      }
    >
      <label className={formStyles.label} htmlFor="custom-name">
        Name
      </label>
      <input
        id="custom-name"
        className={formStyles.input}
        value={name}
        maxLength={60}
        placeholder="Landmine press"
        onChange={(event) => setName(event.target.value)}
      />
      <label className={formStyles.label} htmlFor="custom-muscle">
        Primary muscle
      </label>
      <select
        id="custom-muscle"
        className={formStyles.input}
        value={primary}
        onChange={(event) => setPrimary(event.target.value as MuscleId)}
      >
        {MUSCLE_IDS.map((muscle) => (
          <option key={muscle} value={muscle}>
            {muscleName(muscle)}
          </option>
        ))}
      </select>
      <label className={formStyles.label} htmlFor="custom-pattern">
        Movement pattern
      </label>
      <select
        id="custom-pattern"
        className={formStyles.input}
        value={pattern}
        onChange={(event) => setPattern(event.target.value as MovementPatternId)}
      >
        {MOVEMENT_PATTERN_IDS.map((id) => (
          <option key={id} value={id}>
            {movementPatternName(id)}
          </option>
        ))}
      </select>
      <p className={formStyles.label}>Equipment (leave empty for bodyweight)</p>
      <div className={styles.chipRow} role="group" aria-label="Equipment">
        {EQUIPMENT.map((item) => {
          const on = equipment.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={styles.chip}
              aria-pressed={on}
              onClick={() =>
                setEquipment((current) =>
                  on ? current.filter((id) => id !== item.id) : [...current, item.id],
                )
              }
            >
              {item.name}
            </button>
          );
        })}
      </div>
      <label className={formStyles.label} htmlFor="custom-media">
        Your photo or short video (optional, up to 3 MB, stays on this device)
      </label>
      <input
        id="custom-media"
        className={formStyles.input}
        type="file"
        accept="image/*,video/*"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
    </Sheet>
  );
}
