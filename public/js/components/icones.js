import { svg } from "./dom.js";

// Ícones de traço simples (24x24). Caminhos fixos escritos aqui, nunca vindos de dados.
const CAMINHOS = {
  inicio: ["M3 11l9-8 9 8", "M5 10v10h14V10", "M10 20v-6h4v6"],
  classes: ["M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z", "M5 17a3 3 0 0 1 3-3h11"],
  cartoes: ["M8 7h11v11H8z", "M5 16V5h11"],
  foco: ["M12 8v5l3 2", "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M9 2h6"],
  perfil: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21c0-4 4-6 8-6s8 2 8 6"],
  copiar: ["M16 2h4a2 2 0 0 1 2 2v4", "M8 16H4a2 2 0 0 1-2-2v-4", "M16 16h4a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2"],
  atualizar: ["M23 4v6h-6", "M1 20v-6h6", "M3.5 3.5l17 17"],
};

export function icone(nome) {
  return svg("svg", {
    class: "icone", viewBox: "0 0 24 24", width: 24, height: 24, fill: "none",
    stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round",
    "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false",
  }, ...(CAMINHOS[nome] ?? []).map((d) => svg("path", { d })));
}
