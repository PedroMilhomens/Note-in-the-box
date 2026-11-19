// Validação e mensagens do login e do cadastro. O servidor continua sendo a autoridade.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const CONTROLE = /[\u0000-\u001f\u007f]/u;

export const MENSAGENS_ERRO = {
  CREDENCIAIS_INVALIDAS: "E-mail ou senha incorretos.",
  DADOS_INVALIDOS: "Confira os dados informados e tente de novo.",
  CONSENTIMENTO_OBRIGATORIO: "Aceite os Termos de Uso e a Política de Privacidade para continuar.",
  SENHA_FRACA: "Escolha uma senha mais forte, com 8 a 128 caracteres e sem sequências simples.",
  CONTA_JA_EXISTE: "Não foi possível criar a conta com estes dados. Se você já tem uma conta, entre.",
  MUITAS_TENTATIVAS: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  DOCUMENTOS_PENDENTES: "O cadastro está temporariamente indisponível. Tente novamente mais tarde.",
  ORIGEM_INVALIDA: "Não foi possível validar a origem da requisição. Recarregue a página.",
  SEM_REDE: "Sem conexão com o servidor. Verifique a internet e tente de novo.",
};

export function mensagemDeErro(codigo) {
  return MENSAGENS_ERRO[codigo] ?? "Não foi possível concluir a ação. Tente novamente.";
}

function validarEmail(valor) {
  const email = String(valor ?? "").trim();
  if (!email) return "Informe seu e-mail.";
  if (email.length > 254 || !EMAIL.test(email) || CONTROLE.test(email)) return "Informe um e-mail válido.";
  return null;
}

function validarOpcional(valor, rotulo) {
  const texto = String(valor ?? "").trim();
  if (texto.length > 120 || CONTROLE.test(texto)) return `${rotulo} deve ter até 120 caracteres.`;
  return null;
}

export function validarLogin({ email, password }) {
  const erros = {};
  const erroEmail = validarEmail(email);
  if (erroEmail) erros.email = erroEmail;
  if (!password) erros.password = "Informe sua senha.";
  return erros;
}

export function validarCadastro({ name, email, institution, course, password, aceite }) {
  const erros = {};
  const nome = String(name ?? "").trim();
  if (!nome) erros.name = "Informe seu nome.";
  else if (nome.length > 100 || CONTROLE.test(nome)) erros.name = "O nome deve ter até 100 caracteres.";

  const erroEmail = validarEmail(email);
  if (erroEmail) erros.email = erroEmail;

  const erroInstituicao = validarOpcional(institution, "A instituição");
  if (erroInstituicao) erros.institution = erroInstituicao;
  const erroCurso = validarOpcional(course, "O curso");
  if (erroCurso) erros.course = erroCurso;

  const senha = String(password ?? "");
  if (senha.length < 8) erros.password = "A senha precisa ter pelo menos 8 caracteres.";
  else if (senha.length > 128) erros.password = "A senha deve ter até 128 caracteres.";

  if (aceite !== true) erros.aceite = "Aceite os Termos e a Política de Privacidade para continuar.";
  return erros;
}
