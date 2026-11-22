import { mensagemDeErro, validarCadastro, validarLogin } from "../auth-validation.js";
import { safeNextPath } from "../router-client.js";
import { setSessao } from "../store.js";
import { campo, campoSenha } from "./campo.js";
import { h, svg } from "./dom.js";

const ILUSTRACAO = {
  nos: [[30, 120], [205, 28], [205, 215], [392, 106], [595, 28], [595, 215]],
  ligacoes: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 3], [3, 4], [3, 5]],
};

function ilustracao() {
  const { nos, ligacoes } = ILUSTRACAO;
  return svg("svg", { class: "auth-ilustracao", viewBox: "0 0 640 250", "aria-hidden": "true", focusable: "false" },
    ...ligacoes.map(([a, b]) => svg("line", { x1: nos[a][0], y1: nos[a][1], x2: nos[b][0], y2: nos[b][1] })),
    ...nos.map(([x, y], i) => (i === 3
      ? [svg("circle", { class: "no-central", cx: x, cy: y, r: 26 }), svg("circle", { class: "no-ponto", cx: x, cy: y, r: 9 })]
      : svg("circle", { cx: x, cy: y, r: i === 0 ? 22 : 20 }))).flat());
}

function painelMarca() {
  return h("section", { class: "auth-marca", "aria-label": "Sobre o Note in the box" },
    h("div", { class: "marca" },
      h("img", { src: "/assets/logo-192.png", alt: "", width: 48, height: 48 }),
      h("span", {}, "Note in the box")),
    ilustracao(),
    h("h1", { class: "auth-titulo" }, "Suas anotações e as da turma, num só lugar."),
    h("p", { class: "auth-subtitulo" }, "Perdeu uma aula? Veja a versão dos colegas, conecte as notas entre si e estude com flashcards e Pomodoro."),
    h("ul", { class: "auth-chips" }, ["Branch por aluno", "Fórum da classe", "Flashcards", "Pomodoro"].map((item) => h("li", {}, item))));
}

function seletor(modo) {
  return h("nav", { class: "seletor", "aria-label": "Acesso" },
    h("a", { href: "/entrar", "aria-current": modo === "entrar" ? "page" : null }, "Entrar"),
    h("a", { href: "/cadastro", "aria-current": modo === "cadastro" ? "page" : null }, "Criar conta"));
}

export function renderAuth({ modo, api, navegar, toast, url, atualizarClasses }) {
  const cadastro = modo === "cadastro";
  const campos = {};
  campos.name = cadastro ? campo({ id: "nome", rotulo: "Nome", nome: "name", autocomplete: "name", placeholder: "Seu nome", maxlength: 100 }) : null;
  campos.email = campo({ id: "email", rotulo: "E-mail", tipo: "email", nome: "email", autocomplete: "email", placeholder: "voce@email.com", maxlength: 254, inputmode: "email" });
  campos.institution = cadastro ? campo({ id: "instituicao", rotulo: "Instituição", nome: "institution", autocomplete: "organization", placeholder: "Ex.: UNIR", maxlength: 120 }) : null;
  campos.course = cadastro ? campo({ id: "curso", rotulo: "Curso", nome: "course", placeholder: "Ex.: Engenharia", maxlength: 120 }) : null;
  campos.password = campoSenha({
    id: "senha", rotulo: "Senha", nome: "password", maxlength: 128,
    autocomplete: cadastro ? "new-password" : "current-password",
    placeholder: cadastro ? "Mínimo de 8 caracteres" : "Sua senha",
  });

  const aceite = h("input", { id: "aceite", name: "aceite", type: "checkbox", "aria-describedby": "aceite-erro" });
  const erroAceite = h("p", { class: "erro", id: "aceite-erro", hidden: true });
  const avisoErro = h("div", { class: "aviso aviso-erro", role: "alert", hidden: true });
  const botao = h("button", { class: "btn btn-destaque btn-bloco", type: "submit" }, cadastro ? "Criar conta" : "Entrar");

  const form = h("form", { class: "auth-form", novalidate: true, "aria-labelledby": "auth-titulo-form" },
    avisoErro,
    campos.name?.raiz,
    campos.email.raiz,
    cadastro ? h("div", { class: "campo-duplo" }, campos.institution.raiz, campos.course.raiz) : null,
    campos.password.raiz,
    cadastro
      ? h("div", {},
        h("div", { class: "check" },
          aceite,
          h("label", { for: "aceite" },
            "Li e aceito os ",
            h("a", { href: "/termos.html", target: "_blank", rel: "noopener" }, "Termos de Uso"),
            " e a ",
            h("a", { href: "/privacidade.html", target: "_blank", rel: "noopener" }, "Política de Privacidade"),
            ". Se tenho menos de 18 anos, tenho autorização do meu responsável.")),
        erroAceite)
      : null,
    botao);

  function limparErros() {
    avisoErro.hidden = true;
    avisoErro.textContent = "";
    for (const item of Object.values(campos)) item?.mostrarErro(null);
    erroAceite.hidden = true;
    aceite.removeAttribute("aria-invalid");
  }

  function mostrarErros(erros) {
    let primeiro = null;
    for (const [chave, item] of Object.entries(campos)) {
      if (item && erros[chave]) {
        item.mostrarErro(erros[chave]);
        primeiro ??= item.input;
      }
    }
    if (erros.aceite) {
      erroAceite.textContent = erros.aceite;
      erroAceite.hidden = false;
      aceite.setAttribute("aria-invalid", "true");
      primeiro ??= aceite;
    }
    primeiro?.focus();
  }

  let ocupado = false;
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (ocupado) return;
    limparErros();

    const valores = {
      name: campos.name?.input.value.trim() ?? "",
      email: campos.email.input.value.trim(),
      institution: campos.institution?.input.value.trim() ?? "",
      course: campos.course?.input.value.trim() ?? "",
      password: campos.password.input.value,
      aceite: aceite.checked,
    };
    const erros = cadastro ? validarCadastro(valores) : validarLogin(valores);
    if (Object.keys(erros).length) {
      mostrarErros(erros);
      return;
    }

    ocupado = true;
    botao.disabled = true;
    form.setAttribute("aria-busy", "true");
    let cadastrado = false;
    try {
      if (cadastro) {
        await api.post("/api/auth/register", {
          name: valores.name,
          email: valores.email,
          institution: valores.institution || undefined,
          course: valores.course || undefined,
          password: valores.password,
          acceptTerms: true,
          acceptPrivacy: true,
        }, { semRedirecionar: true });
        cadastrado = true;
      }
      const { user } = await api.post("/api/auth/login", {
        email: valores.email,
        password: valores.password,
      }, { semRedirecionar: true });
      setSessao({ user, offline: false });
      await atualizarClasses?.();
      await navegar(safeNextPath(url.searchParams.get("next")) ?? "/inicio", { replace: true });
    } catch (erro) {
      campos.password.input.value = "";
      if (cadastrado) {
        toast("Conta criada. Entre para continuar.", { tipo: "sucesso" });
        await navegar("/entrar", { replace: true });
      } else {
        avisoErro.textContent = mensagemDeErro(erro.codigo);
        avisoErro.hidden = false;
      }
    } finally {
      ocupado = false;
      botao.disabled = false;
      form.removeAttribute("aria-busy");
    }
  });

  return h("div", { class: "auth" },
    painelMarca(),
    h("section", { class: "auth-painel", "aria-label": cadastro ? "Criar conta" : "Entrar" },
      seletor(modo),
      h("h2", { class: "auth-titulo-form", id: "auth-titulo-form" }, cadastro ? "Crie sua conta" : "Bem-vindo de volta"),
      h("p", { class: "auth-dica" }, cadastro ? "Leva menos de um minuto." : "Entre para ver as anotações da sua turma."),
      form));
}
