// Texto simples com marcação leve -> estrutura de blocos (sem HTML).
//   **negrito**   _itálico_   [[título de outra nota]]   "- item" em linhas seguidas = lista
const INLINE = /\[\[([^\]\n]{1,200})\]\]|\*\*([^*\n]+)\*\*|_([^_\n]+)_/gu;

export function parseInline(texto) {
  const partes = [];
  let ultimo = 0;
  for (const achado of texto.matchAll(INLINE)) {
    if (achado.index > ultimo) partes.push({ tipo: "texto", valor: texto.slice(ultimo, achado.index) });
    if (achado[1] !== undefined) partes.push({ tipo: "ref", valor: achado[1].trim() });
    else if (achado[2] !== undefined) partes.push({ tipo: "negrito", valor: achado[2] });
    else partes.push({ tipo: "italico", valor: achado[3] });
    ultimo = achado.index + achado[0].length;
  }
  if (ultimo < texto.length) partes.push({ tipo: "texto", valor: texto.slice(ultimo) });
  return partes;
}

export function parseCorpo(texto) {
  const blocos = [];
  let paragrafo = [];
  let lista = null;
  const fecharParagrafo = () => {
    if (paragrafo.length) blocos.push({ tipo: "paragrafo", partes: parseInline(paragrafo.join("\n")) });
    paragrafo = [];
  };
  const fecharLista = () => {
    if (lista) blocos.push({ tipo: "lista", itens: lista });
    lista = null;
  };
  for (const linha of String(texto ?? "").replace(/\r\n?/gu, "\n").split("\n")) {
    if (linha.trim() === "") { fecharParagrafo(); fecharLista(); continue; }
    const item = /^\s*[-*]\s+(.*)$/u.exec(linha);
    if (item) {
      fecharParagrafo();
      lista ??= [];
      lista.push(parseInline(item[1]));
    } else {
      fecharLista();
      paragrafo.push(linha);
    }
  }
  fecharParagrafo();
  fecharLista();
  return blocos;
}

// Aplica uma marcação ao trecho selecionado de um texto; devolve novo texto e seleção.
export function aplicarMarcacao(texto, inicio, fim, tipo) {
  const selecionado = texto.slice(inicio, fim);
  if (tipo === "lista") {
    const linhas = (selecionado || "").split("\n");
    const novo = linhas.map((linha) => (linha.startsWith("- ") ? linha : `- ${linha}`)).join("\n");
    return { texto: texto.slice(0, inicio) + novo + texto.slice(fim), inicio, fim: inicio + novo.length };
  }
  const marca = tipo === "negrito" ? "**" : "_";
  const novo = `${marca}${selecionado}${marca}`;
  const posInicio = inicio + marca.length;
  return {
    texto: texto.slice(0, inicio) + novo + texto.slice(fim),
    inicio: posInicio,
    fim: posInicio + selecionado.length,
  };
}
