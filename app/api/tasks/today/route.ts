// GET /api/tasks/today — tasks do dia atual (para o PWA mobile)
import { getAuthToken } from "@/lib/get-token";
import { query } from "@/lib/oracle";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = await getAuthToken(request);
  if (!token?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Usa o fuso horário de Brasília para calcular "hoje"
  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  let rows: any[];

  try {
    // Tasks agendadas para hoje OU criadas hoje (quando não há scheduled_date)
    rows = await query<any>(
      `SELECT id, user_id, title, difficulty, status, created_at,
              scheduled_date, start_time, end_time, estimated_duration, rest_time,
              recurrence_series_id
       FROM tasks
       WHERE user_id = :b_uid
         AND status != 'SKIPPED'
         AND (
           scheduled_date = TO_DATE(:b_today, 'YYYY-MM-DD')
           OR (scheduled_date IS NULL AND TRUNC(created_at) = TO_DATE(:b_today2, 'YYYY-MM-DD'))
         )
       ORDER BY start_time NULLS LAST, created_at ASC`,
      { b_uid: token.id, b_today: todayStr, b_today2: todayStr }
    );
  } catch (err: any) {
    // Fallback sem colunas avançadas
    if (err?.errorNum === 904) {
      rows = await query<any>(
        `SELECT id, user_id, title, difficulty, status, created_at
         FROM tasks
         WHERE user_id = :b_uid
           AND status != 'SKIPPED'
           AND TRUNC(created_at) = TO_DATE(:b_today, 'YYYY-MM-DD')
         ORDER BY created_at ASC`,
        { b_uid: token.id, b_today: todayStr }
      );
    } else {
      throw err;
    }
  }

  const tasks = rows.map((r: any) => ({
    id: r.ID,
    title: r.TITLE,
    difficulty: r.DIFFICULTY,
    status: r.STATUS,
    createdAt: r.CREATED_AT,
    scheduledDate: r.SCHEDULED_DATE ? r.SCHEDULED_DATE.toISOString().slice(0, 10) : null,
    startTime: r.START_TIME ?? null,
    endTime: r.END_TIME ?? null,
    estimatedDuration: r.ESTIMATED_DURATION ?? null,
    restTime: r.REST_TIME ?? null,
    recurrenceSeriesId: r.RECURRENCE_SERIES_ID ?? null,
  }));

  // Cache-Control para o service worker poder usar stale-while-revalidate
  return NextResponse.json({ debug_today: todayStr, debug_count: tasks.length, tasks }, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      "X-Today-Used": todayStr,
    },
  });
}
