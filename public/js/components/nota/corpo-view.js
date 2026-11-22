import { h } from "../dom.js";
import { parseCorpo } from "../../nota/corpo.js";

// Desenha o corpo da nota (somente nós de texto; nenhum HTML vindo do usuário).
// notasPorTitulo: Map(título minúsculo -> { id, title }) para ligar [[referências]] a outras notas.
export function renderCorpo(texto, { notasPorTitulo = new Map(), hrefDe } = {}) {
  const partes = (lista) => lista.map((parte) => {
    if (parte.tipo === "negrito") return h("strong", {}, parte.valor);
    if (parte.tipo === "italico") return h("em", {}, parte.valor);
    if (parte.tipo === "ref") {
      const alvo = notasPorTitulo.get(parte.valor.toLocaleLowerCase("pt-BR"));
      return alvo && hrefDe
        ? h("a", { class: "chip-ref", href: hrefDe(alvo) }, parte.valor)
        : h("span", { class: "chip-ref chip-ref-solta", title: "Nota não encontrada nesta classe" }, parte.valor);
    }
    return parte.valor;
  });

  const blocos = parseCorpo(texto).map((bloco) => (bloco.tipo === "lista"
    ? h("ul", {}, bloco.itens.map((item) => h("li", {}, partes(item))))
    : h("p", {}, partes(bloco.partes))));
  return h("div", { class: "corpo-nota" },
    blocos.length ? blocos : h("p", { class: "corpo-vazio" }, "Esta anotação ainda está vazia."));
}
