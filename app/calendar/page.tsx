"use client";

// Calendar page — F1 Advanced Features
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 4.9

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronLeft, ChevronRight, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type CalendarTask,
  getCalendarWeekRange,
  getOverflowDisplay,
  groupTasksByDay,
} from "./utils";

// ─── ISO week number from a Date ─────────────────────────────────────────────

function getISOWeek(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Thursday of the current week
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    )
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    year: "numeric",
    month: "long",
  });
}

function formatWeekDisplay(start: Date, end: Date): string {
  return `${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;
}

const MONTH_DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEK_DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

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

// ─── Popover Component ───────────────────────────────────────────────────────

interface TaskPopoverProps {
  tasks: CalendarTask[];
  onClose: () => void;
}

function TaskPopover({ tasks, onClose }: TaskPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-50 left-0 top-full mt-1 w-64 rounded-xl bg-zinc-900 ring-1 ring-zinc-700 shadow-xl p-3 space-y-2"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono uppercase tracking-widest text-zinc-500">
          Tarefas
        </span>
        <button
          onClick={onClose}
          className="text-zinc-600 hover:text-zinc-300 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {tasks.map((task) => (
        <div
          key={task.id}
          className={`rounded-lg border px-2 py-1.5 text-xs ${DIFFICULTY_COLOR[task.difficulty] ?? DIFFICULTY_COLOR.SOFT}`}
        >
          <div className="flex items-center gap-1 font-medium">
            {task.recurrenceSeriesId && (
              <RotateCcw className="h-3 w-3 shrink-0 opacity-70" />
            )}
            <span className="line-clamp-2">{task.title}</span>
          </div>
          <div className="flex items-center justify-between mt-1 text-[10px] opacity-70">
            <span>{task.startTime ?? "—"}</span>
            <span>{STATUS_LABEL[task.status] ?? task.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── New Task Dialog ─────────────────────────────────────────────────────────

interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillDate?: string | null;
}

function NewTaskDialog({ open, onOpenChange, prefillDate }: NewTaskDialogProps) {
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<"SOFT" | "MEDIUM" | "HARD">("SOFT");
  const [scheduledDate, setScheduledDate] = useState(prefillDate ?? "");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync prefillDate whenever it changes (dialog re-opens with new date)
  useEffect(() => {
    setScheduledDate(prefillDate ?? "");
    setTitle("");
    setError(null);
  }, [prefillDate, open]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { title: title.trim(), difficulty };
      if (scheduledDate) body.scheduledDate = scheduledDate;
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onOpenChange(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Erro ao criar tarefa.");
      }
    } catch {
      setError("Falha ao conectar com o servidor.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-wider font-black">
            Nova Ordem de Corrida
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label className="text-zinc-400 font-mono text-xs">Tarefa</Label>
            <Input
              placeholder="Ex: Revisar telemetria do código"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="bg-zinc-800 border-zinc-700 text-white"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400 font-mono text-xs">Data (opcional)</Label>
            <Input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400 font-mono text-xs">Composto (Dificuldade)</Label>
            <div className="flex gap-2">
              {(["SOFT", "MEDIUM", "HARD"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`flex-1 py-2 rounded text-xs font-bold font-mono border transition-colors ${
                    difficulty === d
                      ? d === "SOFT"
                        ? "bg-red-600 border-red-500 text-white"
                        : d === "MEDIUM"
                        ? "bg-yellow-600 border-yellow-500 text-white"
                        : "bg-purple-700 border-purple-500 text-white"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p className="text-red-400 text-xs font-mono">{error}</p>
          )}
          <Button
            onClick={handleCreate}
            disabled={creating || !title.trim()}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold uppercase"
          >
            {creating ? "Adicionando..." : "Largar 🏁"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Monthly View ─────────────────────────────────────────────────────────────

interface MonthlyViewProps {
  referenceDate: Date;
  tasksByDay: Record<string, CalendarTask[]>;
  onDayClick: (dateKey: string) => void;
  onTaskClick: (tasks: CalendarTask[], dateKey: string) => void;
  popoverKey: string | null;
  onClosePopover: () => void;
}

function MonthlyView({
  referenceDate,
  tasksByDay,
  onDayClick,
  onTaskClick,
  popoverKey,
  onClosePopover,
}: MonthlyViewProps) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  // First day of month (0=Sun…6=Sat)
  const firstDow = new Date(year, month, 1).getDay();
  // Total days in month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build grid cells: prefix empty + days
  const cells: Array<number | null> = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full rows of 7
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const todayKey = formatDateKey(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  return (
    <div>
      {/* Day names header */}
      <div className="grid grid-cols-7 mb-1">
        {MONTH_DAY_NAMES.map((name) => (
          <div
            key={name}
            className="text-center text-[10px] font-mono uppercase tracking-widest text-zinc-600 py-1"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px bg-zinc-800 rounded-xl overflow-hidden border border-zinc-800">
        {cells.map((day, idx) => {
          if (day === null) {
            return (
              <div key={`empty-${idx}`} className="bg-zinc-950 min-h-[80px]" />
            );
          }

          const dateKey = formatDateKey(year, month, day);
          const dayTasks = tasksByDay[dateKey] ?? [];
          const { visible, overflowCount } = getOverflowDisplay(dayTasks);
          const isToday = dateKey === todayKey;
          const isPopoverOpen = popoverKey === dateKey;

          return (
            <div
              key={dateKey}
              className={`bg-zinc-900 min-h-[80px] p-1.5 cursor-pointer hover:bg-zinc-800/80 transition-colors relative group ${
                isToday ? "ring-1 ring-inset ring-red-500/50" : ""
              }`}
              onClick={() => {
                if (dayTasks.length === 0) {
                  onDayClick(dateKey);
                }
              }}
            >
              {/* Day number */}
              <div
                className={`text-xs font-mono mb-1 w-5 h-5 flex items-center justify-center rounded-full ${
                  isToday
                    ? "bg-red-600 text-white font-bold"
                    : "text-zinc-400"
                }`}
              >
                {day}
              </div>

              {/* Task indicators */}
              <div className="space-y-0.5">
                {visible.map((task) => (
                  <button
                    key={task.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTaskClick(dayTasks, dateKey);
                    }}
                    className={`w-full text-left text-[10px] px-1 py-0.5 rounded border truncate flex items-center gap-0.5 ${
                      DIFFICULTY_COLOR[task.difficulty] ?? DIFFICULTY_COLOR.SOFT
                    }`}
                  >
                    {task.recurrenceSeriesId && (
                      <RotateCcw className="h-2 w-2 shrink-0 opacity-70" />
                    )}
                    <span className="truncate">{task.title}</span>
                  </button>
                ))}
                {overflowCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTaskClick(dayTasks, dateKey);
                    }}
                    className="w-full text-left"
                  >
                    <Badge
                      variant="outline"
                      className="text-[9px] font-mono border-zinc-700 text-zinc-400 h-4"
                    >
                      +{overflowCount}
                    </Badge>
                  </button>
                )}
              </div>

              {/* Popover */}
              {isPopoverOpen && dayTasks.length > 0 && (
                <TaskPopover tasks={dayTasks} onClose={onClosePopover} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Weekly View ──────────────────────────────────────────────────────────────

const HOUR_SLOTS = Array.from({ length: 24 }, (_, i) => i); // 0–23
const SLOT_HEIGHT_PX = 30; // 30px per 30-min slot → 60px/hour

interface WeeklyViewProps {
  referenceDate: Date;
  tasksByDay: Record<string, CalendarTask[]>;
  onTaskClick: (tasks: CalendarTask[], dateKey: string) => void;
  popoverKey: string | null;
  onClosePopover: () => void;
}

function parseTimeMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function WeeklyView({
  referenceDate,
  tasksByDay,
  onTaskClick,
  popoverKey,
  onClosePopover,
}: WeeklyViewProps) {
  const year = referenceDate.getFullYear();
  const week = getISOWeek(referenceDate);
  const { start: weekStart } = getCalendarWeekRange(year, week);

  // ISO week: Mon–Sun (days 0–6 correspond to Mon…Sun)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const today = new Date();
  const todayKey = formatDateKey(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  return (
    <div className="overflow-auto">
      {/* Header: day columns */}
      <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-zinc-800 mb-0">
        <div /> {/* time gutter */}
        {weekDays.map((d, i) => {
          const dayKey = formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
          const isToday = dayKey === todayKey;
          return (
            <div
              key={i}
              className={`text-center py-2 text-xs font-mono ${
                isToday ? "text-red-400 font-bold" : "text-zinc-400"
              }`}
            >
              <div className="uppercase tracking-widest text-[10px]">
                {WEEK_DAY_NAMES[i]}
              </div>
              <div className={`text-base ${isToday ? "text-red-400" : "text-white"}`}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="relative">
        {HOUR_SLOTS.map((hour) => (
          <div
            key={hour}
            className="grid grid-cols-[48px_repeat(7,1fr)]"
            style={{ height: SLOT_HEIGHT_PX * 2 }}
          >
            {/* Hour label */}
            <div className="text-[10px] font-mono text-zinc-600 pr-2 text-right pt-1 border-r border-zinc-800">
              {String(hour).padStart(2, "0")}:00
            </div>
            {/* Day columns */}
            {weekDays.map((d, colIdx) => {
              const dayKey = formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
              const dayTasks = tasksByDay[dayKey] ?? [];

              // Tasks that start in this hour (HH:00–HH:59)
              const slotTasks = dayTasks.filter((t) => {
                const mins = parseTimeMinutes(t.startTime);
                if (mins === null) return false;
                return Math.floor(mins / 60) === hour;
              });

              return (
                <div
                  key={colIdx}
                  className="border-l border-zinc-800/50 border-b border-b-zinc-800/30 relative"
                  style={{ height: SLOT_HEIGHT_PX * 2 }}
                >
                  {slotTasks.map((task) => {
                    const startMins = parseTimeMinutes(task.startTime) ?? 0;
                    const offsetInHour = startMins % 60; // 0 or 30
                    const topPx = (offsetInHour / 30) * SLOT_HEIGHT_PX;

                    return (
                      <button
                        key={task.id}
                        onClick={() => onTaskClick([task], dayKey)}
                        className={`absolute left-0.5 right-0.5 text-[10px] px-1 py-0.5 rounded border text-left truncate flex items-center gap-0.5 ${
                          DIFFICULTY_COLOR[task.difficulty] ?? DIFFICULTY_COLOR.SOFT
                        }`}
                        style={{ top: topPx, minHeight: SLOT_HEIGHT_PX - 2 }}
                      >
                        {task.recurrenceSeriesId && (
                          <RotateCcw className="h-2.5 w-2.5 shrink-0 opacity-70" />
                        )}
                        <span className="truncate">{task.title}</span>
                      </button>
                    );
                  })}

                  {/* Popover for this column */}
                  {popoverKey === dayKey && slotTasks.length > 0 && (
                    <TaskPopover
                      tasks={dayTasks}
                      onClose={onClosePopover}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Calendar Page ───────────────────────────────────────────────────────

export default function CalendarPage() {
  useSession(); // ensures session is available (auth guard handled by middleware/layout)

  const [viewMode, setViewMode] = useState<"monthly" | "weekly">("monthly");
  const [referenceDate, setReferenceDate] = useState<Date>(() => new Date());
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);

  // Popover state: which day key is showing a popover
  const [popoverKey, setPopoverKey] = useState<string | null>(null);

  // ── Fetch logic ──────────────────────────────────────────────────────────

  const fetchTasks = useCallback(
    async (mode: "monthly" | "weekly", refDate: Date) => {
      setIsLoading(true);
      setError(null);

      let url: string;
      const year = refDate.getFullYear();

      if (mode === "monthly") {
        const month = refDate.getMonth() + 1; // 1-based
        url = `/api/calendar?year=${year}&month=${month}`;
      } else {
        const week = getISOWeek(refDate);
        url = `/api/calendar?year=${year}&week=${week}`;
      }

      try {
        const res = await fetch(url);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? `Erro ${res.status}`);
        }
        const data: CalendarTask[] = await res.json();
        setTasks(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Falha ao carregar tarefas."
        );
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Fetch on mount and whenever viewMode or referenceDate changes
  useEffect(() => {
    fetchTasks(viewMode, referenceDate);
  }, [viewMode, referenceDate, fetchTasks]);

  // ── Navigation ───────────────────────────────────────────────────────────

  const navigatePrev = () => {
    setReferenceDate((prev) => {
      const d = new Date(prev);
      if (viewMode === "monthly") {
        d.setMonth(d.getMonth() - 1);
      } else {
        d.setDate(d.getDate() - 7);
      }
      return d;
    });
  };

  const navigateNext = () => {
    setReferenceDate((prev) => {
      const d = new Date(prev);
      if (viewMode === "monthly") {
        d.setMonth(d.getMonth() + 1);
      } else {
        d.setDate(d.getDate() + 7);
      }
      return d;
    });
  };

  // ── View toggle: does NOT change referenceDate (Req 1.3) ─────────────────

  const switchToMonthly = () => setViewMode("monthly");
  const switchToWeekly = () => setViewMode("weekly");

  // ── Task grouping ─────────────────────────────────────────────────────────

  const tasksByDay = groupTasksByDay(tasks);

  // ── Period label ──────────────────────────────────────────────────────────

  let periodLabel: string;
  if (viewMode === "monthly") {
    periodLabel = formatDateDisplay(referenceDate);
  } else {
    const year = referenceDate.getFullYear();
    const week = getISOWeek(referenceDate);
    const { start, end } = getCalendarWeekRange(year, week);
    periodLabel = formatWeekDisplay(start, end);
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleDayClick = (dateKey: string) => {
    // Req 1.6: open task creation with date pre-filled
    setPrefillDate(dateKey);
    setDialogOpen(true);
  };

  const handleNewTask = () => {
    // Req 1.7: open without pre-filling date
    setPrefillDate(null);
    setDialogOpen(true);
  };

  const handleTaskClick = (dayTasks: CalendarTask[], dateKey: string) => {
    setPopoverKey((prev) => (prev === dateKey ? null : dateKey));
  };

  const handleClosePopover = () => setPopoverKey(null);

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      // Refresh tasks after task creation
      fetchTasks(viewMode, referenceDate);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-8">
      {/* HEADER */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 border-b border-zinc-900 pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight flex items-center gap-2">
            Calendário
          </h1>
          <p className="text-zinc-400 text-xs md:text-sm font-mono">
            Programação de corridas
          </p>
        </div>

        {/* Nova Tarefa — always visible (Req 1.7) */}
        <Button
          onClick={handleNewTask}
          className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs h-8"
          size="sm"
        >
          <Plus className="mr-1 h-4 w-4" />
          Nova Tarefa
        </Button>
      </header>

      {/* CALENDAR CARD */}
      <Card className="bg-zinc-900 border-zinc-800 text-white">
        <CardHeader className="pb-3 border-b border-zinc-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* View mode toggles */}
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={viewMode === "monthly" ? "default" : "ghost"}
                onClick={switchToMonthly}
                className={
                  viewMode === "monthly"
                    ? "bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
                    : "text-zinc-400 hover:text-white text-xs font-mono"
                }
              >
                Mensal
              </Button>
              <Button
                size="sm"
                variant={viewMode === "weekly" ? "default" : "ghost"}
                onClick={switchToWeekly}
                className={
                  viewMode === "weekly"
                    ? "bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
                    : "text-zinc-400 hover:text-white text-xs font-mono"
                }
              >
                Semanal
              </Button>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-2">
              {/* Prev — always enabled (Req 1.9) */}
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={navigatePrev}
                className="text-zinc-400 hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <CardTitle className="text-sm font-mono text-zinc-200 min-w-[180px] text-center capitalize">
                {periodLabel}
              </CardTitle>

              {/* Next — always enabled (Req 1.9) */}
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={navigateNext}
                className="text-zinc-400 hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {/* Loading state */}
          {isLoading && (
            <div className="text-zinc-600 font-mono text-sm py-8 text-center">
              Carregando telemetria...
            </div>
          )}

          {/* Error state — navigation controls remain enabled (Req 1.9) */}
          {!isLoading && error && (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-red-400 font-mono text-sm text-center">
                ⚠️ {error}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fetchTasks(viewMode, referenceDate)}
                className="border-zinc-700 text-zinc-300 hover:text-white text-xs"
              >
                Tentar novamente
              </Button>
            </div>
          )}

          {/* Calendar views */}
          {!isLoading && !error && (
            <>
              {viewMode === "monthly" ? (
                <MonthlyView
                  referenceDate={referenceDate}
                  tasksByDay={tasksByDay}
                  onDayClick={handleDayClick}
                  onTaskClick={handleTaskClick}
                  popoverKey={popoverKey}
                  onClosePopover={handleClosePopover}
                />
              ) : (
                <WeeklyView
                  referenceDate={referenceDate}
                  tasksByDay={tasksByDay}
                  onTaskClick={handleTaskClick}
                  popoverKey={popoverKey}
                  onClosePopover={handleClosePopover}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* New Task Dialog */}
      <NewTaskDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        prefillDate={prefillDate}
      />
    </div>
  );
}
