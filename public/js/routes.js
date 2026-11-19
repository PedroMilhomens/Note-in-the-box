// Tabela de rotas do app. Mantida em sincronia com APP_ROUTE_PREFIXES (servidor e Service Worker).
export const ROTAS = [
  { path: "/", nome: "raiz", publica: true, carregar: null },
  { path: "/entrar", nome: "entrar", publica: true, somenteVisitante: true, carregar: () => import("./views/entrar.js") },
  { path: "/cadastro", nome: "cadastro", publica: true, somenteVisitante: true, carregar: () => import("./views/cadastro.js") },
  { path: "/inicio", nome: "inicio", carregar: () => import("./views/inicio.js") },
  { path: "/classes", nome: "classes", carregar: () => import("./views/classes.js") },
  { path: "/classes/:classId", nome: "classe", carregar: () => import("./views/classe.js") },
  { path: "/cartoes", nome: "cartoes", carregar: () => import("./views/cartoes.js") },
  { path: "/foco", nome: "foco", carregar: () => import("./views/foco.js") },
  { path: "/conta", nome: "conta", carregar: () => import("./views/conta.js") },
];

export const NAVEGACAO = [
  { path: "/inicio", rotulo: "Início" },
  { path: "/classes", rotulo: "Classes" },
  { path: "/cartoes", rotulo: "Cartões" },
  { path: "/foco", rotulo: "Foco" },
  { path: "/conta", rotulo: "Conta", somenteDesktop: true },
];
