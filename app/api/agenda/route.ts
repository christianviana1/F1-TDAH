// Agenda API route — F1 Advanced Features
// Requirements: 3.1, 3.7, 3.8

import { getAuthToken } from "@/lib/get-token";
import { query } from "@/lib/oracle";
import { type NextRequest, NextResponse } from "next/server";

/** Validate that a string is a valid YYYY-MM-DD date. */
function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

export interface AgendaTask {
  id: string;
  title: string;
  difficulty: "SOFT" | "MEDIUM" | "HARD";
  status: string;
  scheduledDate: string | null;
  startTime: string | null;
  endTime: string | null;
  estimatedDuration: number | null;
  restTime: number | null;
  recurrenceSeriesId: string | null;
}

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

/** Map raw Oracle row (uppercase keys) to AgendaTask. */
function mapRow(r: Record<string, unknown>): AgendaTask {
  return {
    id: r.ID as string,
    title: r.TITLE as string,
    difficulty: r.DIFFICULTY as AgendaTask["difficulty"],
    status: r.STATUS as string,
    scheduledDate: formatDate(r.SCHEDULED_DATE as Date | string | null),
    startTime: (r.START_TIME as string | null) ?? null,
    endTime: (r.END_TIME as string | null) ?? null,
    estimatedDuration: (r.ESTIMATED_DURATION as number | null) ?? null,
    restTime: (r.REST_TIME as number | null) ?? null,
    recurrenceSeriesId: (r.RECURRENCE_SERIES_ID as string | null) ?? null,
  };
}

export async function GET(request: NextRequest) {
  // --- Auth ---
  const token = await getAuthToken(request);
  if (!token?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // --- Parse and validate query param ---
  const dateParam = request.nextUrl.searchParams.get("date");

  if (!dateParam) {
    return NextResponse.json(
      { error: "Parâmetro 'date' é obrigatório (formato: YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  if (!isValidDateString(dateParam)) {
    return NextResponse.json(
      { error: "Parâmetro 'date' inválido. Use o formato YYYY-MM-DD" },
      { status: 400 }
    );
  }

  // --- Query Oracle ---
  // Returns only tasks with both start_time and end_time defined,
  // ordered by start_time (Requirement 3.8).
  const rows = await query<Record<string, unknown>>(
    `SELECT id, title, difficulty, status, scheduled_date,
            start_time, end_time, estimated_duration, rest_time,
            recurrence_series_id
     FROM tasks
     WHERE user_id = :userId
       AND scheduled_date = :date
       AND start_time IS NOT NULL
       AND end_time IS NOT NULL
     ORDER BY start_time`,
    {
      userId: token.id,
      date: dateParam,
    }
  );

  const tasks: AgendaTask[] = rows.map(mapRow);

  return NextResponse.json(tasks);
}
