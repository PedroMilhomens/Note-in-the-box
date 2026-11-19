import { h } from "./dom.js";

let regiao;

export function toast(mensagem, { tipo = "info", duracaoMs = 6000 } = {}) {
  if (!regiao) {
    regiao = h("div", { class: "toast-regiao", role: "status", "aria-live": "polite" });
    document.body.append(regiao);
  }
  const classe = tipo === "erro" ? "aviso aviso-erro" : tipo === "sucesso" ? "aviso aviso-sucesso" : "aviso";
  const item = h("div", { class: classe }, mensagem);
  regiao.append(item);
  setTimeout(() => item.remove(), duracaoMs);
}
