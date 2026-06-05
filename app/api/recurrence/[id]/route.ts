// Recurrence Instance API — DELETE /api/recurrence/[id]
// Deletes a single recurrence instance or all future instances in a series.
//
// Feature: f1-advanced-features
// Requirements: 4.6

import { getAuthToken } from "@/lib/get-token";
import { query, execute } from "@/lib/oracle";
import { type NextRequest, NextResponse } from "next/server";

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  // --- Auth ---
  const token = await getAuthToken(request);
  if (!token?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await props.params;

  // --- Query param validation ---
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");

  if (mode !== "single" && mode !== "future") {
    return NextResponse.json(
      { error: "Query param 'mode' é obrigatório e deve ser 'single' ou 'future'" },
      { status: 400 }
    );
  }

  // --- Fetch the task instance ---
  const rows = await query<any>(
    `SELECT id, user_id, recurrence_series_id, recurrence_instance_date
     FROM tasks
     WHERE id = :id`,
    { id }
  );

  if (!rows.length || rows[0].USER_ID !== token.id) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }

  const task = rows[0];

  if (!task.RECURRENCE_SERIES_ID) {
    return NextResponse.json(
      { error: "Esta tarefa não é parte de uma série recorrente" },
      { status: 400 }
    );
  }

  const seriesId = task.RECURRENCE_SERIES_ID as string;

  // --- Delete logic ---
  if (mode === "single") {
    await execute(`DELETE FROM tasks WHERE id = :id`, { id });

    return NextResponse.json({ deleted: 1, mode: "single" }, { status: 200 });
  }

  // mode === "future": delete this instance and all future ones in the series
  const instanceDate = task.RECURRENCE_INSTANCE_DATE as Date;

  // instanceDate comes back as a JS Date from Oracle; format to 'YYYY-MM-DD' for comparison
  const instanceDateStr = instanceDate.toISOString().slice(0, 10);

  const result = await execute(
    `DELETE FROM tasks
     WHERE recurrence_series_id = :seriesId
       AND recurrence_instance_date >= TO_DATE(:instanceDate, 'YYYY-MM-DD')`,
    { seriesId, instanceDate: instanceDateStr }
  );

  const deleted = (result.rowsAffected ?? 0) as number;

  return NextResponse.json({ deleted, mode: "future" }, { status: 200 });
}
