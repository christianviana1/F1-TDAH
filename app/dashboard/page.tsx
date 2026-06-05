"use client";

import { useSession, signOut } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Trophy, Timer, Flag, Plus, LogOut, CheckCircle, Trash2,
  Pause, Play, RotateCcw, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, X, CalendarDays, List,
  UserPlus, Users, Check, UserMinus,
} from "lucide-react";
import { calculateEndTime, calculateDuration, validateTimeRange } from "@/lib/time-utils";
import { initPomodoroFromTask } from "@/lib/pomodoro-utils";
import {
  type CalendarTask,
  getCalendarWeekRange,
  getOverflowDisplay,
  groupTasksByDay,
} from "@/app/calendar/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Task = {
  id: string;
  title: string;
  difficulty: "SOFT" | "MEDIUM" | "HARD";
  status: string;
  createdAt: string;
  startTime?: string | null;
  endTime?: string | null;
  estimatedDuration?: number | null;
  restTime?: number | null;
  recurrenceSeriesId?: string | null;
};

type RecurrenceOption = "Sem recorrência" | "Diária" | "Semanal" | "Período específico";

type RankingUser = {
  id: string;
  name: string | null;
  xp: number;
  level: number;
};

type Friend = {
  id: string;
  name: string | null;
  email: string;
  xp?: number;
  level?: number;
  friendshipId: string;
};

type FriendRequest = {
  id: string;
  name: string | null;
  email: string;
  friendshipId: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const XP_MAP = { SOFT: 100, MEDIUM: 200, HARD: 300 };
const XP_PER_LEVEL = 500;
const POMODORO_MINUTES = 25;

const DIFFICULTY_STYLE = {
  SOFT: { badge: "bg-red-500/10 text-red-400 border-red-500/20", border: "border-l-red-500" },
  MEDIUM: { badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", border: "border-l-yellow-500" },
  HARD: { badge: "bg-purple-500/10 text-purple-400 border-purple-500/20", border: "border-l-purple-500" },
};

const DIFFICULTY_COLOR: Record<string, string> = {
  SOFT: "bg-red-500/20 text-red-300 border-red-500/30",
  MEDIUM: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  HARD: "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

const COMPLETED_COLOR = "bg-green-500/20 text-green-300 border-green-500/30";

function taskColor(task: CalendarTask): string {
  if (task.status === "COMPLETED") return COMPLETED_COLOR;
  return DIFFICULTY_COLOR[task.difficulty] ?? DIFFICULTY_COLOR.SOFT;
}

const STATUS_LABEL: Record<string, string> = {
  GARAGE: "Pendente",
  COMPLETED: "Concluída",
  SKIPPED: "Pulada",
};

const MONTH_DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEK_DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const HOUR_SLOTS = Array.from({ length: 24 }, (_, i) => i);
const SLOT_HEIGHT_PX = 28;

// ─── Calendar helpers ─────────────────────────────────────────────────────────

function getISOWeek(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  );
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatPeriodLabel(viewMode: "monthly" | "weekly", ref: Date): string {
  if (viewMode === "monthly") {
    return ref.toLocaleDateString("pt-BR", { year: "numeric", month: "long" });
  }
  const { start, end } = getCalendarWeekRange(ref.getFullYear(), getISOWeek(ref));
  return `${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;
}

function parseTimeMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return isNaN(h) || isNaN(m) ? null : h * 60 + m;
}

// ─── Popover ──────────────────────────────────────────────────────────────────

function TaskPopover({ tasks, onClose, onStartPomodoro, onCompleteTask }: {
  tasks: CalendarTask[];
  onClose: () => void;
  onStartPomodoro?: (task: CalendarTask) => void;
  onCompleteTask?: (taskId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute z-50 left-0 top-full mt-1 w-64 rounded-xl bg-zinc-900 ring-1 ring-zinc-700 shadow-xl p-3 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Tarefas</span>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300"><X className="h-3 w-3" /></button>
      </div>
      {tasks.map((t) => (
        <div key={t.id} className={`rounded-lg border px-2 py-1.5 text-xs ${taskColor(t)}`}>
          <div className="flex items-center gap-1 font-medium">
            {t.recurrenceSeriesId && <RotateCcw className="h-3 w-3 shrink-0 opacity-70" />}
            <span className="line-clamp-2 flex-1">{t.title}</span>
            {t.status !== "COMPLETED" && (
              <div className="flex items-center gap-1 shrink-0">
                {onStartPomodoro && (
                  <button onClick={(e) => { e.stopPropagation(); onStartPomodoro(t); onClose(); }}
                    className="opacity-60 hover:opacity-100 transition-opacity" title="Iniciar Pomodoro">
                    <Timer className="h-3 w-3" />
                  </button>
                )}
                {onCompleteTask && (
                  <button onClick={(e) => { e.stopPropagation(); onCompleteTask(t.id); onClose(); }}
                    className="opacity-60 hover:opacity-100 transition-opacity text-green-400" title="Concluir tarefa">
                    <CheckCircle className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between mt-1 text-[10px] opacity-70">
            <span>{t.startTime ?? "—"}</span>
            <span>{STATUS_LABEL[t.status] ?? t.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Monthly View ─────────────────────────────────────────────────────────────

function MonthlyView({
  referenceDate, tasksByDay, onDayClick, onTaskClick, popoverKey, onClosePopover, onStartPomodoro, onCompleteTask,
}: {
  referenceDate: Date;
  tasksByDay: Record<string, CalendarTask[]>;
  onDayClick: (key: string) => void;
  onTaskClick: (tasks: CalendarTask[], key: string) => void;
  popoverKey: string | null;
  onClosePopover: () => void;
  onStartPomodoro: (task: CalendarTask) => void;
  onCompleteTask: (taskId: string) => void;
}) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const today = new Date();
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {MONTH_DAY_NAMES.map((n) => (
          <div key={n} className="text-center text-[10px] font-mono uppercase tracking-widest text-zinc-600 py-1">{n}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-zinc-800 rounded-xl overflow-hidden border border-zinc-800">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} className="bg-zinc-950 min-h-[72px]" />;
          const dateKey = formatDateKey(year, month, day);
          const dayTasks = tasksByDay[dateKey] ?? [];
          const { visible, overflowCount } = getOverflowDisplay(dayTasks);
          const isToday = dateKey === todayKey;
          return (
            <div
              key={dateKey}
              className={`bg-zinc-900 min-h-[72px] p-1 cursor-pointer hover:bg-zinc-800/80 transition-colors relative ${isToday ? "ring-1 ring-inset ring-red-500/50" : ""}`}
              onClick={() => { if (dayTasks.length === 0) onDayClick(dateKey); }}
            >
              <div className={`text-xs font-mono mb-1 w-5 h-5 flex items-center justify-center rounded-full ${isToday ? "bg-red-600 text-white font-bold" : "text-zinc-400"}`}>
                {day}
              </div>
              <div className="space-y-0.5">
                {visible.map((t) => (
                  <button key={t.id} onClick={(e) => { e.stopPropagation(); onTaskClick(dayTasks, dateKey); }}
                    className={`w-full text-left text-[10px] px-1 py-0.5 rounded border truncate flex items-center gap-0.5 ${taskColor(t)}`}>
                    {t.recurrenceSeriesId && <RotateCcw className="h-2 w-2 shrink-0 opacity-70" />}
                    <span className="truncate">{t.title}</span>
                  </button>
                ))}
                {overflowCount > 0 && (
                  <button onClick={(e) => { e.stopPropagation(); onTaskClick(dayTasks, dateKey); }} className="w-full text-left">
                    <Badge variant="outline" className="text-[9px] font-mono border-zinc-700 text-zinc-400 h-4">+{overflowCount}</Badge>
                  </button>
                )}
              </div>
              {popoverKey === dateKey && dayTasks.length > 0 && (
                <TaskPopover tasks={dayTasks} onClose={onClosePopover} onStartPomodoro={onStartPomodoro} onCompleteTask={onCompleteTask} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Weekly View ──────────────────────────────────────────────────────────────

function WeeklyView({
  referenceDate, tasksByDay, onTaskClick, popoverKey, onClosePopover, onStartPomodoro, onCompleteTask,
}: {
  referenceDate: Date;
  tasksByDay: Record<string, CalendarTask[]>;
  onTaskClick: (tasks: CalendarTask[], key: string) => void;
  popoverKey: string | null;
  onClosePopover: () => void;
  onStartPomodoro: (task: CalendarTask) => void;
  onCompleteTask: (taskId: string) => void;
}) {
  const { start: weekStart } = getCalendarWeekRange(referenceDate.getFullYear(), getISOWeek(referenceDate));
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });
  const today = new Date();
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div className="overflow-auto max-h-[520px]">
      <div className="grid grid-cols-[40px_repeat(7,1fr)] border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
        <div />
        {weekDays.map((d, i) => {
          const dk = formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
          const isToday = dk === todayKey;
          return (
            <div key={i} className={`text-center py-2 text-xs font-mono ${isToday ? "text-red-400 font-bold" : "text-zinc-400"}`}>
              <div className="uppercase tracking-widest text-[10px]">{WEEK_DAY_NAMES[i]}</div>
              <div className={`text-base ${isToday ? "text-red-400" : "text-white"}`}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>
      <div>
        {HOUR_SLOTS.map((hour) => (
          <div key={hour} className="grid grid-cols-[40px_repeat(7,1fr)]" style={{ height: SLOT_HEIGHT_PX * 2 }}>
            <div className="text-[9px] font-mono text-zinc-600 pr-1 text-right pt-1 border-r border-zinc-800">{String(hour).padStart(2, "0")}:00</div>
            {weekDays.map((d, ci) => {
              const dk = formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
              const slotTasks = (tasksByDay[dk] ?? []).filter((t) => {
                const m = parseTimeMinutes(t.startTime);
                return m !== null && Math.floor(m / 60) === hour;
              });
              return (
                <div key={ci} className="border-l border-zinc-800/50 border-b border-b-zinc-800/30 relative" style={{ height: SLOT_HEIGHT_PX * 2 }}>
                  {slotTasks.map((t) => {
                    const sm = parseTimeMinutes(t.startTime) ?? 0;
                    const topPx = ((sm % 60) / 30) * SLOT_HEIGHT_PX;
                    return (
                      <button key={t.id} onClick={() => onTaskClick([t], dk)}
                        className={`absolute left-0.5 right-0.5 text-[9px] px-1 py-0.5 rounded border text-left truncate flex items-center gap-0.5 ${taskColor(t)}`}
                        style={{ top: topPx, minHeight: SLOT_HEIGHT_PX - 2 }}>
                        {t.recurrenceSeriesId && <RotateCcw className="h-2 w-2 shrink-0 opacity-70" />}
                        <span className="truncate">{t.title}</span>
                      </button>
                    );
                  })}
                  {popoverKey === dk && slotTasks.length > 0 && <TaskPopover tasks={tasksByDay[dk] ?? []} onClose={onClosePopover} onStartPomodoro={onStartPomodoro} onCompleteTask={onCompleteTask} />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard Page ──────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session, update: updateSession } = useSession();
  const user = session?.user as any;

  // ── Tasks state ────────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // ── View mode: calendar (default) or list ──────────────────────────────────
  const [mainView, setMainView] = useState<"calendar" | "list">("calendar");

  // ── Calendar state ─────────────────────────────────────────────────────────
  const [calendarView, setCalendarView] = useState<"monthly" | "weekly">("monthly");
  const [referenceDate, setReferenceDate] = useState<Date>(() => new Date());
  const [calendarTasks, setCalendarTasks] = useState<CalendarTask[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);
  const [popoverKey, setPopoverKey] = useState<string | null>(null);

  // ── New task form ──────────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDifficulty, setNewDifficulty] = useState<"SOFT" | "MEDIUM" | "HARD">("SOFT");
  const [creating, setCreating] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [estimatedDuration, setEstimatedDuration] = useState("");
  const [restTime, setRestTime] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrenceOption>("Sem recorrência");
  const [recurrenceStartDate, setRecurrenceStartDate] = useState("");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [weekdaySelection, setWeekdaySelection] = useState<number[]>([]); // 0=Dom..6=Sab
  const [timeError, setTimeError] = useState<string | null>(null);
  const [overMidnightWarning, setOverMidnightWarning] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);

  // ── XP feedback ────────────────────────────────────────────────────────────
  const [xpToast, setXpToast] = useState<string | null>(null);

  // ── Ranking ────────────────────────────────────────────────────────────────
  const [ranking, setRanking] = useState<RankingUser[]>([]);

  // ── Amigos ─────────────────────────────────────────────────────────────────
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [friendEmail, setFriendEmail] = useState("");
  const [addingFriend, setAddingFriend] = useState(false);
  const [friendMsg, setFriendMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [friendsOpen, setFriendsOpen] = useState(false);

  // ── Pomodoro ───────────────────────────────────────────────────────────────
  const [secondsLeft, setSecondsLeft] = useState(POMODORO_MINUTES * 60);
  const [running, setRunning] = useState(false);
  const [pomodoroSession, setPomodoroSession] = useState(1);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // ── Fetches ────────────────────────────────────────────────────────────────

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) setTasks(await res.json());
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  // Sincroniza level_num com o XP real na inicialização
  const syncLevel = useCallback(async () => {
    try {
      const res = await fetch("/api/sync-level", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.synced) await updateSession(); // atualiza token se nível mudou
      }
    } catch { /* silently ignore */ }
  }, [updateSession]);

  const fetchRanking = useCallback(async () => {
    const res = await fetch("/api/ranking");
    if (res.ok) setRanking(await res.json());
  }, []);

  const fetchFriends = useCallback(async () => {
    try {
      const res = await fetch("/api/friends");
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends ?? []);
        setFriendRequests(data.pending ?? []);
        setSentRequests(data.sent ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchCalendar = useCallback(async (mode: "monthly" | "weekly", ref: Date) => {
    setCalLoading(true);
    setCalError(null);
    const year = ref.getFullYear();
    const url = mode === "monthly"
      ? `/api/calendar?year=${year}&month=${ref.getMonth() + 1}`
      : `/api/calendar?year=${year}&week=${getISOWeek(ref)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Erro ${res.status}`);
      setCalendarTasks(await res.json());
    } catch (e) {
      setCalError(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setCalLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); fetchRanking(); fetchFriends(); syncLevel(); }, [fetchTasks, fetchRanking, fetchFriends, syncLevel]);
  useEffect(() => { fetchCalendar(calendarView, referenceDate); }, [calendarView, referenceDate, fetchCalendar]);

  // ── Pomodoro timer ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { setRunning(false); setPomodoroSession((p) => p + 1); return POMODORO_MINUTES * 60; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const resetPomodoro = () => { setRunning(false); setSecondsLeft(POMODORO_MINUTES * 60); setActiveTaskId(null); };

  // ── Calendar navigation ────────────────────────────────────────────────────

  const navPrev = () => setReferenceDate((p) => {
    const d = new Date(p);
    calendarView === "monthly" ? d.setMonth(d.getMonth() - 1) : d.setDate(d.getDate() - 7);
    return d;
  });

  const navNext = () => setReferenceDate((p) => {
    const d = new Date(p);
    calendarView === "monthly" ? d.setMonth(d.getMonth() + 1) : d.setDate(d.getDate() + 7);
    return d;
  });

  // ── Task form helpers ──────────────────────────────────────────────────────

  const resetForm = () => {
    setNewTitle(""); setNewDifficulty("SOFT"); setPrefillDate(null);
    setScheduledDate(""); setStartTime(""); setEndTime(""); setEstimatedDuration(""); setRestTime("");
    setRecurrence("Sem recorrência"); setRecurrenceStartDate(""); setRecurrenceEndDate(""); setWeekdaySelection([]);
    setAdvancedOpen(false);
    setTimeError(null); setOverMidnightWarning(false); setConflictError(null);
  };

  const handleTimeChange = (newStart: string, newDur: string, newEnd: string) => {
    setTimeError(null); setOverMidnightWarning(false); setConflictError(null);
    const hasStart = newStart.length === 5;
    const dur = parseInt(newDur, 10);
    if (hasStart && !isNaN(dur) && dur >= 1) {
      const calc = calculateEndTime(newStart, dur);
      setEndTime(calc.endTime);
      setOverMidnightWarning(calc.overMidnight);
      const v = validateTimeRange(newStart, calc.endTime);
      if (!v.valid) setTimeError(v.error ?? null);
      return;
    }
    if (hasStart && newEnd.length === 5) {
      const v = validateTimeRange(newStart, newEnd);
      if (!v.valid) { setTimeError(v.error ?? null); return; }
      setEstimatedDuration(String(calculateDuration(newStart, newEnd)));
    }
  };

  const openNewTask = (date?: string) => {
    resetForm();
    if (date) { setPrefillDate(date); setScheduledDate(date); }
    setDialogOpen(true);
  };

  const createTask = async () => {
    if (!newTitle.trim()) return;
    if (startTime && endTime) {
      const v = validateTimeRange(startTime, endTime);
      if (!v.valid) { setTimeError(v.error ?? null); return; }
    }
    setCreating(true); setConflictError(null);
    try {
      const isRecurring = recurrence !== "Sem recorrência";
      const payload: Record<string, unknown> = { title: newTitle, difficulty: newDifficulty };
      if (scheduledDate) payload.scheduledDate = scheduledDate;
      if (startTime) payload.startTime = startTime;
      if (endTime) payload.endTime = endTime;
      if (estimatedDuration) payload.estimatedDuration = parseInt(estimatedDuration, 10);
      if (restTime) payload.restTime = parseInt(restTime, 10);

      if (isRecurring) {
        const typeMap: Record<RecurrenceOption, string> = { "Sem recorrência": "NONE", "Diária": "DAILY", "Semanal": "WEEKLY", "Período específico": "PERIOD" };
        payload.recurrenceType = typeMap[recurrence];

        // startDate/endDate: usa os campos específicos de recorrência
        const today = new Date().toISOString().slice(0, 10);
        const resolvedStart = recurrenceStartDate || scheduledDate || today;
        const resolvedEnd = recurrenceEndDate || scheduledDate || today;
        payload.startDate = resolvedStart;
        payload.endDate = resolvedEnd;

        if (recurrence === "Semanal" && weekdaySelection.length > 0) {
          payload.weekdays = weekdaySelection;
        }

        // Validação básica
        if (resolvedStart > resolvedEnd) {
          setConflictError("A data de início deve ser anterior ou igual à data de fim.");
          setCreating(false);
          return;
        }
        const res = await fetch("/api/recurrence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (res.ok) { await fetchTasks(); await fetchCalendar(calendarView, referenceDate); setDialogOpen(false); resetForm(); return; }
        if (res.status === 409) {
          const data = await res.json();
          setConflictError(data.error ?? "Conflito de horário.");
          return;
        }
        return;
      }

      const res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.status === 409) { setConflictError((await res.json()).error ?? "Conflito de horário."); return; }
      if (res.ok) {
        const task = await res.json();
        setTasks((prev) => [task, ...prev]);
        await fetchCalendar(calendarView, referenceDate);
        setDialogOpen(false); resetForm();
      }
    } finally { setCreating(false); }
  };

  const completeTask = async (taskId: string) => {
    // Atualização otimista imediata — antes mesmo da resposta do servidor
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "COMPLETED" } : t));
    if (activeTaskId === taskId) { setRunning(false); setSecondsLeft(0); setActiveTaskId(null); }

    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });

    if (res.ok) {
      const data = await res.json();
      setXpToast(`+${data.xpGained} XP 🏁`);
      setTimeout(() => setXpToast(null), 2500);
      await updateSession(); await fetchRanking();
      await fetchCalendar(calendarView, referenceDate);
      // Refetch tasks para garantir sincronismo, mas preservando o estado COMPLETED
      await fetchTasks();
    } else if (res.status === 409) {
      // Já estava COMPLETED no banco — estado otimista já está correto, não fazer refetch
      await fetchCalendar(calendarView, referenceDate);
    } else {
      // Erro real — desfaz a atualização otimista
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "GARAGE" } : t));
    }
  };

  const deleteTask = async (taskId: string) => {
    const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    if (res.ok) { setTasks((prev) => prev.filter((t) => t.id !== taskId)); await fetchCalendar(calendarView, referenceDate); }
  };

  // ── Amigos ─────────────────────────────────────────────────────────────────

  const addFriend = async () => {
    if (!friendEmail.trim()) return;
    setAddingFriend(true); setFriendMsg(null);
    try {
      const res = await fetch("/api/friends", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: friendEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      setFriendMsg({ text: data.message ?? data.error ?? "Erro desconhecido", ok: res.ok });
      if (res.ok) { setFriendEmail(""); await fetchFriends(); await fetchRanking(); }
    } finally { setAddingFriend(false); }
  };

  const respondRequest = async (friendshipId: string, action: "accept" | "reject") => {
    const res = await fetch(`/api/friends/${friendshipId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) { await fetchFriends(); await fetchRanking(); }
  };

  const removeFriend = async (friendshipId: string) => {
    const res = await fetch(`/api/friends/${friendshipId}`, { method: "DELETE" });
    if (res.ok) { await fetchFriends(); await fetchRanking(); }
  };

  // ── Pomodoro do calendário ─────────────────────────────────────────────────

  const handleStartPomodoroFromCalendar = useCallback((task: CalendarTask) => {
    // CalendarTask tem estimatedDuration e restTime? Não diretamente —
    // busca nos tasks carregados pelo dashboard
    const fullTask = tasks.find((t) => t.id === task.id);
    const cfg = initPomodoroFromTask({
      estimatedDuration: fullTask?.estimatedDuration ?? null,
      restTime: fullTask?.restTime ?? null,
    });
    setSecondsLeft(cfg.focusMinutes * 60);
    setActiveTaskId(task.id);
    setRunning(true);
  }, [tasks]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const currentXp = user?.xp ?? 0;
  const currentLevel = user?.level ?? 1;
  const xpIntoLevel = currentXp % XP_PER_LEVEL;
  const xpProgress = (xpIntoLevel / XP_PER_LEVEL) * 100;
  const pendingTasks = tasks.filter((t) => t.status !== "COMPLETED");
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED");
  const tasksByDay = groupTasksByDay(calendarTasks);
  const periodLabel = formatPeriodLabel(calendarView, referenceDate);

  // ── Dialog content ─────────────────────────────────────────────────────────

  const TaskDialog = (
    <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-wider font-black">Nova Ordem de Corrida</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label className="text-zinc-400 font-mono text-xs">Tarefa</Label>
            <Input placeholder="Ex: Revisar telemetria do código" value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createTask()}
              className="bg-zinc-800 border-zinc-700 text-white" autoFocus />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400 font-mono text-xs">Composto (Dificuldade)</Label>
            <div className="flex gap-2">
              {(["SOFT", "MEDIUM", "HARD"] as const).map((d) => (
                <button key={d} onClick={() => setNewDifficulty(d)}
                  className={`flex-1 py-2 rounded text-xs font-bold font-mono border transition-colors ${newDifficulty === d
                    ? d === "SOFT" ? "bg-red-600 border-red-500 text-white" : d === "MEDIUM" ? "bg-yellow-600 border-yellow-500 text-white" : "bg-purple-700 border-purple-500 text-white"
                    : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                  {d} (+{XP_MAP[d]} XP)
                </button>
              ))}
            </div>
          </div>
          <div className="border border-zinc-700 rounded-lg overflow-hidden">
            <button type="button" onClick={() => setAdvancedOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
              <span>Configurações avançadas</span>
              {advancedOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {advancedOpen && (
              <div className="px-3 pb-3 space-y-3 border-t border-zinc-700 pt-3">
                <div className="space-y-1">
                  <Label className="text-zinc-400 font-mono text-xs">Data agendada</Label>
                  <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-zinc-400 font-mono text-xs">Início (HH:MM)</Label>
                    <Input type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); handleTimeChange(e.target.value, estimatedDuration, endTime); }} className="bg-zinc-800 border-zinc-700 text-white" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-400 font-mono text-xs">Fim (HH:MM)</Label>
                    <Input type="time" value={endTime} onChange={(e) => {
                      setEndTime(e.target.value); setTimeError(null); setOverMidnightWarning(false);
                      if (startTime.length === 5 && e.target.value.length === 5) {
                        const v = validateTimeRange(startTime, e.target.value);
                        if (!v.valid) setTimeError(v.error ?? null);
                        else setEstimatedDuration(String(calculateDuration(startTime, e.target.value)));
                      }
                    }} className="bg-zinc-800 border-zinc-700 text-white" />
                  </div>
                </div>
                {timeError && <p className="text-red-400 text-xs font-mono">{timeError}</p>}
                {overMidnightWarning && <p className="text-yellow-400 text-xs font-mono">⚠ A tarefa ultrapassa meia-noite</p>}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-zinc-400 font-mono text-xs">Duração (min)</Label>
                    <Input type="number" min={1} max={1440} placeholder="1–1440" value={estimatedDuration}
                      onChange={(e) => { setEstimatedDuration(e.target.value); handleTimeChange(startTime, e.target.value, endTime); }} className="bg-zinc-800 border-zinc-700 text-white" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-400 font-mono text-xs">Descanso (min)</Label>
                    <Input type="number" min={1} max={60} placeholder="5" value={restTime} onChange={(e) => setRestTime(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-400 font-mono text-xs">Recorrência</Label>
                  <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as RecurrenceOption)}
                    className="w-full h-8 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 text-sm text-white outline-none">
                    <option>Sem recorrência</option>
                    <option>Diária</option>
                    <option>Semanal</option>
                    <option>Período específico</option>
                  </select>
                </div>

                {/* Campos extras de recorrência */}
                {recurrence !== "Sem recorrência" && (
                  <div className="space-y-2 border border-zinc-700/50 rounded-lg p-2.5 bg-zinc-900/50">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Período da recorrência</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-zinc-400 font-mono text-xs">De</Label>
                        <Input type="date" value={recurrenceStartDate}
                          onChange={(e) => setRecurrenceStartDate(e.target.value)}
                          className="bg-zinc-800 border-zinc-700 text-white text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-zinc-400 font-mono text-xs">Até</Label>
                        <Input type="date" value={recurrenceEndDate}
                          onChange={(e) => setRecurrenceEndDate(e.target.value)}
                          className="bg-zinc-800 border-zinc-700 text-white text-xs" />
                      </div>
                    </div>
                    {recurrence === "Semanal" && (
                      <div className="space-y-1">
                        <Label className="text-zinc-400 font-mono text-xs">Dias da semana</Label>
                        <div className="flex gap-1 flex-wrap">
                          {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((day, i) => (
                            <button key={i} type="button"
                              onClick={() => setWeekdaySelection((prev) =>
                                prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i]
                              )}
                              className={`px-2 py-1 rounded text-[10px] font-bold font-mono border transition-colors ${
                                weekdaySelection.includes(i)
                                  ? "bg-red-600 border-red-500 text-white"
                                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"
                              }`}>
                              {day}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {conflictError && <p className="text-red-400 text-xs font-mono bg-red-500/10 border border-red-500/20 rounded px-3 py-2">🚫 {conflictError}</p>}
          <Button onClick={createTask} disabled={creating || !newTitle.trim() || !!timeError} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold uppercase">
            {creating ? "Adicionando..." : "Largar 🏁"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      {xpToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white font-black text-lg px-6 py-3 rounded-full shadow-xl animate-bounce">
          {xpToast}
        </div>
      )}

      {/* ── HEADER ── */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-zinc-900 pb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight">
            Box #{user?.name?.slice(0, 2).toUpperCase() ?? "F1"}
          </h1>
          <p className="text-zinc-400 text-xs font-mono">Piloto: {user?.name ?? "Convidado"} | Em pista</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="w-full sm:w-56 bg-zinc-900 p-2.5 rounded-lg border border-zinc-800">
            <div className="flex justify-between text-xs font-mono mb-1">
              <span>Nível {currentLevel}</span>
              <span className="text-red-500 font-bold">{xpIntoLevel} / {XP_PER_LEVEL} XP</span>
            </div>
            <Progress value={xpProgress} className="h-1.5 bg-zinc-800 [&>div]:bg-red-600" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => signOut()} className="text-zinc-400 hover:text-red-500">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* ── MAIN GRID ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-6">

        {/* ── LEFT COLUMN: Calendar + List ── */}
        <div className="space-y-4">

          {/* View toggle + actions */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
              <button onClick={() => setMainView("calendar")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold font-mono transition-colors ${mainView === "calendar" ? "bg-red-600 text-white" : "text-zinc-400 hover:text-white"}`}>
                <CalendarDays className="h-3.5 w-3.5" /> Calendário
              </button>
              <button onClick={() => setMainView("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold font-mono transition-colors ${mainView === "list" ? "bg-red-600 text-white" : "text-zinc-400 hover:text-white"}`}>
                <List className="h-3.5 w-3.5" /> Lista
              </button>
            </div>
            <Button size="sm" onClick={() => openNewTask()} className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs h-8">
              <Plus className="mr-1 h-3.5 w-3.5" /> Nova Tarefa
            </Button>
          </div>

          {/* ── CALENDAR VIEW ── */}
          {mainView === "calendar" && (
            <Card className="bg-zinc-900 border-zinc-800 text-white">
              <CardHeader className="pb-3 border-b border-zinc-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex gap-1">
                    {(["monthly", "weekly"] as const).map((v) => (
                      <Button key={v} size="sm"
                        onClick={() => setCalendarView(v)}
                        className={`text-xs font-bold ${calendarView === v ? "bg-red-600 hover:bg-red-700 text-white" : "text-zinc-400 hover:text-white bg-transparent"}`}>
                        {v === "monthly" ? "Mensal" : "Semanal"}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={navPrev} className="text-zinc-400 hover:text-white h-7 w-7 p-0">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-mono text-zinc-200 min-w-[160px] text-center capitalize">{periodLabel}</span>
                    <Button size="sm" variant="ghost" onClick={navNext} className="text-zinc-400 hover:text-white h-7 w-7 p-0">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-3">
                {calLoading && <div className="text-zinc-600 font-mono text-sm py-8 text-center">Carregando telemetria...</div>}
                {!calLoading && calError && (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <p className="text-red-400 font-mono text-sm text-center">⚠️ {calError}</p>
                    <Button size="sm" variant="outline" onClick={() => fetchCalendar(calendarView, referenceDate)} className="border-zinc-700 text-zinc-300 hover:text-white text-xs">Tentar novamente</Button>
                  </div>
                )}
                {!calLoading && !calError && (
                  calendarView === "monthly"
                    ? <MonthlyView referenceDate={referenceDate} tasksByDay={tasksByDay}
                        onDayClick={(key) => openNewTask(key)}
                        onTaskClick={(t, key) => setPopoverKey((p) => p === key ? null : key)}
                        popoverKey={popoverKey} onClosePopover={() => setPopoverKey(null)}
                        onStartPomodoro={handleStartPomodoroFromCalendar}
                        onCompleteTask={completeTask} />
                    : <WeeklyView referenceDate={referenceDate} tasksByDay={tasksByDay}
                        onTaskClick={(t, key) => setPopoverKey((p) => p === key ? null : key)}
                        popoverKey={popoverKey} onClosePopover={() => setPopoverKey(null)}
                        onStartPomodoro={handleStartPomodoroFromCalendar}
                        onCompleteTask={completeTask} />
                )}
              </CardContent>
            </Card>
          )}

          {/* ── LIST VIEW ── */}
          {mainView === "list" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Flag className="text-red-600 h-4 w-4" />
                <span className="text-sm font-bold uppercase tracking-wider text-zinc-300">Ordem de Corrida</span>
                <span className="text-zinc-600 text-xs font-mono">({pendingTasks.length})</span>
              </div>

              {loadingTasks ? (
                <div className="text-zinc-600 font-mono text-sm py-8 text-center">Carregando telemetria...</div>
              ) : pendingTasks.length === 0 ? (
                <div className="text-zinc-600 font-mono text-sm py-8 text-center border border-dashed border-zinc-800 rounded-lg">
                  Nenhuma tarefa na fila.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {pendingTasks.map((task) => {
                    const style = DIFFICULTY_STYLE[task.difficulty] ?? DIFFICULTY_STYLE.SOFT;
                    const hasTimeInfo = task.startTime != null || task.estimatedDuration != null;
                    const isActive = activeTaskId === task.id;
                    return (
                      <Card key={task.id} className={`bg-zinc-900 border-zinc-800 text-white border-l-4 ${style.border}`}>
                        <CardContent className="p-4 flex flex-col gap-3">
                          <div className="flex justify-between items-start gap-2">
                            <span className="font-bold text-sm line-clamp-2 flex items-center gap-1.5">
                              {task.recurrenceSeriesId && <RotateCcw className="h-3 w-3 shrink-0 text-zinc-400" />}
                              {task.title}
                            </span>
                            <Badge className={`font-mono border text-[10px] shrink-0 ${style.badge}`}>{task.difficulty}</Badge>
                          </div>
                          {hasTimeInfo && (
                            <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-2">
                              {task.startTime && task.endTime ? <span>{task.startTime}–{task.endTime}</span> : task.startTime ? <span>{task.startTime}</span> : null}
                              {task.estimatedDuration && <span className="text-zinc-500">{task.estimatedDuration} min</span>}
                            </div>
                          )}
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-mono text-zinc-500">+{XP_MAP[task.difficulty]} XP</span>
                            <div className="flex gap-1.5 flex-wrap justify-end">
                              <Button size="sm" variant="ghost"
                                className={`h-7 text-[10px] font-bold px-2 ${isActive ? "text-red-500" : "text-zinc-500 hover:text-red-400"}`}
                                onClick={() => {
                                  const cfg = initPomodoroFromTask({ estimatedDuration: task.estimatedDuration ?? null, restTime: task.restTime ?? null });
                                  setSecondsLeft(cfg.focusMinutes * 60); setActiveTaskId(task.id); setRunning(true);
                                }}>
                                <Timer className="h-3 w-3 mr-1" />{isActive ? "Ativo" : "Pomodoro"}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-zinc-600 hover:text-red-500" onClick={() => deleteTask(task.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              <Button size="sm" className="h-7 text-[10px] font-bold bg-red-600 hover:bg-red-700 text-white px-2" onClick={() => completeTask(task.id)}>
                                <CheckCircle className="h-3 w-3 mr-1" />Completar
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {completedTasks.length > 0 && (
                <div className="space-y-2 mt-2">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-zinc-600 flex items-center gap-1.5">
                    <CheckCircle className="h-3 w-3" /> Completadas ({completedTasks.length})
                  </p>
                  {completedTasks.map((t) => (
                    <div key={t.id} className="flex justify-between items-center px-4 py-2 rounded bg-zinc-900/50 border border-zinc-800/50">
                      <span className="text-sm text-zinc-600 line-through">{t.title}</span>
                      <Badge className="bg-green-500/10 text-green-600 border-green-500/20 font-mono text-[10px]">✓ +{XP_MAP[t.difficulty as keyof typeof XP_MAP] ?? 100} XP</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div className="space-y-4">
          {/* Pomodoro */}
          <Card className="bg-zinc-900 border-zinc-800 text-white text-center">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-zinc-400 flex items-center justify-center gap-2">
                <Timer className="h-4 w-4 text-red-500" /> Pit Stop #{pomodoroSession}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-4xl font-black font-mono tracking-wider my-2 ${running ? "text-red-500" : "text-white"}`}>
                {formatTime(secondsLeft)}
              </div>
              <div className="flex gap-2 justify-center mt-3">
                <Button size="sm" onClick={() => setRunning((r) => !r)} className="bg-red-600 hover:bg-red-700 text-white text-xs px-4 font-bold">
                  {running ? <><Pause className="h-3 w-3 mr-1" />Pausar</> : <><Play className="h-3 w-3 mr-1" />{secondsLeft > 0 && secondsLeft < POMODORO_MINUTES * 60 ? "Retomar" : "Iniciar"}</>}
                </Button>
                <Button size="sm" variant="ghost" onClick={resetPomodoro} className="text-zinc-500 hover:text-white text-xs">
                  <RotateCcw className="h-3 w-3 mr-1" />Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Ranking */}
          <Card className="bg-zinc-900 border-zinc-800 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-500" /> Mundial
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 font-mono text-sm">
              {ranking.length === 0 ? (
                <p className="text-zinc-600 text-xs">Adicione amigos para ver o ranking</p>
              ) : ranking.map((u, i) => {
                const isMe = u.id === user?.id;
                return (
                  <div key={u.id} className={`flex justify-between items-center py-1 ${i < ranking.length - 1 ? "border-b border-zinc-800" : ""} ${isMe ? "text-yellow-400 font-bold" : "text-zinc-400"}`}>
                    <span>{i + 1}. {u.name?.split(" ")[0] ?? "Piloto"}{isMe && " ★"}</span>
                    <span>{u.xp} pts</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Amigos */}
          <Card className="bg-zinc-900 border-zinc-800 text-white">
            <CardHeader className="pb-2 cursor-pointer" onClick={() => setFriendsOpen((o) => !o)}>
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-zinc-400 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-red-500" />
                  Equipe
                  {friendRequests.length > 0 && (
                    <span className="bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      {friendRequests.length}
                    </span>
                  )}
                </span>
                {friendsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </CardTitle>
            </CardHeader>
            {friendsOpen && (
              <CardContent className="space-y-3 pt-0">
                {/* Adicionar amigo */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Email do piloto"
                    value={friendEmail}
                    onChange={(e) => setFriendEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addFriend()}
                    className="bg-zinc-800 border-zinc-700 text-white text-xs h-7 flex-1"
                  />
                  <Button size="sm" onClick={addFriend} disabled={addingFriend || !friendEmail.trim()}
                    className="bg-red-600 hover:bg-red-700 text-white h-7 w-7 p-0">
                    <UserPlus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {friendMsg && (
                  <p className={`text-xs font-mono ${friendMsg.ok ? "text-green-400" : "text-red-400"}`}>
                    {friendMsg.text}
                  </p>
                )}

                {/* Pedidos recebidos */}
                {friendRequests.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Pedidos recebidos</p>
                    {friendRequests.map((req) => (
                      <div key={req.friendshipId} className="flex items-center justify-between gap-2 bg-zinc-800/50 rounded px-2 py-1.5">
                        <span className="text-xs text-zinc-300 truncate">{req.name ?? req.email}</span>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => respondRequest(req.friendshipId, "accept")}
                            className="text-green-400 hover:text-green-300 p-1" title="Aceitar">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => respondRequest(req.friendshipId, "reject")}
                            className="text-red-400 hover:text-red-300 p-1" title="Rejeitar">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Amigos aceitos */}
                {friends.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Na equipe</p>
                    {friends.map((f) => (
                      <div key={f.friendshipId} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-zinc-300 truncate">
                          {f.name?.split(" ")[0] ?? f.email}
                          {f.xp != null && <span className="text-zinc-500 ml-1">{f.xp} XP</span>}
                        </span>
                        <button onClick={() => removeFriend(f.friendshipId)}
                          className="text-zinc-600 hover:text-red-400 p-1 shrink-0" title="Remover">
                          <UserMinus className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {friends.length === 0 && friendRequests.length === 0 && sentRequests.length === 0 && (
                  <p className="text-zinc-600 text-xs text-center py-2">Nenhum companheiro de equipe ainda</p>
                )}

                {/* Enviados */}
                {sentRequests.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Aguardando resposta</p>
                    {sentRequests.map((s) => (
                      <div key={s.friendshipId} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-zinc-500 truncate">{s.name ?? s.email}</span>
                        <button onClick={() => removeFriend(s.friendshipId)}
                          className="text-zinc-600 hover:text-red-400 p-1 shrink-0" title="Cancelar">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* Stats */}
          <Card className="bg-zinc-900 border-zinc-800 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-zinc-400">Telemetria</CardTitle>
            </CardHeader>
            <CardContent className="font-mono text-sm space-y-2">
              {[
                { label: "Tarefas ativas", value: pendingTasks.length, color: "text-white" },
                { label: "Completadas", value: completedTasks.length, color: "text-green-400" },
                { label: "XP Total", value: currentXp, color: "text-red-400" },
                { label: "Nível", value: currentLevel, color: "text-yellow-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between text-zinc-400">
                  <span>{label}</span><span className={`font-bold ${color}`}>{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {TaskDialog}
    </div>
  );
}
