// F1 Task Manager — Service Worker
// Cache de assets + offline support para /mobile

const CACHE_VERSION = "f1-v2";
const TASKS_CACHE = "f1-tasks-today";
const PENDING_CACHE = "f1-pending-ops";
const SYNC_TAG = "sync-complete-tasks";

// Assets para pré-cachear (shell do app mobile)
const PRECACHE_URLS = [
  "/mobile",
  "/favicon.png",
];

// ── Install: pré-cacheia o shell ──────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

// ── Activate: limpa caches antigos ───────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION && k !== TASKS_CACHE && k !== PENDING_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: estratégia por tipo de recurso ────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // PATCH /api/tasks/:id — só intercepta quando OFFLINE
  if (request.method === "PATCH" && /^\/api\/tasks\/[^/]+$/.test(url.pathname)) {
    // Se online, deixa passar normalmente para o servidor
    if (navigator.onLine) return;
    event.respondWith(handleTaskComplete(request, url));
    return;
  }

  // GET /api/tasks/today — network-first (não usa cache stale para evitar dados desatualizados)
  if (request.method === "GET" && url.pathname === "/api/tasks/today") {
    event.respondWith(networkFirstWithCache(request, TASKS_CACHE));
    return;
  }

  // Página /mobile — network-first com fallback cache
  if (request.method === "GET" && url.pathname.startsWith("/mobile")) {
    event.respondWith(networkFirstWithCache(request, CACHE_VERSION));
    return;
  }

  // Assets estáticos (_next/static) — cache-first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, CACHE_VERSION));
    return;
  }

  // Demais requests — network-only (APIs de autenticação, etc.)
});

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleTaskComplete(request, url) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch {
    // Offline — salva na fila
    const taskId = url.pathname.split("/").pop();
    const cache = await caches.open(PENDING_CACHE);
    await cache.put(
      new Request(`/pending/${taskId}`),
      new Response(JSON.stringify({ taskId }), {
        headers: { "Content-Type": "application/json" },
      })
    );

    // Registra background sync se disponível
    try {
      await self.registration.sync.register(SYNC_TAG);
    } catch {
      // Background sync não suportado — será sincronizado quando o app abrir
    }

    // Resposta fake de sucesso para o cliente não travar
    return new Response(
      JSON.stringify({
        task: { id: taskId, status: "COMPLETED" },
        xpGained: 0,
        offline: true,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request.clone())
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || (await networkPromise) || new Response("[]", {
    headers: { "Content-Type": "application/json" },
  });
}

async function networkFirstWithCache(request, cacheName) {
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response("Offline", { status: 503 });
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

// ── Background Sync ───────────────────────────────────────────────────────────

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncPendingCompletions());
  }
});

async function syncPendingCompletions() {
  const cache = await caches.open(PENDING_CACHE);
  const keys = await cache.keys();

  for (const request of keys) {
    try {
      const body = await (await cache.match(request)).json();
      if (!body?.taskId) continue;

      const res = await fetch(`/api/tasks/${body.taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
        credentials: "include",
      });

      if (res.ok) {
        await cache.delete(request);
        // Notifica clientes abertos
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        clients.forEach((client) =>
          client.postMessage({ type: "TASK_SYNCED", taskId: body.taskId })
        );
      }
    } catch {
      // Rede ainda indisponível — tenta de novo na próxima sync
    }
  }
}
