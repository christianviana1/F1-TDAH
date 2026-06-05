import { getAuthToken } from "@/lib/get-token";
import { NextRequest, NextResponse } from "next/server";
import oracledb from "oracledb";
import { query, execute, getPool } from "@/lib/oracle";
import { validateTimeRange } from "@/lib/time-utils";
import { validateConflict, TimeBlock } from "@/lib/conflict-validator";
import { creditXpBoth } from "@/lib/xp-wallet";

const XP_MAP: Record<string, number> = {
  SOFT: 100,
  MEDIUM: 200,
  HARD: 300,
};

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const token = await getAuthToken(request);
  if (!token?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await props.params;

  let rows: any[];
  try {
    rows = await query<any>(
      `SELECT id, user_id, title, difficulty, status, created_at,
              scheduled_date, start_time, end_time, estimated_duration,
              rest_time, recurrence_series_id, recurrence_instance_date
       FROM tasks WHERE id = :b_id`,
      { b_id: id }
    );
  } catch (err: any) {
    if (err?.errorNum !== 904) throw err;
    rows = await query<any>(
      `SELECT id, user_id, title, difficulty, status, created_at FROM tasks WHERE id = :b_id`,
      { b_id: id }
    );
  }

  if (!rows.length || rows[0].USER_ID !== token.id) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }

  const r = rows[0];
  return NextResponse.json({
    id: r.ID, userId: r.USER_ID, title: r.TITLE, difficulty: r.DIFFICULTY,
    status: r.STATUS, createdAt: r.CREATED_AT,
    scheduledDate: r.SCHEDULED_DATE ? r.SCHEDULED_DATE.toISOString().slice(0, 10) : null,
    startTime: r.START_TIME ?? null, endTime: r.END_TIME ?? null,
    estimatedDuration: r.ESTIMATED_DURATION ?? null, restTime: r.REST_TIME ?? null,
    recurrenceSeriesId: r.RECURRENCE_SERIES_ID ?? null,
    recurrenceInstanceDate: r.RECURRENCE_INSTANCE_DATE ? r.RECURRENCE_INSTANCE_DATE.toISOString().slice(0, 10) : null,
  });
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const token = await getAuthToken(request);
  if (!token?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await props.params;

  const rows = await query<any>(`SELECT * FROM tasks WHERE id = :b_id`, { b_id: id });
  if (!rows.length || rows[0].USER_ID !== token.id) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }

  const task = rows[0];
  if (task.STATUS === "COMPLETED") {
    return NextResponse.json({ error: "Tarefa já completada" }, { status: 409 });
  }
  if (task.STATUS === "SKIPPED") {
    return NextResponse.json({ error: "Tarefa pulada não pode ser completada" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const { status, scheduledDate, startTime, endTime, estimatedDuration, restTime } = body;

  // Time range validation
  const patchedStartTime = startTime !== undefined ? startTime : (task.START_TIME ?? null);
  const patchedEndTime = endTime !== undefined ? endTime : (task.END_TIME ?? null);
  if ((startTime !== undefined || endTime !== undefined) && patchedStartTime && patchedEndTime) {
    const v = validateTimeRange(patchedStartTime, patchedEndTime);
    if (!v.valid) return NextResponse.json({ error: v.error }, { status: 400 });
  }

  // Conflict validation
  const patchedScheduledDate = scheduledDate !== undefined ? scheduledDate
    : (task.SCHEDULED_DATE
        ? (task.SCHEDULED_DATE instanceof Date ? task.SCHEDULED_DATE.toISOString().slice(0, 10) : String(task.SCHEDULED_DATE).slice(0, 10))
        : null);

  if (patchedScheduledDate && patchedStartTime && patchedEndTime) {
    try {
      const existingRows = await query<any>(
        `SELECT id, title, start_time, end_time, rest_time, status
         FROM tasks
         WHERE user_id = :b_uid
           AND scheduled_date = TO_DATE(:b_date, 'YYYY-MM-DD')
           AND start_time IS NOT NULL AND end_time IS NOT NULL
           AND id != :b_tid`,
        { b_uid: token.id, b_date: patchedScheduledDate, b_tid: id }
      );
      const existingBlocks: TimeBlock[] = existingRows
        .filter((r: any) => r.STATUS === "GARAGE" || r.STATUS === "COMPLETED")
        .map((r: any) => ({
          taskId: r.ID, title: r.TITLE,
          startTime: r.START_TIME, endTime: r.END_TIME,
          restTime: r.REST_TIME ?? 5, status: r.STATUS as "GARAGE" | "COMPLETED",
        }));
      const conflictResult = validateConflict(
        { startTime: patchedStartTime, endTime: patchedEndTime, restTime: restTime ?? (task.REST_TIME ?? 5) },
        existingBlocks
      );
      if (conflictResult.hasConflict) {
        return NextResponse.json({ error: conflictResult.message, conflict: conflictResult }, { status: 409 });
      }
    } catch (err: any) {
      if (err?.errorNum !== 904) throw err;
    }
  }

  // Build SET clause — all bind names use b_ prefix
  const setClauses: string[] = [];
  const binds: Record<string, any> = { b_id: id };

  if (scheduledDate !== undefined) {
    if (scheduledDate === null) { setClauses.push("scheduled_date = NULL"); }
    else { setClauses.push("scheduled_date = TO_DATE(:b_sdate, 'YYYY-MM-DD')"); binds.b_sdate = scheduledDate; }
  }
  if (startTime !== undefined) { setClauses.push("start_time = :b_st"); binds.b_st = startTime; }
  if (endTime !== undefined) { setClauses.push("end_time = :b_et"); binds.b_et = endTime; }
  if (estimatedDuration !== undefined) { setClauses.push("estimated_duration = :b_dur"); binds.b_dur = estimatedDuration; }
  if (restTime !== undefined) { setClauses.push("rest_time = :b_rest"); binds.b_rest = restTime; }

  // Complete task
  if (status === "COMPLETED") {
    const xpGained = XP_MAP[task.DIFFICULTY] ?? 100;
    const userId = token.id as string;

    setClauses.push("status = 'COMPLETED'");

    try {
      await execute(`UPDATE tasks SET ${setClauses.join(", ")} WHERE id = :b_id`, binds);
    } catch (err: any) {
      if (err?.errorNum !== 904) throw err;
      await execute(`UPDATE tasks SET status = 'COMPLETED' WHERE id = :b_id`, { b_id: id });
    }

    const pool = await getPool();
    const conn = await pool.getConnection();
    try {
      await creditXpBoth(conn, userId, xpGained);

      type UserRow = { XP: number; LEVEL_NUM: number };
      const userResult = await conn.execute<UserRow>(
        `SELECT xp, level_num FROM users WHERE id = :b_uid`,
        { b_uid: userId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const userRow = (userResult.rows ?? [])[0];
      const newXp = userRow.XP;
      const newLevel = Math.floor(newXp / 500) + 1;

      await conn.execute(
        `UPDATE users SET level_num = :b_lvl WHERE id = :b_uid`,
        { b_lvl: newLevel, b_uid: userId },
        { autoCommit: true }
      );

      return NextResponse.json({ task: { id: task.ID, status: "COMPLETED" }, xpGained, newXp, newLevel });
    } finally {
      await conn.close();
    }
  }

  // Non-completion patch
  if (setClauses.length === 0) {
    return NextResponse.json({ task: { id: task.ID, status: task.STATUS } });
  }

  try {
    await execute(`UPDATE tasks SET ${setClauses.join(", ")} WHERE id = :b_id`, binds);
  } catch (err: any) {
    if (err?.errorNum !== 904) throw err;
  }

  return NextResponse.json({ task: { id: task.ID, status: task.STATUS } });
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const token = await getAuthToken(request);
  if (!token?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await props.params;

  const rows = await query<any>(`SELECT user_id FROM tasks WHERE id = :b_id`, { b_id: id });
  if (!rows.length || rows[0].USER_ID !== token.id) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }

  await execute(`DELETE FROM tasks WHERE id = :b_id`, { b_id: id });
  return NextResponse.json({ success: true });
}
