import { campo } from "../components/campo.js";
import { h } from "../components/dom.js";
import { abrirDialogo } from "../components/nota/dialogo.js";
import { clearOfflineData } from "../offline-store.js";
import { setSessao } from "../store.js";

export const titulo = "Conta";

const TITULO_CONSENTIMENTO = { termos: "Termos de Uso", privacidade: "Política de Privacidade" };
const quando = (valor) => new Date(valor).toLocaleString("pt-BR");

export async function render({ api, toast }) {
  let usuario;
  let consentimentos;
  try {
    [{ user: usuario }, { consents: consentimentos }] = await Promise.all([
      api.get("/api/me"), api.get("/api/me/consents"),
    ]);
  } catch (erro) {
    return h("section", {}, h("h1", {}, "Conta"),
      h("p", { class: "aviso aviso-erro", role: "alert" },
        erro.status === 0 ? "Sem conexão. Seus dados de conta só ficam disponíveis online." : erro.message));
  }

  // ---- perfil ----
  const campos = {
    name: campo({ id: "perfil-nome", rotulo: "Nome", nome: "name", autocomplete: "name", maxlength: 100 }),
    email: campo({ id: "perfil-email", rotulo: "E-mail", nome: "email", tipo: "email", autocomplete: "email", maxlength: 254 }),
    institution: campo({ id: "perfil-instituicao", rotulo: "Instituição (opcional)", nome: "institution", autocomplete: "organization", maxlength: 120 }),
    course: campo({ id: "perfil-curso", rotulo: "Curso (opcional)", nome: "course", maxlength: 120 }),
  };
  for (const [chave, c] of Object.entries(campos)) c.input.value = usuario[chave] ?? "";
  const salvar = h("button", { class: "btn", type: "submit" }, "Salvar alterações");
  const formPerfil = h("form", { class: "card conta-bloco", novalidate: true, "aria-labelledby": "conta-perfil" },
    h("h2", { id: "conta-perfil" }, "Seus dados"),
    ...Object.values(campos).map((c) => c.raiz), salvar);
  formPerfil.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    salvar.disabled = true;
    try {
      const { user } = await api.patch("/api/me", Object.fromEntries(
        Object.entries(campos).map(([chave, c]) => [chave, c.input.value])));
      for (const [chave, c] of Object.entries(campos)) c.input.value = user[chave] ?? "";
      setSessao({ user });
      toast("Seus dados foram atualizados.", { tipo: "sucesso" });
    } catch (erro) {
      toast(erro.message, { tipo: "erro" });
    } finally { salvar.disabled = false; }
  });

  // ---- consentimentos ----
  const listaConsentimentos = h("ul", { class: "lista-consentimentos" });
  function desenharConsentimentos(lista) {
    listaConsentimentos.replaceChildren(...(lista.length ? lista.map((c) => {
      const nome = TITULO_CONSENTIMENTO[c.kind] ?? c.kind;
      const item = h("li", {},
        h("div", {}, h("strong", {}, nome),
          h("span", { class: "texto-suave" }, c.revokedAt
            ? `Versão ${c.version} · revogado em ${quando(c.revokedAt)}`
            : `Versão ${c.version} · aceito em ${quando(c.grantedAt)}`)),
        c.revokedAt ? null : h("button", { class: "btn btn-secundario", type: "button" }, "Revogar"));
      item.querySelector("button")?.addEventListener("click", async (evento) => {
        evento.currentTarget.disabled = true;
        try {
          await api.patch("/api/me/consents", { kind: c.kind });
          desenharConsentimentos((await api.get("/api/me/consents")).consents);
          toast(`${nome}: revogação registrada.`, { tipo: "sucesso" });
        } catch (erro) { toast(erro.message, { tipo: "erro" }); evento.currentTarget.disabled = false; }
      });
      return item;
    }) : [h("li", { class: "texto-suave" }, "Nenhum consentimento registrado.")]));
  }
  desenharConsentimentos(consentimentos);
  const blocoConsentimentos = h("section", { class: "card conta-bloco", "aria-labelledby": "conta-consent" },
    h("h2", { id: "conta-consent" }, "Consentimentos"), listaConsentimentos,
    h("p", { class: "conta-links" },
      h("a", { href: "/termos.html" }, "Ler os Termos de Uso"), " · ", h("a", { href: "/privacidade.html" }, "Ler a Política de Privacidade")));

  // ---- exportar ----
  const exportar = h("button", { class: "btn btn-secundario", type: "button" }, "Exportar meus dados (JSON)");
  exportar.addEventListener("click", async () => {
    exportar.disabled = true;
    try {
      const dados = await api.get("/api/me/export");
      const texto = typeof dados === "string" ? dados : JSON.stringify(dados, null, 2);
      const endereco = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
      const link = h("a", { href: endereco, download: "meus-dados.json", hidden: true });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(endereco), 1000);
      toast("Exportação preparada.", { tipo: "sucesso" });
    } catch (erro) { toast(erro.message, { tipo: "erro" }); } finally { exportar.disabled = false; }
  });
  const blocoExportar = h("section", { class: "card conta-bloco", "aria-labelledby": "conta-exportar" },
    h("h2", { id: "conta-exportar" }, "Levar seus dados"),
    h("p", { class: "texto-suave" }, "Baixe uma cópia dos seus dados em formato JSON."), exportar);

  // ---- dados offline ----
  const apagarOffline = h("button", { class: "btn btn-secundario", type: "button" }, "Apagar dados offline deste dispositivo");
  apagarOffline.addEventListener("click", () => abrirDialogo({
    titulo: "Apagar dados offline?",
    descricao: "Notas, rascunhos e alterações pendentes guardados neste dispositivo serão removidos. Alterações ainda não sincronizadas serão perdidas.",
    confirmar: "Apagar",
    perigo: true,
    aoConfirmar: async () => {
      await clearOfflineData();
      toast("Dados offline removidos deste dispositivo.", { tipo: "sucesso" });
    },
  }));
  const blocoOffline = h("section", { class: "card conta-bloco", "aria-labelledby": "conta-offline" },
    h("h2", { id: "conta-offline" }, "Neste dispositivo"),
    h("p", { class: "texto-suave" }, "Para trabalhar sem internet, o app guarda cópias das suas notas e rascunhos aqui."), apagarOffline);

  // ---- sessão e exclusão ----
  const sair = h("button", { class: "btn btn-secundario", type: "button", "data-logout": true }, "Sair");
  const status = h("span", { class: "logout-status status", role: "status" });
  const excluir = h("button", { class: "btn btn-perigo", type: "button" }, "Excluir minha conta");
  excluir.addEventListener("click", () => {
    const confirmacao = h("input", { id: "excluir-confirmacao", type: "text", autocomplete: "off", autocapitalize: "characters" });
    abrirDialogo({
      titulo: "Excluir conta",
      descricao: "Sua conta e seus dados serão excluídos conforme a Política de Privacidade. Esta ação não pode ser desfeita.",
      conteudo: [h("div", { class: "campo" }, h("label", { for: "excluir-confirmacao" }, "Digite EXCLUIR para confirmar"), confirmacao)],
      confirmar: "Excluir minha conta",
      perigo: true,
      aoConfirmar: async () => {
        if (confirmacao.value !== "EXCLUIR") throw new Error("Digite EXCLUIR para confirmar.");
        await api.delete("/api/me", { confirmation: confirmacao.value });
        try { await clearOfflineData(); } catch { /* a conta já foi excluída; o app recarrega abaixo */ }
        if ("BroadcastChannel" in globalThis) new BroadcastChannel("note-in-the-box-logout").postMessage("logout");
        setSessao({ user: null, classes: [] });
        window.location.replace("/");
      },
    });
  });
  const blocoSessao = h("section", { class: "card conta-bloco conta-perigo", "aria-labelledby": "conta-sessao" },
    h("h2", { id: "conta-sessao" }, "Sessão e exclusão"),
    h("div", { class: "acoes" }, sair, excluir), status);

  return h("section", { class: "conta" },
    h("h1", {}, "Conta"),
    h("p", { class: "texto-suave" }, `Conectado como ${usuario.name}.`),
    h("div", { class: "conta-grade" }, formPerfil,
      h("div", { class: "conta-coluna" }, blocoConsentimentos, blocoExportar, blocoOffline, blocoSessao)));
}
