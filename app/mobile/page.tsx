"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, Timer, RotateCcw, Wifi, WifiOff, Play, Pause, Flag } from "lucide-react";
import { initPomodoroFromTask } from "@/lib/pomodoro-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Task = {
  id: string;
  title: string;
  difficulty: "SOFT" | "MEDIUM" | "HARD";
  status: string;
  startTime?: string | null;
  endTime?: string | null;
  estimatedDuration?: number | null;
  restTime?: number | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DIFF_COLOR = {
  SOFT: "border-red-500 bg-red-500/10",
  MEDIUM: "border-yellow-500 bg-yellow-500/10",
  HARD: "border-purple-500 bg-purple-500/10",
};
const DIFF_LABEL = { SOFT: "🔴 SOFT", MEDIUM: "🟡 MEDIUM", HARD: "🟣 HARD" };
const XP_MAP = { SOFT: 100, MEDIUM: 200, HARD: 300 };

// ─── PWA SW Registration ──────────────────────────────────────────────────────

function usePWA() {
  const [isOnline, setIsOnline] = useState(true);
  const [syncedIds, setSyncedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          reg.update();
          // Listen for sync confirmations
          navigator.serviceWorker.addEventListener("message", (e) => {
            if (e.data?.type === "TASK_SYNCED") {
              setSyncedIds((prev) => new Set([...prev, e.data.taskId]));
            }
          });
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return { isOnline, syncedIds };
}

// ─── Pomodoro Component ───────────────────────────────────────────────────────

function PomodoroTimer({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
}) {
  const cfg = initPomodoroFromTask({
    estimatedDuration: task.estimatedDuration ?? null,
    restTime: task.restTime ?? null,
  });

  const [phase, setPhase] = useState<"focus" | "rest">("focus");
  const [secondsLeft, setSecondsLeft] = useState(cfg.focusMinutes * 60);
  const [running, setRunning] = useState(false);
  const [session, setSession] = useState(1);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (phase === "focus") {
            setPhase("rest");
            setRunning(false);
            return cfg.restMinutes * 60;
          } else {
            setPhase("focus");
            setSession((n) => n + 1);
            setRunning(false);
            return cfg.focusMinutes * 60;
          }
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, phase, cfg]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const pct = phase === "focus"
    ? ((cfg.focusMinutes * 60 - secondsLeft) / (cfg.focusMinutes * 60)) * 100
    : ((cfg.restMinutes * 60 - secondsLeft) / (cfg.restMinutes * 60)) * 100;

  const accentColor = phase === "focus" ? "#ef4444" : "#22c55e";

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center px-6">
      {/* Task title */}
      <p className="text-zinc-400 font-mono text-xs uppercase tracking-widest mb-2">
        {phase === "focus" ? "🏁 Foco" : "☕ Descanso"} · Sessão #{session}
      </p>
      <h2 className="text-white font-bold text-lg text-center mb-10 max-w-xs line-clamp-2">
        {task.title}
      </h2>

      {/* Circular progress */}
      <div className="relative w-52 h-52 mb-10">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="#27272a" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="44" fill="none"
            stroke={accentColor} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 44}`}
            strokeDashoffset={`${2 * Math.PI * 44 * (1 - pct / 100)}`}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-4xl font-black font-mono" style={{ color: running ? accentColor : "white" }}>
            {fmt(secondsLeft)}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-4">
        <button
          onClick={() => setRunning((r) => !r)}
          className="flex items-center gap-2 px-8 py-3 rounded-full font-bold text-white text-sm"
          style={{ backgroundColor: accentColor }}
        >
          {running ? <><Pause className="h-4 w-4" /> Pausar</> : <><Play className="h-4 w-4" /> {secondsLeft < cfg.focusMinutes * 60 ? "Retomar" : "Iniciar"}</>}
        </button>
        <button
          onClick={() => { setRunning(false); setSecondsLeft(cfg.focusMinutes * 60); setPhase("focus"); }}
          className="p-3 rounded-full bg-zinc-800 text-zinc-400 hover:text-white"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <button onClick={onClose} className="mt-8 text-zinc-500 text-sm hover:text-zinc-300">
        ← Voltar às tarefas
      </button>
    </div>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onComplete,
  onPomodoro,
  completing,
}: {
  task: Task;
  onComplete: (id: string) => void;
  onPomodoro: (task: Task) => void;
  completing: boolean;
}) {
  const isDone = task.status === "COMPLETED";
  const color = DIFF_COLOR[task.difficulty] ?? DIFF_COLOR.SOFT;

  return (
    <div
      className={`rounded-2xl border-l-4 p-4 transition-all ${
        isDone ? "opacity-50 border-green-500 bg-green-500/10" : color
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-base leading-snug">{task.title}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-[11px] font-mono text-zinc-500">{DIFF_LABEL[task.difficulty]}</span>
            {task.startTime && (
              <span className="text-[11px] font-mono text-zinc-500">
                ⏰ {task.startTime}{task.endTime ? `–${task.endTime}` : ""}
              </span>
            )}
            {task.estimatedDuration && !task.startTime && (
              <span className="text-[11px] font-mono text-zinc-500">⏱ {task.estimatedDuration} min</span>
            )}
          </div>
        </div>

        {isDone ? (
          <CheckCircle className="h-6 w-6 text-green-500 shrink-0 mt-0.5" />
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onPomodoro(task)}
              className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-red-400 transition-colors"
              title="Iniciar Pomodoro"
            >
              <Timer className="h-4 w-4" />
            </button>
            <button
              onClick={() => onComplete(task.id)}
              disabled={completing}
              className="p-2 rounded-xl bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-50"
              title="Concluir"
            >
              <CheckCircle className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MobilePage() {
  const { isOnline, syncedIds } = usePWA();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [pomodoroTask, setPomodoroTask] = useState<Task | null>(null);
  const [xpToast, setXpToast] = useState<string | null>(null);

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long",
  });

  const fetchTasks = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/tasks/today");
      if (res.ok) setTasks(await res.json());
      else throw new Error(`Erro ${res.status}`);
    } catch (e) {
      setError("Sem conexão. Mostrando cache.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Quando voltar online, faz refetch para pegar tasks sincronizadas
  useEffect(() => {
    if (isOnline) fetchTasks();
  }, [isOnline, fetchTasks]);

  // Atualiza task quando confirmada pelo service worker
  useEffect(() => {
    syncedIds.forEach((taskId) => {
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "COMPLETED" } : t));
    });
  }, [syncedIds]);

  const completeTask = async (taskId: string) => {
    // Atualização otimista imediata
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "COMPLETED" } : t));
    setCompletingId(taskId);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });

      if (res.ok) {
        const data = await res.json();
        if (!data.offline) {
          setXpToast(`+${data.xpGained} XP 🏁`);
          setTimeout(() => setXpToast(null), 2500);
        } else {
          setXpToast("✓ Salvo offline — sincronizará em breve");
          setTimeout(() => setXpToast(null), 3000);
        }
      }
    } catch {
      // O service worker capturou e salvou offline
    } finally {
      setCompletingId(null);
    }
  };

  const pending = tasks.filter((t) => t.status !== "COMPLETED");
  const done = tasks.filter((t) => t.status === "COMPLETED");

  if (pomodoroTask) {
    return <PomodoroTimer task={pomodoroTask} onClose={() => setPomodoroTask(null)} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Status bar */}
      <div className={`flex items-center justify-center gap-1.5 py-2 text-[11px] font-mono transition-colors ${isOnline ? "bg-zinc-900 text-zinc-500" : "bg-yellow-500/20 text-yellow-400"}`}>
        {isOnline
          ? <><Wifi className="h-3 w-3" /> Online</>
          : <><WifiOff className="h-3 w-3" /> Offline — conclusões salvas localmente</>}
      </div>

      {/* XP Toast */}
      {xpToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white font-black text-base px-5 py-2.5 rounded-full shadow-xl">
          {xpToast}
        </div>
      )}

      {/* Header */}
      <header className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Flag className="h-5 w-5 text-red-500" />
          <h1 className="text-xl font-black uppercase tracking-tight">Pit Stop do Dia</h1>
        </div>
        <p className="text-zinc-400 text-sm capitalize">{today}</p>
        <div className="flex items-center gap-3 mt-3 font-mono text-xs text-zinc-500">
          <span>🏁 {pending.length} pendentes</span>
          <span>✅ {done.length} concluídas</span>
        </div>
      </header>

      {/* Content */}
      <main className="px-5 pb-24 space-y-3">
        {loading && (
          <div className="text-center text-zinc-600 font-mono text-sm py-12">
            Carregando telemetria...
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-6 space-y-3">
            <p className="text-yellow-400 font-mono text-sm">{error}</p>
            <button onClick={fetchTasks} className="text-zinc-400 text-sm underline">Tentar novamente</button>
          </div>
        )}

        {!loading && !error && tasks.length === 0 && (
          <div className="text-center py-16 text-zinc-600 font-mono text-sm">
            Nenhuma tarefa para hoje. 🏆
          </div>
        )}

        {/* Pendentes */}
        {pending.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onComplete={completeTask}
            onPomodoro={(t) => setPomodoroTask(t)}
            completing={completingId === task.id}
          />
        ))}

        {/* Concluídas */}
        {done.length > 0 && (
          <div className="pt-2 space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-widest text-zinc-600 flex items-center gap-1.5">
              <CheckCircle className="h-3 w-3" /> Concluídas ({done.length})
            </p>
            {done.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onComplete={completeTask}
                onPomodoro={(t) => setPomodoroTask(t)}
                completing={false}
              />
            ))}
          </div>
        )}
      </main>

      {/* Bottom nav hint */}
      <div className="fixed bottom-0 inset-x-0 bg-zinc-950/90 backdrop-blur border-t border-zinc-800 px-5 py-3 flex justify-center">
        <a href="/dashboard" className="text-zinc-500 text-xs font-mono hover:text-zinc-300 transition-colors">
          ← Voltar ao Dashboard completo
        </a>
      </div>
    </div>
  );
}
