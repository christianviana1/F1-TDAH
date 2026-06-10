// GET /api/tasks/today — tasks do dia atual (para o PWA mobile)
import { getAuthToken } from "@/lib/get-token";
import { query } from "@/lib/oracle";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = await getAuthToken(request);
  if (!token?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;

  let rows: any[];

  try {
    // Tasks do dia: agendadas para hoje, atrasadas (scheduled_date < hoje), ou sem data agendada (todas pendentes)
    rows = await query<any>(
      `SELECT id, user_id, title, difficulty, status, created_at,
              scheduled_date, start_time, end_time, estimated_duration, rest_time,
              recurrence_series_id
       FROM tasks
       WHERE user_id = :b_uid
         AND status != 'SKIPPED'
         AND status != 'COMPLETED'
         AND (
           scheduled_date <= TO_DATE(:b_today, 'YYYY-MM-DD')
           OR scheduled_date IS NULL
         )
       ORDER BY scheduled_date NULLS LAST, start_time NULLS LAST, created_at ASC
       FETCH FIRST 50 ROWS ONLY`,
      { b_uid: token.id, b_today: todayStr }
    );
  } catch (err: any) {
    // Fallback sem colunas avançadas (scheduled_date não existe)
    if (err?.errorNum === 904) {
      rows = await query<any>(
        `SELECT id, user_id, title, difficulty, status, created_at
         FROM tasks
         WHERE user_id = :b_uid
           AND status != 'SKIPPED'
           AND status != 'COMPLETED'
         ORDER BY created_at ASC
         FETCH FIRST 50 ROWS ONLY`,
        { b_uid: token.id }
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
  return NextResponse.json(tasks, {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
  });
}
