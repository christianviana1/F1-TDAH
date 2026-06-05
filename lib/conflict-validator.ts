/**
 * Conflict Validator for F1 Task Manager.
 * Pure function — no database or HTTP dependencies.
 *
 * Feature: f1-advanced-features
 * Requirements: 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { parseTimeToMinutes, minutesToTime } from './time-utils';

export interface TimeBlock {
  taskId: string;
  title: string;
  startTime: string;  // 'HH:MM'
  endTime: string;    // 'HH:MM'
  restTime: number;   // minutes
  status: 'GARAGE' | 'COMPLETED';
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictingTask?: {
    title: string;
    startTime: string;
    endTime: string;
  };
  nextAvailableTime?: string;  // 'HH:MM'
  message?: string;
}

/**
 * Validates whether a new time block conflicts with any existing blocks.
 *
 * A conflict exists when:
 *   newStart < (existEnd + restTime)  AND  newEnd > existStart
 * (all values in minutes since midnight)
 *
 * Only existing blocks with status 'GARAGE' or 'COMPLETED' that have both
 * startTime and endTime defined are considered.
 *
 * Returns the first conflict found, along with the next available time
 * calculated as the maximum of (existEnd + restTime) across all conflicts.
 *
 * Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6
 */
export function validateConflict(
  newBlock: Omit<TimeBlock, 'taskId' | 'title' | 'status'>,
  existingBlocks: TimeBlock[]
): ConflictResult {
  const newStart = parseTimeToMinutes(newBlock.startTime);
  const newEnd = parseTimeToMinutes(newBlock.endTime);

  // Step 1: Filter to candidates — only GARAGE/COMPLETED with both times defined (Req 3.5, 3.6)
  const candidates = existingBlocks.filter(
    (b) =>
      (b.status === 'GARAGE' || b.status === 'COMPLETED') &&
      b.startTime != null &&
      b.startTime !== '' &&
      b.endTime != null &&
      b.endTime !== ''
  );

  // Step 2: Find all conflicting blocks
  const conflicts: Array<{ block: TimeBlock; clearTime: number }> = [];

  for (const block of candidates) {
    const existStart = parseTimeToMinutes(block.startTime);
    const existEnd = parseTimeToMinutes(block.endTime);
    const clearTime = existEnd + block.restTime; // end of rest period

    // Overlap condition (Req 3.2, 3.3, 3.4)
    if (newStart < clearTime && newEnd > existStart) {
      conflicts.push({ block, clearTime });
    }
  }

  if (conflicts.length === 0) {
    return { hasConflict: false };
  }

  // Step 3: Determine nextAvailableTime = max(existEnd + restTime) across all conflicts
  const maxClearTime = Math.max(...conflicts.map((c) => c.clearTime));
  const nextAvailableTime = minutesToTime(maxClearTime);

  // Step 4: Use the first conflict found for the message (deterministic: first candidate that conflicts)
  const first = conflicts[0].block;

  const message =
    `Conflito com '${first.title}' (${first.startTime}–${first.endTime}). ` +
    `Próximo horário disponível: ${nextAvailableTime}.`;

  return {
    hasConflict: true,
    conflictingTask: {
      title: first.title,
      startTime: first.startTime,
      endTime: first.endTime,
    },
    nextAvailableTime,
    message,
  };
}
