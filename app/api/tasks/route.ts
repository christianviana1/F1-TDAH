import { getAuthToken } from "@/lib/get-token";
import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/oracle";
import { validateTimeRange, calculateEndTime } from "@/lib/time-utils";
import { validateConflict, type TimeBlock } from "@/lib/conflict-validator";

const XP_MAP: Record<string, number> = {
  SOFT: 100,
  MEDIUM: 200,
  HARD: 300,
};

export async function GET(request: NextRequest) {
  const token = await getAuthToken(request);
  if (!token?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Tenta selecionar os campos avançados; se a migração ainda não rodou (ORA-00904),
  // cai silenciosamente para a query básica.
  let rows: any[];
  let hasAdvancedColumns = true;
  try {
    rows = await query<any>(
      `SELECT id, user_id, title, difficulty, status, created_at,
              scheduled_date, start_time, end_time, estimated_duration,
              rest_time, recurrence_series_id, recurrence_instance_date
       FROM tasks
       WHERE user_id = :b_uid AND status != 'SKIPPED'
       ORDER BY created_at DESC`,
      { b_uid: token.id }
    );
  } catch (err: any) {
    if (err?.errorNum === 904) {
      hasAdvancedColumns = false;
      rows = await query<any>(
        `SELECT id, user_id, title, difficulty, status, created_at
         FROM tasks
         WHERE user_id = :b_uid AND status != 'SKIPPED'
         ORDER BY created_at DESC`,
        { b_uid: token.id }
      );
    } else {
      throw err;
    }
  }

  const tasks = rows.map((r) => ({
    id: r.ID,
    userId: r.USER_ID,
    title: r.TITLE,
    difficulty: r.DIFFICULTY,
    status: r.STATUS,
    createdAt: r.CREATED_AT,
    scheduledDate: hasAdvancedColumns && r.SCHEDULED_DATE
      ? r.SCHEDULED_DATE.toISOString().slice(0, 10)
      : null,
    startTime: hasAdvancedColumns ? (r.START_TIME ?? null) : null,
    endTime: hasAdvancedColumns ? (r.END_TIME ?? null) : null,
    estimatedDuration: hasAdvancedColumns ? (r.ESTIMATED_DURATION ?? null) : null,
    restTime: hasAdvancedColumns ? (r.REST_TIME ?? null) : null,
    recurrenceSeriesId: hasAdvancedColumns ? (r.RECURRENCE_SERIES_ID ?? null) : null,
    recurrenceInstanceDate: hasAdvancedColumns && r.RECURRENCE_INSTANCE_DATE
      ? r.RECURRENCE_INSTANCE_DATE.toISOString().slice(0, 10)
      : null,
  }));

  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  const token = await getAuthToken(request);
  if (!token?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const {
    title,
    difficulty,
    scheduledDate = null,
    startTime = null,
    endTime: bodyEndTime = null,
    estimatedDuration = null,
    restTime = 5,
  } = body;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "Título é obrigatório" }, { status: 400 });
  }

  const validDifficulties = ["SOFT", "MEDIUM", "HARD"];
  const taskDifficulty = validDifficulties.includes(difficulty) ? difficulty : "SOFT";

  // --- Time validation and auto-calculation ---
  let resolvedEndTime: string | null = bodyEndTime;
  let overMidnightWarning = false;

  // Step 1: if both startTime and endTime provided, validate the range
  if (startTime && resolvedEndTime) {
    const validation = validateTimeRange(startTime, resolvedEndTime);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error ?? "Horário de fim deve ser posterior ao horário de início" },
        { status: 400 }
      );
    }
  }

  // Step 2: if startTime + estimatedDuration but no endTime, auto-calculate endTime
  if (startTime && estimatedDuration != null && !resolvedEndTime) {
    const calc = calculateEndTime(startTime, estimatedDuration);
    resolvedEndTime = calc.endTime;
    if (calc.overMidnight) {
      overMidnightWarning = true;
    }
  }

  // Step 3: conflict check — only when scheduledDate + startTime + endTime all present
  if (scheduledDate && startTime && resolvedEndTime) {
    try {
      const existingRows = await query<any>(
        `SELECT id, title, start_time, end_time, rest_time, status
         FROM tasks
         WHERE user_id = :b_uid AND scheduled_date = TO_DATE(:b_date, 'YYYY-MM-DD')
           AND start_time IS NOT NULL AND end_time IS NOT NULL
           AND status IN ('GARAGE', 'COMPLETED')`,
        { b_uid: token.id, b_date: scheduledDate }
      );
      const existingBlocks: TimeBlock[] = existingRows.map((r: any) => ({
        taskId: r.ID, title: r.TITLE, startTime: r.START_TIME,
        endTime: r.END_TIME, restTime: r.REST_TIME ?? 5,
        status: r.STATUS as "GARAGE" | "COMPLETED",
      }));
      const conflict = validateConflict(
        { startTime, endTime: resolvedEndTime, restTime: restTime ?? 5 },
        existingBlocks
      );
      if (conflict.hasConflict) {
        return NextResponse.json({ error: conflict.message }, { status: 409 });
      }
    } catch (err: any) {
      if (err?.errorNum !== 904) throw err;
      // Advanced columns missing — skip conflict check
    }
  }

  // --- Insert ---
  const id = crypto.randomUUID();

  let insertedFull = false;
  try {
    await execute(
      `INSERT INTO tasks (id, user_id, title, difficulty, status,
          scheduled_date, start_time, end_time, estimated_duration, rest_time)
       VALUES (:b_id, :b_uid, :b_title, :b_diff, 'GARAGE',
          ${scheduledDate ? "TO_DATE(:b_date, 'YYYY-MM-DD')" : "NULL"},
          :b_st, :b_et, :b_dur, :b_rest)`,
      {
        b_id: id, b_uid: token.id, b_title: title.trim(), b_diff: taskDifficulty,
        ...(scheduledDate ? { b_date: scheduledDate } : {}),
        b_st: startTime ?? null, b_et: resolvedEndTime ?? null,
        b_dur: estimatedDuration ?? null, b_rest: restTime ?? 5,
      }
    );
    insertedFull = true;
  } catch (err: any) {
    if (err?.errorNum !== 904) throw err;
    await execute(
      `INSERT INTO tasks (id, user_id, title, difficulty, status) VALUES (:b_id, :b_uid, :b_title, :b_diff, 'GARAGE')`,
      { b_id: id, b_uid: token.id, b_title: title.trim(), b_diff: taskDifficulty }
    );
  }

  let fetchRows: any[];
  if (insertedFull) {
    fetchRows = await query<any>(
      `SELECT id, user_id, title, difficulty, status, created_at,
              scheduled_date, start_time, end_time, estimated_duration, rest_time
       FROM tasks WHERE id = :b_id`,
      { b_id: id }
    );
  } else {
    fetchRows = await query<any>(
      `SELECT id, user_id, title, difficulty, status, created_at FROM tasks WHERE id = :b_id`,
      { b_id: id }
    );
  }
  const r = fetchRows[0];

  const responseBody: Record<string, unknown> = {
    id: r.ID,
    userId: r.USER_ID,
    title: r.TITLE,
    difficulty: r.DIFFICULTY,
    status: r.STATUS,
    createdAt: r.CREATED_AT,
    scheduledDate: r.SCHEDULED_DATE
      ? r.SCHEDULED_DATE.toISOString().slice(0, 10)
      : null,
    startTime: r.START_TIME ?? null,
    endTime: r.END_TIME ?? null,
    estimatedDuration: r.ESTIMATED_DURATION ?? null,
    restTime: r.REST_TIME ?? null,
  };

  if (overMidnightWarning) {
    responseBody.warning = "A tarefa ultrapassa meia-noite";
  }

  return NextResponse.json(responseBody, { status: 201 });
}
