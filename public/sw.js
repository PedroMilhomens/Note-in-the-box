const CACHE_NAME = "note-in-the-box-shell-v6";
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
  "/assets/logo-64.png",
  "/assets/logo-192.png",
  "/assets/logo-512.png",
  "/assets/fonts/inter-400.ttf",
  "/assets/fonts/inter-600.ttf",
  "/assets/fonts/space-grotesk-500.ttf",
  "/assets/fonts/space-grotesk-700.ttf",
  "/css/screens.css",
  "/css/tokens.css",
  "/css/base.css",
  "/css/components.css",
  "/css/notes.css",
  "/css/forum.css",
  "/css/flashcards.css",
  "/css/pomodoro.css",
  "/css/meus-dados.css",
  "/js/app.js",
  "/js/api.js",
  "/js/router-client.js",
  "/js/routes.js",
  "/js/store.js",
  "/js/auth-validation.js",
  "/js/components/auth-form.js",
  "/js/components/campo.js",
  "/js/components/dom.js",
  "/js/components/icones.js",
  "/js/components/layout.js",
  "/js/components/placeholder.js",
  "/js/components/toast.js",
  "/js/views/entrar.js",
  "/js/views/cadastro.js",
  "/js/views/inicio.js",
  "/js/views/classes.js",
  "/js/views/classe.js",
  "/js/views/cartoes.js",
  "/js/views/foco.js",
  "/js/views/conta.js",
  "/js/views/nao-encontrada.js",
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
// Rotas do app de página única: usam o shell em cache ("/"). Mantida em sincronia com o servidor.
const APP_ROUTE_PREFIXES = ["/entrar", "/cadastro", "/inicio", "/classes", "/cartoes", "/foco", "/conta"];
function isAppRoute(pathname) {
  return APP_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
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

  const cachePath = url.pathname === "/" || isAppRoute(url.pathname) ? "/" : url.pathname;
  if (!SHELL_PATH_SET.has(cachePath)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cacheKey = new Request(`${self.location.origin}${cachePath}`);
    // Rede primeiro, para que alterações apareçam sem trocar a versão do cache;
    // sem conexão, usa a cópia guardada (abertura offline).
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        await cache.put(cacheKey, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
      throw error;
    }
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
