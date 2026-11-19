// Construção de DOM segura: conteúdo sempre como texto, nunca como HTML.
const ATRIBUTOS_URL = new Set(["href", "src", "action", "formaction"]);
const PROTOCOLO_PERIGOSO = /^\s*(javascript|data|vbscript):/i;

export function h(tag, atributos = {}, ...filhos) {
  const elemento = document.createElement(tag);
  for (const [nome, valor] of Object.entries(atributos ?? {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (nome.startsWith("on")) throw new TypeError("Use addEventListener em vez de atributos on*");
    if (ATRIBUTOS_URL.has(nome) && PROTOCOLO_PERIGOSO.test(String(valor))) {
      throw new TypeError("URL com protocolo não permitido");
    }
    if (nome === "class") elemento.className = valor;
    else if (valor === true) elemento.setAttribute(nome, "");
    else elemento.setAttribute(nome, String(valor));
  }
  for (const filho of filhos.flat()) {
    if (filho === null || filho === undefined || filho === false) continue;
    elemento.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
  return elemento;
}

export function limpar(elemento) {
  elemento.replaceChildren();
  return elemento;
}

const NS_SVG = "http://www.w3.org/2000/svg";

// Elementos SVG decorativos (atributos fixos escritos pelo código, nunca vindos do usuário).
export function svg(tag, atributos = {}, ...filhos) {
  const elemento = document.createElementNS(NS_SVG, tag);
  for (const [nome, valor] of Object.entries(atributos)) {
    if (nome.startsWith("on") || /^(href|xlink:href)$/.test(nome)) {
      throw new TypeError("Atributo não permitido em SVG");
    }
    elemento.setAttribute(nome, String(valor));
  }
  elemento.append(...filhos);
  return elemento;
}
