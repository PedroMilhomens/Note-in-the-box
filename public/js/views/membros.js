import { mensagemDeErro } from "../auth-validation.js";
import { cabecalhoClasse } from "../components/abas-classe.js";
import { h } from "../components/dom.js";
import { icone } from "../components/icones.js";

export const titulo = "Membros";

const PAPEL = { owner: "Responsável", member: "Membro" };

export async function render({ api, params, user, toast }) {
  let detalhes;
  let convite;
  try {
    detalhes = await api.get(`/api/classes/${encodeURIComponent(params.classId)}?limit=100`);
    const proprietario = detalhes.members.find((m) => m.id === user.id && m.role === "owner");
    if (proprietario) {
      convite = await api.get(`/api/classes/${encodeURIComponent(params.classId)}/invite-code`);
    }
  } catch (erro) {
    return h("p", { class: "aviso aviso-erro", role: "alert" }, mensagemDeErro(erro.codigo));
  }

  const proprietario = detalhes.members.find((m) => m.id === user.id && m.role === "owner");

  const secao = h("section", {},
    cabecalhoClasse(detalhes.class, "membros", { alunos: detalhes.members.length }),
    h("ul", { class: "lista-membros" }, detalhes.members.map((membro) => h("li", { class: "card" },
      h("span", { class: "avatar", "aria-hidden": "true" }, (membro.name?.[0] ?? "?").toUpperCase()),
      h("strong", {}, membro.name),
      h("span", { class: "pilula" }, PAPEL[membro.role] ?? "Membro")))));

  if (proprietario) {
    const conviteSection = h("section", { class: "card convite-section" },
      h("h2", {}, "Convide novos participantes para a classe"),
      h("p", { class: "texto-suave" }, "Compartilhe este código com quem deseja entrar na classe:"),
      h("div", { class: "convite-codigo" },
        h("code", {}, convite?.inviteCode ?? "—"),
        h("button", {
          class: "btn btn-secundario",
          type: "button",
          "aria-label": "Copiar código de convite"
        }, [icone("copiar"), " Copiar"])),
      h("button", {
        class: "btn btn-ghost",
        type: "button"
      }, [icone("atualizar"), " Regenerar código"]));
    secao.appendChild(conviteSection);

    // Event listeners
    const copiarBtn = conviteSection.querySelector("button[aria-label='Copiar código de convite']");
    const regenerarBtn = conviteSection.querySelector("button.btn-ghost");
    const codigoEl = conviteSection.querySelector("code");

    copiarBtn?.addEventListener("click", async () => {
      const codigo = codigoEl?.textContent?.trim();
      if (!codigo || codigo === "—") return;
      try {
        await navigator.clipboard.writeText(codigo);
        toast("Código copiado!", { tipo: "sucesso" });
      } catch {
        toast("Não foi possível copiar.", { tipo: "erro" });
      }
    });

    regenerarBtn?.addEventListener("click", async () => {
      try {
        const { inviteCode } = await api.post(`/api/classes/${encodeURIComponent(params.classId)}/regenerate-invite-code`);
        codigoEl.textContent = inviteCode;
        toast("Código regenerado!", { tipo: "sucesso" });
      } catch (erro) {
        toast(mensagemDeErro(erro.codigo), { tipo: "erro" });
      }
    });
  }

  return secao;
}
