// Tabela de rotas do app. Mantida em sincronia com APP_ROUTE_PREFIXES (servidor e Service Worker).
export const ROTAS = [
  { path: "/", nome: "raiz", publica: true, carregar: null },
  { path: "/entrar", nome: "entrar", publica: true, somenteVisitante: true, carregar: () => import("./views/entrar.js") },
  { path: "/cadastro", nome: "cadastro", publica: true, somenteVisitante: true, carregar: () => import("./views/cadastro.js") },
  { path: "/inicio", nome: "inicio", carregar: () => import("./views/inicio.js") },
  { path: "/classes", nome: "classes", carregar: () => import("./views/classes.js") },
  { path: "/classes/:classId", nome: "classe", carregar: () => import("./views/classe.js") },
  { path: "/classes/:classId/notas/:noteId", nome: "anotacao", cheio: true, carregar: () => import("./views/anotacao.js") },
  { path: "/classes/:classId/forum", nome: "classe-forum", carregar: () => import("./views/forum.js") },
  { path: "/classes/:classId/cartoes", nome: "classe-cartoes", carregar: () => import("./views/classe-cartoes.js") },
  { path: "/classes/:classId/membros", nome: "classe-membros", carregar: () => import("./views/membros.js") },
  { path: "/classes/:classId/configuracao", nome: "classe-configuracao", carregar: () => import("./views/classe-configuracao.js") },
  { path: "/cartoes", nome: "cartoes", carregar: () => import("./views/cartoes.js") },
  { path: "/foco", nome: "foco", carregar: () => import("./views/foco.js") },
  { path: "/conta", nome: "conta", carregar: () => import("./views/conta.js") },
];

// Navegação lateral (desktop) e inferior (celular).
export const NAVEGACAO = [
  { path: "/inicio", rotulo: "Início", icone: "inicio", lateral: true, inferior: true },
  { path: "/classes", rotulo: "Minhas classes", rotuloCurto: "Classes", icone: "classes", lateral: true, inferior: true },
  { path: "/cartoes", rotulo: "Flashcards", rotuloCurto: "Cartões", icone: "cartoes", lateral: true, inferior: true },
  { path: "/foco", rotulo: "Foco", icone: "foco", lateral: true, inferior: false },
  { path: "/conta", rotulo: "Conta", rotuloCurto: "Perfil", icone: "perfil", lateral: false, inferior: true },
];
