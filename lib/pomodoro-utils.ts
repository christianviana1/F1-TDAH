// Feature: f1-advanced-features
// Pomodoro utilities — pure functions for initializing Pomodoro from task data.

export interface PomodoroConfig {
  focusMinutes: number;
  restMinutes: number;
}

export interface TaskWithTiming {
  estimatedDuration: number | null; // minutes
  restTime: number | null;          // minutes
}

/**
 * Initializes a PomodoroConfig from a task's timing fields.
 * - focusMinutes = task.estimatedDuration ?? 25  (Requirement 2.6, 2.8)
 * - restMinutes  = task.restTime ?? 5            (Requirement 2.6)
 */
export function initPomodoroFromTask(task: TaskWithTiming): PomodoroConfig {
  return {
    focusMinutes: task.estimatedDuration ?? 25,
    restMinutes: task.restTime ?? 5,
  };
}
