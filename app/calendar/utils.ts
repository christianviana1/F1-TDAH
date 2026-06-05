// Calendar utility functions for F1 Task Manager
// Feature: f1-advanced-features — Calendar module (Requirements 1.1, 1.4)

export interface CalendarTask {
  id: string;
  title: string;
  difficulty: 'SOFT' | 'MEDIUM' | 'HARD';
  status: string;
  scheduledDate: string | null;   // 'YYYY-MM-DD'
  startTime: string | null;       // 'HH:MM'
  endTime: string | null;         // 'HH:MM'
  recurrenceSeriesId: string | null;
}

/**
 * Groups tasks by their scheduledDate.
 * Tasks without a date (scheduledDate === null) are ignored.
 *
 * @param tasks - Array of CalendarTask to group
 * @returns Record where key is 'YYYY-MM-DD' and value is the array of tasks for that day
 *
 * Validates: Requirement 1.1
 */
export function groupTasksByDay(
  tasks: CalendarTask[]
): Record<string, CalendarTask[]> {
  const result: Record<string, CalendarTask[]> = {};

  for (const task of tasks) {
    if (task.scheduledDate === null) {
      continue;
    }
    const key = task.scheduledDate;
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(task);
  }

  return result;
}

/**
 * Returns the first 3 tasks as visible and the overflow count.
 *
 * visible.length  = min(tasks.length, 3)
 * overflowCount   = max(0, tasks.length - 3)
 *
 * @param tasks - Array of tasks for a single day
 * @returns Object with `visible` array and `overflowCount` number
 *
 * Validates: Requirement 1.4
 */
export function getOverflowDisplay(
  tasks: CalendarTask[]
): { visible: CalendarTask[]; overflowCount: number } {
  const VISIBLE_LIMIT = 3;
  return {
    visible: tasks.slice(0, VISIBLE_LIMIT),
    overflowCount: Math.max(0, tasks.length - VISIBLE_LIMIT),
  };
}

/**
 * Returns the start (Monday) and end (Sunday) dates of an ISO week.
 *
 * ISO 8601 week numbering:
 *   - Weeks start on Monday
 *   - Week 1 is the week containing the first Thursday of the year
 *
 * @param year    - Full year (e.g. 2025)
 * @param isoWeek - ISO week number (1–53)
 * @returns Object with `start` (Monday) and `end` (Sunday) as Date objects
 *          with time set to 00:00:00 local time
 *
 * Validates: Requirement 1.2 (calendar week navigation)
 */
export function getCalendarWeekRange(
  year: number,
  isoWeek: number
): { start: Date; end: Date } {
  // Find the Thursday of the given ISO week, which always lies in the
  // correct ISO year. From that Thursday we can derive Monday (−3 days)
  // and Sunday (+3 days).

  // January 4th is always in ISO week 1, per the ISO 8601 standard.
  const jan4 = new Date(year, 0, 4);
  // Day-of-week for Jan 4 (0=Sun … 6=Sat) → shift so Mon=0 … Sun=6
  const jan4DayMon = (jan4.getDay() + 6) % 7;

  // Monday of ISO week 1
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - jan4DayMon);

  // Monday of the requested ISO week
  const monday = new Date(week1Monday);
  monday.setDate(week1Monday.getDate() + (isoWeek - 1) * 7);
  monday.setHours(0, 0, 0, 0);

  // Sunday of the requested ISO week
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(0, 0, 0, 0);

  return { start: monday, end: sunday };
}
