import { h } from "./dom.js";
import { abrirDialogo } from "./nota/dialogo.js";

// Diálogo de denúncia (nota, comentário, tópico ou resposta).
export function abrirDenuncia({ api, classId, tipoAlvo, idAlvo, toast }) {
  const motivo = h("textarea", { id: "den-motivo", rows: 4, maxlength: 500 });
  abrirDialogo({
    titulo: "Denunciar conteúdo",
    conteudo: [h("div", { class: "campo" }, h("label", { for: "den-motivo" }, "Descreva o motivo"), motivo)],
    confirmar: "Enviar denúncia",
    aoConfirmar: async () => {
      const texto = motivo.value.trim();
      if (!texto) throw new Error("Descreva o motivo da denúncia.");
      await api.post(`/api/classes/${encodeURIComponent(classId)}/reports`, {
        targetType: tipoAlvo, targetId: idAlvo, reason: texto,
      });
      toast("Denúncia enviada.", { tipo: "sucesso" });
    },
  });
}
