// Recurrence API — POST /api/recurrence
// Creates a recurring task series and its instances.
//
// Feature: f1-advanced-features
// Requirements: 4.1, 4.2, 4.3, 4.4, 4.7, 4.8

import { getAuthToken } from "@/lib/get-token";
import { getPool } from "@/lib/oracle";
import {
  countInstances,
  generateRecurrenceInstances,
  type RecurrenceConfig,
  type RecurrenceType,
} from "@/lib/recurrence-engine";
import { validateConflict, type TimeBlock } from "@/lib/conflict-validator";
import { type NextRequest, NextResponse } from "next/server";

/** Validates that a string is in 'YYYY-MM-DD' format and is a real date. */
function isValidDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !isNaN(d.getTime());
}

/** Formats a JS Date (or Oracle DATE) to 'DD/MM/AAAA' for Portuguese messages. */
function formatPtBR(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-");
  return `${d}/${m}/${y}`;
}

/** Converts a raw Oracle row (uppercase keys) to a TimeBlock for conflict checking. */
function rowToTimeBlock(r: Record<string, unknown>): TimeBlock {
  return {
    taskId: r.ID as string,
    title: r.TITLE as string,
    startTime: r.START_TIME as string,
    endTime: r.END_TIME as string,
    restTime: (r.REST_TIME as number) ?? 5,
    status: r.STATUS as "GARAGE" | "COMPLETED",
  };
}

export async function POST(request: NextRequest) {
  // --- Auth ---
  const token = await getAuthToken(request);
  if (!token?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // --- Parse body ---
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const {
    title,
    difficulty,
    recurrenceType,
    startDate,
    endDate,
    weekdays,
    startTime = null,
    endTime = null,
    estimatedDuration = null,
    restTime = 5,
  } = body as {
    title?: unknown;
    difficulty?: unknown;
    recurrenceType?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    weekdays?: unknown;
    startTime?: unknown;
    endTime?: unknown;
    estimatedDuration?: unknown;
    restTime?: unknown;
  };

  // --- Validation ---
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json(
      { error: "Título é obrigatório" },
      { status: 400 }
    );
  }

  const validDifficulties = ["SOFT", "MEDIUM", "HARD"] as const;
  if (!validDifficulties.includes(difficulty as (typeof validDifficulties)[number])) {
    return NextResponse.json(
      { error: "difficulty deve ser SOFT, MEDIUM ou HARD" },
      { status: 400 }
    );
  }

  const validRecurrenceTypes = ["DAILY", "WEEKLY", "PERIOD"] as const;
  if (
    !validRecurrenceTypes.includes(
      recurrenceType as (typeof validRecurrenceTypes)[number]
    )
  ) {
    return NextResponse.json(
      { error: "recurrenceType deve ser DAILY, WEEKLY ou PERIOD" },
      { status: 400 }
    );
  }

  if (!isValidDate(startDate)) {
    return NextResponse.json(
      { error: "startDate deve ser uma data válida no formato YYYY-MM-DD" },
      { status: 400 }
    );
  }

  if (!isValidDate(endDate)) {
    return NextResponse.json(
      { error: "endDate deve ser uma data válida no formato YYYY-MM-DD" },
      { status: 400 }
    );
  }

  if (endDate < startDate) {
    return NextResponse.json(
      { error: "endDate deve ser maior ou igual a startDate" },
      { status: 400 }
    );
  }

  // --- Build recurrence config ---
  const recurrenceConfig: RecurrenceConfig = {
    type: recurrenceType as RecurrenceType,
    startDate: startDate as string,
    endDate: endDate as string,
    weekdays:
      recurrenceType === "WEEKLY" && Array.isArray(weekdays)
        ? (weekdays as number[])
        : undefined,
  };

  // --- Check 365 instance limit (Requirement 4.7) ---
  const instanceCount = countInstances(recurrenceConfig);
  if (instanceCount > 365) {
    return NextResponse.json(
      {
        error: `O período selecionado geraria ${instanceCount} instâncias. O limite é 365. Reduza o período para continuar.`,
      },
      { status: 422 }
    );
  }

  // --- Check conflicts — if any date conflicts, BLOCK the entire creation ---
  const userId = token.id as string;
  const conflictSet = new Set<string>();

  if (startTime && endTime) {
    try {
      const tempResult = generateRecurrenceInstances(recurrenceConfig, new Set());
      const candidateDates = tempResult.instances.map((i) => i.scheduledDate);

      for (const date of candidateDates) {
        const rows = await queryTasksForDate(userId, date);
        if (rows.length > 0) {
          const existingBlocks: TimeBlock[] = rows.map(rowToTimeBlock);
          const conflict = validateConflict(
            {
              startTime: startTime as string,
              endTime: endTime as string,
              restTime: typeof restTime === "number" ? restTime : 5,
            },
            existingBlocks
          );
          if (conflict.hasConflict) conflictSet.add(date);
        }
      }
    } catch (err: any) {
      if (err?.errorNum !== 904) throw err;
    }
  }

  // If any date has a conflict, block the entire series creation
  if (conflictSet.size > 0) {
    const formatPtBR = (d: string) => { const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; };
    const conflictDates = [...conflictSet].sort().map(formatPtBR).join(", ");
    return NextResponse.json(
      {
        error: `Conflito de horário nas seguintes datas: ${conflictDates}. Ajuste o horário ou o período e tente novamente.`,
        conflictDates: [...conflictSet].sort(),
      },
      { status: 409 }
    );
  }

  // --- Generate instances (no conflicts, all GARAGE) ---
  const generated = generateRecurrenceInstances(recurrenceConfig, new Set());

  // --- Transaction: insert series + instances ---
  const seriesId = crypto.randomUUID();
  const pool = await getPool();
  const conn = await pool.getConnection();

  try {
    const weekdaysStr =
      recurrenceType === "WEEKLY" && Array.isArray(weekdays) && weekdays.length > 0
        ? (weekdays as number[]).join(",")
        : null;

    // Try to insert into task_recurrence_series (requires migration).
    // If the table doesn't exist yet (ORA-00942) or columns are missing (ORA-00904),
    // fall back to inserting tasks without the series record.
    let seriesInserted = false;
    try {
      await conn.execute(
        `INSERT INTO task_recurrence_series
           (id, user_id, title, difficulty, recurrence_type,
            start_date, end_date, weekdays,
            estimated_duration, rest_time, start_time, end_time, created_at)
         VALUES
           (:id, :userId, :title, :difficulty, :recurrenceType,
            TO_DATE(:startDate, 'YYYY-MM-DD'), TO_DATE(:endDate, 'YYYY-MM-DD'), :weekdays,
            :estimatedDuration, :restTime, :startTime, :endTime, CURRENT_TIMESTAMP)`,
        {
          id: seriesId,
          userId,
          title: (title as string).trim(),
          difficulty: difficulty as string,
          recurrenceType: recurrenceType as string,
          startDate: startDate as string,
          endDate: endDate as string,
          weekdays: weekdaysStr,
          estimatedDuration: estimatedDuration != null ? Number(estimatedDuration) : null,
          restTime: typeof restTime === "number" ? restTime : 5,
          startTime: startTime ?? null,
          endTime: endTime ?? null,
        },
        { autoCommit: false }
      );
      seriesInserted = true;
    } catch (err: any) {
      if (err?.errorNum !== 904 && err?.errorNum !== 942) throw err;
      // Migration not run yet — continue without series record
    }

    // Insert each task instance
    for (const instance of generated.instances) {
      const instanceId = crypto.randomUUID();

      // Try full insert with advanced columns first
      let inserted = false;
      if (seriesInserted) {
        try {
          await conn.execute(
            `INSERT INTO tasks
               (id, user_id, title, difficulty, status,
                scheduled_date, start_time, end_time,
                estimated_duration, rest_time,
                recurrence_series_id, recurrence_instance_date)
             VALUES
               (:id, :userId, :title, :difficulty, :status,
                TO_DATE(:scheduledDate, 'YYYY-MM-DD'), :startTime, :endTime,
                :estimatedDuration, :restTime,
                :recurrenceSeriesId, TO_DATE(:recurrenceInstanceDate, 'YYYY-MM-DD'))`,
            {
              id: instanceId,
              userId,
              title: (title as string).trim(),
              difficulty: difficulty as string,
              status: instance.status,
              scheduledDate: instance.scheduledDate,
              startTime: startTime ?? null,
              endTime: endTime ?? null,
              estimatedDuration: estimatedDuration != null ? Number(estimatedDuration) : null,
              restTime: typeof restTime === "number" ? restTime : 5,
              recurrenceSeriesId: seriesId,
              recurrenceInstanceDate: instance.scheduledDate,
            },
            { autoCommit: false }
          );
          inserted = true;
        } catch (err: any) {
          if (err?.errorNum !== 904 && err?.errorNum !== 942) throw err;
          // Fall through to basic insert
        }
      }

      // Fallback: basic insert without advanced columns
      if (!inserted) {
        await conn.execute(
          `INSERT INTO tasks (id, user_id, title, difficulty, status)
           VALUES (:id, :userId, :title, :difficulty, :status)`,
          {
            id: instanceId,
            userId,
            title: (title as string).trim(),
            difficulty: difficulty as string,
            status: instance.status,
          },
          { autoCommit: false }
        );
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }

  // --- Response ---
  const createdCount = generated.instances.length;

  return NextResponse.json(
    { seriesId, created: createdCount },
    { status: 201 }
  );
}

// ---------------------------------------------------------------------------
// Helper — query tasks for a specific user+date with times set
// ---------------------------------------------------------------------------
async function queryTasksForDate(
  userId: string,
  date: string
): Promise<Record<string, unknown>[]> {
  const { query } = await import("@/lib/oracle");
  return query<Record<string, unknown>>(
    `SELECT id, title, start_time, end_time, rest_time, status
     FROM tasks
     WHERE user_id = :userId
       AND scheduled_date = TO_DATE(:scheduledDate, 'YYYY-MM-DD')
       AND start_time IS NOT NULL
       AND end_time IS NOT NULL
       AND status IN ('GARAGE', 'COMPLETED')`,
    { userId, scheduledDate: date }
  );
}
