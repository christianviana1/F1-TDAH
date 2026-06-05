/**
 * Time utility functions for F1 Task Manager.
 * All functions operate on 'HH:MM' strings and minutes since midnight.
 *
 * Feature: f1-advanced-features
 * Requirements: 2.2, 2.3, 2.4
 */

/**
 * Converts a time string in 'HH:MM' format to total minutes since midnight.
 * e.g. '09:30' → 570
 */
export function parseTimeToMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Converts minutes since midnight back to a 'HH:MM' string.
 * e.g. 570 → '09:30'
 * Values >= 1440 are wrapped with modulo (overflow handling is the caller's responsibility).
 */
export function minutesToTime(minutes: number): string {
  const totalMinutes = minutes % 1440;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Calculates the duration in minutes between two 'HH:MM' times.
 * Returns endMinutes - startMinutes (can be negative if end <= start, callers should validate first).
 *
 * Validates: Requirements 2.2
 */
export function calculateDuration(startHHMM: string, endHHMM: string): number {
  return parseTimeToMinutes(endHHMM) - parseTimeToMinutes(startHHMM);
}

/**
 * Calculates the end time given a start time and a duration in minutes.
 * Returns the end time as 'HH:MM' and a flag indicating whether the result
 * exceeds midnight (i.e. startMinutes + durationMinutes > 1440).
 *
 * Validates: Requirements 2.4
 */
export function calculateEndTime(
  startHHMM: string,
  durationMinutes: number
): { endTime: string; overMidnight: boolean } {
  const startMinutes = parseTimeToMinutes(startHHMM);
  const total = startMinutes + durationMinutes;
  const overMidnight = total > 1440;
  return {
    endTime: minutesToTime(total),
    overMidnight,
  };
}

/**
 * Validates that endTime is strictly after startTime.
 * Returns `{ valid: true }` when end > start.
 * Returns `{ valid: false, error: '...' }` when end <= start.
 *
 * Validates: Requirements 2.3
 */
export function validateTimeRange(
  startHHMM: string,
  endHHMM: string
): { valid: boolean; error?: string } {
  const startMinutes = parseTimeToMinutes(startHHMM);
  const endMinutes = parseTimeToMinutes(endHHMM);

  if (endMinutes <= startMinutes) {
    return {
      valid: false,
      error: 'Horário de fim deve ser posterior ao horário de início',
    };
  }

  return { valid: true };
}
