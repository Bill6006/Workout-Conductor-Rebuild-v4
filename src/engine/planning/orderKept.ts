import { localDayKey } from '../../core/time/localDate';
import { WEEKDAYS, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { SplitOrder } from '../workout/types';

/** A copy of the split's order, every list its own. */
export function copyOrder(order: SplitOrder): SplitOrder {
  return {
    ...order,
    days: order.days.map((day) => ({ ...day })),
    spared: [...order.spared],
    fewer: [...order.fewer],
  };
}

/**
 * The schedule an order is read for: the days ticked and the sessions a week (Maintenance 38, the
 * re-check of its review). A save of other days ends the order held: its days were another week's.
 */
export function scheduleOf(profile: UserProfile): string {
  const days = WEEKDAYS.filter((day) => profile.schedule.availableDays.includes(day));
  return `${days.join(',')}/${profile.schedule.weeklyFrequency}`;
}

/**
 * A record of a day of the split's order, trained or planned with the session the order gives the
 * day, keeps the order (Maintenance 38): its week is held (`heldOrder`), and read by the rotation in
 * its own days (`inRotationPlace`). Every reading of the week ahead keeps it so, as the workouts
 * trained in it do (the re-check: the week model's days after the order planned as if they had not
 * been). Any other record keeps none.
 */
export function keepingOrder<T extends WorkoutRecord>(
  record: T,
  order: SplitOrder | null | undefined,
): T {
  const own = order?.days.find((day) => day.day === localDayKey(record.startedAt));
  if (!order || !own || own.templateId !== record.templateId) return record;
  return { ...record, splitOrder: copyOrder(order) };
}
