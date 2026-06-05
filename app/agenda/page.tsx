"use client";

// Agenda page — F1 Advanced Features
// Requirements: 3.8, 4.9

import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type AgendaTask } from "@/app/api/agenda/route";

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_HEIGHT_PX = 40;

const DIFFICULTY_COLOR: Record<string, string> = {
  SOFT: "bg-red-500/20 text-red-300 border-red-500/30",
  MEDIUM: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  HARD: "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

const STATUS_LABEL: Record<string, string> = {
  GARAGE: "Na garagem",
  COMPLETED: "Concluída",
  SKIPPED: "Pulada",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns today's date as 'YYYY-MM-DD' in local time. */
function todayDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Calculates the block height for a task.
 * Req 3.8: height proportional to estimatedDuration (1 px per minute),
 * with a minimum of MIN_HEIGHT_PX.
 */
function getBlockHeight(estimatedDuration: number | null): number {
  if (estimatedDuration == null) return MIN_HEIGHT_PX;
  return Math.max(MIN_HEIGHT_PX, estimatedDuration * 1);
}

// ─── Task Block ───────────────────────────────────────────────────────────────

interface TaskBlockProps {
  task: AgendaTask;
}

function TaskBlock({ task }: TaskBlockProps) {
  const height = getBlockHeight(task.estimatedDuration);
  const colorClass = DIFFICULTY_COLOR[task.difficulty] ?? DIFFICULTY_COLOR.SOFT;
  const statusLabel = STATUS_LABEL[task.status] ?? task.status;

  return (
    <div
      className={`rounded-lg border px-3 py-2 flex flex-col justify-between overflow-hidden ${colorClass}`}
      style={{ height }}
    >
      <div className="flex items-start gap-1.5">
        {/* Recurrence icon — Req 4.9 */}
        {task.recurrenceSeriesId && (
          <RotateCcw
            className="h-3 w-3 shrink-0 mt-0.5 opacity-70"
            aria-label="Tarefa recorrente"
          />
        )}
        <span className="text-sm font-medium leading-snug line-clamp-2">
          {task.title}
        </span>
      </div>

      <div className="flex items-center justify-between mt-1 text-[11px] opacity-70 font-mono">
        <span>
          {task.startTime ?? "—"}
          {task.endTime ? ` – ${task.endTime}` : ""}
        </span>
        <div className="flex items-center gap-2">
          {task.estimatedDuration != null && (
            <span>{task.estimatedDuration} min</span>
          )}
          <span>{statusLabel}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Agenda Page ─────────────────────────────────────────────────────────

export default function AgendaPage() {
  const [selectedDate, setSelectedDate] = useState<string>(todayDateString);
  const [tasks, setTasks] = useState<AgendaTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch logic ──────────────────────────────────────────────────────────

  const fetchTasks = useCallback(async (date: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agenda?date=${date}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `Erro ${res.status}`);
      }
      const data: AgendaTask[] = await res.json();
      setTasks(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar agenda."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch when selectedDate changes
  useEffect(() => {
    fetchTasks(selectedDate);
  }, [selectedDate, fetchTasks]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-8">
      {/* HEADER */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 border-b border-zinc-900 pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight">
            Agenda
          </h1>
          <p className="text-zinc-400 text-xs md:text-sm font-mono">
            Blocos de tempo do dia
          </p>
        </div>

        {/* Date picker */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="agenda-date"
            className="text-zinc-400 text-xs font-mono uppercase tracking-widest sr-only"
          >
            Data
          </label>
          <input
            id="agenda-date"
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            className="bg-zinc-900 border border-zinc-700 text-white text-sm font-mono rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-600/50 focus:border-red-600 transition-colors"
          />
        </div>
      </header>

      {/* AGENDA CARD */}
      <Card className="bg-zinc-900 border-zinc-800 text-white">
        <CardHeader className="pb-3 border-b border-zinc-800">
          <CardTitle className="text-xs font-mono uppercase tracking-widest text-zinc-400">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("pt-BR", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-4">
          {/* Loading state */}
          {isLoading && (
            <div className="text-zinc-600 font-mono text-sm py-8 text-center">
              Carregando telemetria...
            </div>
          )}

          {/* Error state */}
          {!isLoading && error && (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-red-400 font-mono text-sm text-center">
                ⚠️ {error}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fetchTasks(selectedDate)}
                className="border-zinc-700 text-zinc-300 hover:text-white text-xs"
              >
                Tentar novamente
              </Button>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && tasks.length === 0 && (
            <div className="text-zinc-600 font-mono text-sm py-8 text-center border border-dashed border-zinc-800 rounded-lg">
              Nenhum bloco de tempo programado para este dia.
            </div>
          )}

          {/* Task blocks — ordered by startTime (guaranteed by API, Req 3.8) */}
          {!isLoading && !error && tasks.length > 0 && (
            <div className="space-y-2">
              {tasks.map((task) => (
                <TaskBlock key={task.id} task={task} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
