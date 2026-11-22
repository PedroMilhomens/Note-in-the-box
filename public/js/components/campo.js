import { h } from "./dom.js";

// Campo de formulário acessível: rótulo, dica, erro e aria-invalid.
export function campo({ id, rotulo, tipo = "text", nome, autocomplete, placeholder, maxlength, inputmode, dica }) {
  const input = h("input", {
    id, name: nome, type: tipo, autocomplete, placeholder, maxlength, inputmode,
    autocapitalize: "none", spellcheck: tipo === "text" ? null : "false",
  });
  const erro = h("p", { class: "erro", id: `${id}-erro`, hidden: true });
  const descricoes = [];
  if (dica) descricoes.push(`${id}-dica`);
  const raiz = h("div", { class: "campo" },
    h("label", { for: id }, rotulo),
    input,
    dica ? h("p", { class: "ajuda", id: `${id}-dica` }, dica) : null,
    erro);
  if (descricoes.length) input.setAttribute("aria-describedby", descricoes.join(" "));

  return {
    raiz,
    input,
    mostrarErro(mensagem) {
      erro.textContent = mensagem ?? "";
      erro.hidden = !mensagem;
      input.toggleAttribute("aria-invalid", Boolean(mensagem));
      if (mensagem) input.setAttribute("aria-invalid", "true");
      const ids = [...descricoes, ...(mensagem ? [erro.id] : [])];
      if (ids.length) input.setAttribute("aria-describedby", ids.join(" "));
      else input.removeAttribute("aria-describedby");
    },
  };
}

export function campoSenha(opcoes) {
  const base = campo({ ...opcoes, tipo: "password" });
  const botao = h("button", { class: "btn-texto", type: "button", "aria-pressed": "false", "aria-label": "Mostrar senha" }, "Mostrar");
  botao.addEventListener("click", () => {
    const visivel = base.input.type === "password";
    base.input.type = visivel ? "text" : "password";
    botao.setAttribute("aria-pressed", String(visivel));
    botao.setAttribute("aria-label", visivel ? "Ocultar senha" : "Mostrar senha");
    botao.textContent = visivel ? "Ocultar" : "Mostrar";
  });
  const envoltorio = h("div", { class: "campo-senha" });
  base.input.replaceWith(envoltorio);
  envoltorio.append(base.input, botao);
  return base;
}
