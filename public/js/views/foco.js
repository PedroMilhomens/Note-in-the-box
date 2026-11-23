import { h, svg } from "../components/dom.js";
import { obterTimer } from "../foco/instancia.js";
import { ROTULO_MODO, formatarTempo } from "../foco/timer.js";
import { getSessao } from "../store.js";

export const titulo = "Modo foco";

const RAIO = 90;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
const MODOS = [["foco", "Foco"], ["pausa", "Pausa"], ["longa", "Longa"]];

export function render({ api, url, toast }) {
  const timer = obterTimer(api);
  const { classes } = getSessao();
  const pedida = url.searchParams.get("classId");
  if (pedida && classes.some((c) => c.id === pedida) && !timer.estado().iniciado) timer.definirClasse(pedida);

  // ---- anel e tempo ----
  const trilha = svg("circle", { class: "anel-trilha", cx: 110, cy: 110, r: RAIO });
  const progresso = svg("circle", {
    class: "anel-progresso", cx: 110, cy: 110, r: RAIO, transform: "rotate(-90 110 110)",
    "stroke-dasharray": CIRCUNFERENCIA.toFixed(2),
  });
  const anel = svg("svg", { class: "anel", viewBox: "0 0 220 220", "aria-hidden": "true", focusable: "false" }, trilha, progresso);
  const tempo = h("p", { class: "relogio-foco", role: "timer", "aria-live": "off" });
  const ciclo = h("p", { class: "texto-suave ciclo-texto" });
  const painelRelogio = h("div", { class: "relogio-caixa" }, anel, h("div", { class: "relogio-centro" }, tempo, ciclo));
  const pontos = h("div", { class: "ciclo-pontos", "aria-hidden": "true" }, [0, 1, 2, 3].map(() => h("span", { class: "ponto-ciclo" })));
  const anuncio = h("p", { class: "sr-only", role: "status", "aria-live": "polite" });

  // ---- modos ----
  const abas = h("div", { class: "modo-abas", role: "group", "aria-label": "Tipo de ciclo" }, MODOS.map(([modo, rotulo]) => {
    const botao = h("button", { class: "modo-aba", type: "button", "data-modo": modo }, rotulo);
    botao.addEventListener("click", () => timer.escolherModo(modo));
    return botao;
  }));

  // ---- controles ----
  const principal = h("button", { class: "btn btn-claro btn-bloco", type: "button" });
  const reiniciar = h("button", { class: "btn btn-secundario btn-bloco", type: "button" }, "Reiniciar");
  principal.addEventListener("click", () => (timer.estado().rodando ? timer.pausar() : timer.iniciar()));
  reiniciar.addEventListener("click", () => timer.reiniciar());

  // ---- classe e durações ----
  const seletor = h("select", { id: "foco-classe" }, h("option", { value: "" }, "Sem classe"),
    classes.map((c) => h("option", { value: c.id }, c.name)));
  seletor.addEventListener("change", () => timer.definirClasse(seletor.value));
  const campo = (id, rotulo) => {
    const entrada = h("input", { id, type: "number", min: 1, max: 120, step: 1, inputmode: "numeric" });
    return { entrada, raiz: h("div", { class: "campo" }, h("label", { for: id }, rotulo), entrada) };
  };
  const cFoco = campo("dur-foco", "Foco (min)");
  const cPausa = campo("dur-pausa", "Pausa (min)");
  const cLonga = campo("dur-longa", "Pausa longa (min)");
  const aplicar = h("button", { class: "btn btn-secundario", type: "submit" }, "Aplicar durações");
  const conjunto = h("fieldset", { class: "foco-duracoes" }, cFoco.raiz, cPausa.raiz, cLonga.raiz, aplicar);
  const formulario = h("form", { class: "foco-config" }, conjunto);
  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const ok = timer.definirDuracoes({
      foco: cFoco.entrada.valueAsNumber, pausa: cPausa.entrada.valueAsNumber, longa: cLonga.entrada.valueAsNumber,
    });
    toast(ok ? "Durações atualizadas." : "Informe durações inteiras entre 1 e 120 minutos.", { tipo: ok ? "sucesso" : "erro" });
  });
  const config = h("details", { class: "foco-detalhes" }, h("summary", {}, "Configurações"),
    h("div", { class: "campo" }, h("label", { for: "foco-classe" }, "Classe associada aos ciclos"), seletor), formulario);

  const aviso = h("p", { class: "texto-suave foco-aviso", role: "status" });
  const estudando = h("div", { class: "estudando", hidden: true }, h("span", { class: "texto-suave" }, "Estudando agora"), h("strong", {}));

  const raiz = h("section", { class: "foco" },
    h("div", { class: "foco-topo" }, h("h1", {}, "Pomodoro"), h("span", { class: "pilula foco-pilula", hidden: true }, "Modo foco ativo")),
    abas, painelRelogio, pontos,
    h("div", { class: "foco-controles" }, principal, reiniciar),
    estudando, aviso, anuncio, config,
    h("p", { class: "texto-suave foco-nota" }, "A tela fica ligada durante o foco quando o navegador permite. O timer continua se você trocar de tela no app."));

  let ultimoModoAnunciado = null;
  function desenhar(e) {
    if (raiz.isConnected) raiz.dataset.montada = "1";
    else if (raiz.dataset.montada) { desassinar(); return; }
    tempo.textContent = formatarTempo(e.restanteMs);
    const total = e.duracoes[e.modo] * 60_000;
    progresso.setAttribute("stroke-dashoffset", (CIRCUNFERENCIA * (1 - e.restanteMs / total)).toFixed(2));
    ciclo.textContent = `${ROTULO_MODO[e.modo]} · ciclo ${(e.ciclos % 4) + (e.modo === "foco" ? 1 : 0)} de 4`;
    [...pontos.children].forEach((ponto, i) => ponto.classList.toggle("ponto-feito", i < e.ciclos % 4));
    for (const aba of abas.children) {
      const ativa = aba.dataset.modo === e.modo;
      aba.setAttribute("aria-pressed", String(ativa));
      aba.disabled = e.rodando || e.iniciado || e.finalizando;
    }
    principal.textContent = e.rodando ? "Pausar" : e.iniciado ? "Retomar" : "Iniciar";
    principal.disabled = e.finalizando;
    reiniciar.disabled = e.finalizando;
    conjunto.disabled = e.rodando || e.iniciado || e.finalizando;
    for (const [entrada, modo] of [[cFoco.entrada, "foco"], [cPausa.entrada, "pausa"], [cLonga.entrada, "longa"]]) {
      if (document.activeElement !== entrada) entrada.value = e.duracoes[modo];
    }
    seletor.value = e.classId ?? "";
    seletor.disabled = e.rodando;
    aviso.textContent = e.aviso;
    aviso.classList.toggle("status-erro", e.erro);
    raiz.querySelector(".foco-pilula").hidden = !(e.rodando && e.modo === "foco");
    const nome = classes.find((c) => c.id === e.classId)?.name;
    estudando.hidden = !(e.rodando && nome);
    estudando.querySelector("strong").textContent = nome ?? "";
    document.title = e.rodando ? `${formatarTempo(e.restanteMs)} · ${ROTULO_MODO[e.modo]}` : `${titulo} · Note in the box`;
    if (e.finalizando || (e.restanteMs === 0 && !e.rodando)) anuncio.textContent = "Ciclo concluído.";
    else if (ultimoModoAnunciado !== e.modo) { anuncio.textContent = ""; }
    ultimoModoAnunciado = e.modo;
  }
  const desassinar = timer.assinar(desenhar);
  desenhar(timer.estado());
  return raiz;
}
