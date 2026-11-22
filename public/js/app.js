import { createApi } from "./api.js";
import { createRouter, safeNextPath } from "./router-client.js";
import { getSessao, setSessao } from "./store.js";
import { renderCheio, renderLayout, renderPublico } from "./components/layout.js";
import { toast } from "./components/toast.js";
import { ROTAS } from "./routes.js";

const raiz = document.querySelector("#app");
const TITULO_BASE = "Note in the box";
let roteador;

const api = createApi({
  onUnauthorized: () => {
    setSessao({ user: null, classes: [] });
    if (roteador) void roteador.navegar("/entrar", { replace: true });
  },
});

async function atualizarClasses() {
  try {
    const { classes } = await api.get("/api/classes?limit=100");
    setSessao({ classes });
    return classes;
  } catch {
    return getSessao().classes;
  }
}

async function carregarSessao() {
  try {
    const { user } = await api.get("/api/me", { semRedirecionar: true });
    setSessao({ user, offline: false });
    await atualizarClasses();
  } catch (erro) {
    setSessao({ user: null, classes: [], offline: erro.status === 0 });
  }
}

function montar({ publica, cheio, url, modulo, visao }) {
  const sessao = getSessao();
  const principal = publica
    ? renderPublico(raiz)
    : cheio ? renderCheio(raiz) : renderLayout(raiz, { pathname: url.pathname, offline: sessao.offline, user: sessao.user, classes: sessao.classes });
  principal.append(visao);
  document.title = `${modulo.titulo ?? TITULO_BASE} · ${TITULO_BASE}`;
  principal.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function tratar({ match, url, isStale }) {
  const sessao = getSessao();
  const logado = Boolean(sessao.user);

  if (match?.rota.nome === "raiz") {
    await roteador.navegar(logado ? "/inicio" : "/entrar", { replace: true });
    return;
  }
  if (match && !match.rota.publica && !logado && !sessao.offline) {
    const volta = encodeURIComponent(`${url.pathname}${url.search}`);
    await roteador.navegar(`/entrar?next=${volta}`, { replace: true });
    return;
  }
  if (match?.rota.somenteVisitante && logado) {
    await roteador.navegar(safeNextPath(url.searchParams.get("next")) ?? "/inicio", { replace: true });
    return;
  }

  const modulo = await (match ? match.rota.carregar() : import("./views/nao-encontrada.js"));
  const visao = await modulo.render({
    params: match?.params ?? {},
    url,
    api,
    user: sessao.user,
    navegar: roteador.navegar,
    atualizarClasses,
    toast,
  });
  if (isStale()) return;
  montar({ publica: Boolean(match?.rota.publica), cheio: Boolean(match?.rota.cheio), url, modulo, visao });
}

roteador = createRouter({
  routes: ROTAS,
  handle: (contexto) => tratar(contexto).catch(() => {
    toast("Não foi possível carregar a tela. Tente novamente.", { tipo: "erro" });
  }),
});

await carregarSessao();
await roteador.iniciar();
