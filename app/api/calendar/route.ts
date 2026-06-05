// Calendar API route — F1 Advanced Features
// Requirements: 1.1, 1.2, 1.8, 1.9

import { getAuthToken } from "@/lib/get-token";
import { query } from "@/lib/oracle";
import { getCalendarWeekRange, type CalendarTask } from "@/app/calendar/utils";
import { type NextRequest, NextResponse } from "next/server";

/** Format a JS Date (or Oracle DATE value) to 'YYYY-MM-DD'. */
function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Map raw Oracle row (uppercase keys) to CalendarTask. */
function mapRow(r: Record<string, unknown>): CalendarTask {
  return {
    id: r.ID as string,
    title: r.TITLE as string,
    difficulty: r.DIFFICULTY as CalendarTask["difficulty"],
    status: r.STATUS as string,
    scheduledDate: formatDate(r.SCHEDULED_DATE as Date | string | null),
    startTime: (r.START_TIME as string | null) ?? null,
    endTime: (r.END_TIME as string | null) ?? null,
    recurrenceSeriesId:
      (r.RECURRENCE_SERIES_ID as string | null) ?? null,
  };
}

export async function GET(request: NextRequest) {
  // --- Auth ---
  const token = await getAuthToken(request);
  if (!token?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // --- Parse query params ---
  const searchParams = request.nextUrl.searchParams;
  const yearParam = searchParams.get("year");
  const monthParam = searchParams.get("month");
  const weekParam = searchParams.get("week");

  // year is always required
  if (!yearParam) {
    return NextResponse.json(
      { error: "Parâmetro 'year' é obrigatório" },
      { status: 400 }
    );
  }

  const year = Number(yearParam);
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    return NextResponse.json(
      { error: "Parâmetro 'year' inválido" },
      { status: 400 }
    );
  }

  let startDate: Date;
  let endDate: Date;

  if (monthParam !== null && weekParam === null) {
    // --- Monthly view ---
    const month = Number(monthParam);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Parâmetro 'month' deve ser um número entre 1 e 12" },
        { status: 400 }
      );
    }
    // First day of the month
    startDate = new Date(year, month - 1, 1);
    // Last day of the month (day 0 of the next month)
    endDate = new Date(year, month, 0);
  } else if (weekParam !== null && monthParam === null) {
    // --- Weekly view ---
    const week = Number(weekParam);
    if (!Number.isInteger(week) || week < 1 || week > 53) {
      return NextResponse.json(
        { error: "Parâmetro 'week' deve ser um número ISO entre 1 e 53" },
        { status: 400 }
      );
    }
    const range = getCalendarWeekRange(year, week);
    startDate = range.start;
    endDate = range.end;
  } else {
    // Neither or both provided
    return NextResponse.json(
      {
        error:
          "Forneça 'year' + 'month' (view mensal) ou 'year' + 'week' (view semanal)",
      },
      { status: 400 }
    );
  }

  // --- Query Oracle ---
  // Fallback gracioso se a migração ainda não rodou (ORA-00904: column not found)
  let rows: Record<string, unknown>[];
  try {
    rows = await query<Record<string, unknown>>(
      `SELECT id, title, difficulty, status,
              scheduled_date, start_time, end_time, recurrence_series_id
       FROM tasks
       WHERE user_id = :userId
         AND scheduled_date BETWEEN :startDate AND :endDate
       ORDER BY scheduled_date, start_time`,
      { userId: token.id, startDate, endDate }
    );
  } catch (err: any) {
    if (err?.errorNum === 904) {
      // Colunas avançadas não existem — usa created_at como data de agendamento
      // para que o calendário mostre as tasks existentes
      rows = await query<Record<string, unknown>>(
        `SELECT id, title, difficulty, status, created_at AS scheduled_date,
                NULL AS start_time, NULL AS end_time, NULL AS recurrence_series_id
         FROM tasks
         WHERE user_id = :userId
           AND TRUNC(created_at) BETWEEN :startDate AND :endDate
         ORDER BY created_at`,
        { userId: token.id, startDate, endDate }
      );
    } else {
      throw err;
    }
  }

  const tasks: CalendarTask[] = rows.map(mapRow);

  return NextResponse.json(tasks);
}
