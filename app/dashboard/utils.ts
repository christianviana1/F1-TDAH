// Dashboard utility functions for F1 Task Manager
// Feature: f1-advanced-features — Dashboard card rendering (Requirements 2.9, 4.9)

/**
 * Minimal task shape required for card rendering helpers.
 * Matches the subset of fields used by task card components.
 */
export interface TaskCardData {
  startTime?: string | null;
  endTime?: string | null;
  estimatedDuration?: number | null;
  recurrenceSeriesId?: string | null;
}

/**
 * Returns whether the task has displayable time information and, when it does,
 * a formatted display string.
 *
 * Rules:
 * - hasTime: true  iff startTime OR estimatedDuration is non-null
 * - display when both startTime and endTime are present: "HH:MM–HH:MM (D min)"
 *   (duration portion is omitted when estimatedDuration is null)
 * - display when only startTime is present (no endTime): "HH:MM"
 * - display when only estimatedDuration is present (no startTime): "D min"
 * - display when hasTime is false: null
 *
 * Validates: Requirements 2.9
 */
export function getTaskTimeInfo(
  task: TaskCardData
): { hasTime: boolean; display: string | null } {
  const hasStart = task.startTime != null;
  const hasDuration = task.estimatedDuration != null;

  if (!hasStart && !hasDuration) {
    return { hasTime: false, display: null };
  }

  let display: string;

  if (hasStart && task.endTime != null) {
    // Both start and end present — build "HH:MM–HH:MM" with optional duration
    const range = `${task.startTime}–${task.endTime}`;
    display = hasDuration
      ? `${range} (${task.estimatedDuration} min)`
      : range;
  } else if (hasStart) {
    // Only start time — show time alone; append duration if available
    display = hasDuration
      ? `${task.startTime} (${task.estimatedDuration} min)`
      : task.startTime!;
  } else {
    // Only duration
    display = `${task.estimatedDuration} min`;
  }

  return { hasTime: true, display };
}

/**
 * Returns true if and only if the task belongs to a recurrence series,
 * i.e. recurrenceSeriesId is a non-null, non-empty string.
 *
 * Validates: Requirements 4.9
 */
export function hasRecurrenceIcon(task: TaskCardData): boolean {
  return typeof task.recurrenceSeriesId === 'string' &&
    task.recurrenceSeriesId.length > 0;
}
