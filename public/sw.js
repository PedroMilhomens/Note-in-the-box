const CACHE_NAME = "note-in-the-box-shell-v1";
const CACHE_PREFIX = "note-in-the-box-";
const SHELL_PATHS = [
  "/",
  "/notes.html",
  "/forum.html",
  "/flashcards.html",
  "/pomodoro.html",
  "/meus-dados.html",
  "/privacidade.html",
  "/termos.html",
  "/manifest.webmanifest",
  "/assets/pwa-icon.svg",
  "/css/notes.css",
  "/css/forum.css",
  "/css/flashcards.css",
  "/css/pomodoro.css",
  "/css/meus-dados.css",
  "/js/pwa.js",
  "/js/offline-store.js",
  "/js/offline-sync.js",
  "/js/notes.js",
  "/js/forum.js",
  "/js/flashcards.js",
  "/js/pomodoro.js",
  "/js/pomodoro-state.js",
  "/js/pomodoro-worker.js",
  "/js/meus-dados.js",
];
const SHELL_PATH_SET = new Set(SHELL_PATHS);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_PATHS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (
    url.origin !== self.location.origin
    || url.pathname === "/api"
    || url.pathname.startsWith("/api/")
  ) {
    return;
  }

  const cachePath = url.pathname === "/" ? "/" : url.pathname;
  if (!SHELL_PATH_SET.has(cachePath)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cacheKey = new Request(`${self.location.origin}${cachePath}`);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      await cache.put(cacheKey, response.clone());
    }
    return response;
  })());
});

self.addEventListener("push", (event) => {
  event.waitUntil(self.registration.showNotification("Note in the box", {
    body: "Você tem uma atualização.",
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/notes.html"));
});
