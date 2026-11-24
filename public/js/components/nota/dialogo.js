import { h } from "../dom.js";

// Diálogo modal acessível (<dialog>): foco preso pelo navegador, Esc fecha.
// aoConfirmar pode lançar erro; a mensagem aparece no próprio diálogo.
export function abrirDialogo({ titulo, descricao, conteudo = [], confirmar, perigo = false, aoConfirmar }) {
  const erro = h("p", { class: "aviso aviso-erro", role: "alert", hidden: true });
  const cancelar = h("button", { class: "btn btn-secundario", type: "button" }, "Cancelar");
  const ok = h("button", { class: perigo ? "btn btn-perigo" : "btn", type: "submit" }, confirmar);
  const idTitulo = `dlg-${Math.random().toString(36).slice(2, 8)}`;
  const formulario = h("form", { class: "dialogo-form", method: "dialog" },
    h("h2", { id: idTitulo }, titulo),
    descricao ? (Array.isArray(descricao) ? descricao : [h("p", { class: "texto-suave" }, descricao)]) : null,
    ...conteudo,
    erro,
    h("div", { class: "dialogo-acoes" }, cancelar, ok));
  const dialogo = h("dialog", { class: "dialogo", "aria-labelledby": idTitulo }, formulario);
  const retorno = document.activeElement;
  const fechar = () => { dialogo.close(); dialogo.remove(); retorno?.focus?.(); };

  cancelar.addEventListener("click", fechar);
  dialogo.addEventListener("cancel", (evento) => { evento.preventDefault(); fechar(); });
  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    ok.disabled = true;
    erro.hidden = true;
    try {
      await aoConfirmar();
      fechar();
    } catch (falha) {
      erro.textContent = falha?.message ?? "Não foi possível concluir a ação.";
      erro.hidden = false;
      ok.disabled = false;
    }
  });
  document.body.append(dialogo);
  dialogo.showModal();
  dialogo.querySelector("input, select, textarea, button[type=submit]")?.focus();
  return dialogo;
}
