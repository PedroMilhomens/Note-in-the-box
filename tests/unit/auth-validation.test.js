import assert from "node:assert/strict";
import test from "node:test";
import {
  MENSAGENS_ERRO,
  mensagemDeErro,
  validarCadastro,
  validarLogin,
} from "../../public/js/auth-validation.js";

const cadastroValido = {
  name: "Ana Souza",
  email: "ana@exemplo.com",
  institution: "UNIR",
  course: "Engenharia",
  password: "senha-segura-1",
  aceite: true,
};

test("cadastro válido não gera erros; instituição e curso são opcionais", () => {
  assert.deepEqual(validarCadastro(cadastroValido), {});
  assert.deepEqual(validarCadastro({ ...cadastroValido, institution: "", course: "" }), {});
});

test("cadastro aponta cada campo inválido", () => {
  const erros = validarCadastro({
    name: "  ",
    email: "sem-arroba",
    institution: "x".repeat(121),
    course: "a\u0000b",
    password: "curta",
    aceite: false,
  });
  assert.deepEqual(Object.keys(erros).sort(), ["aceite", "course", "email", "institution", "name", "password"]);
});

test("limites de nome, e-mail e senha seguem a API", () => {
  assert.ok(validarCadastro({ ...cadastroValido, name: "n".repeat(101) }).name);
  assert.equal(validarCadastro({ ...cadastroValido, name: "n".repeat(100) }).name, undefined);
  assert.ok(validarCadastro({ ...cadastroValido, email: `${"a".repeat(250)}@b.co` }).email);
  assert.ok(validarCadastro({ ...cadastroValido, password: "x".repeat(129) }).password);
  assert.equal(validarCadastro({ ...cadastroValido, password: "x".repeat(8) }).password, undefined);
});

test("aceite precisa ser exatamente verdadeiro", () => {
  for (const valor of [undefined, "true", 1, null]) {
    assert.ok(validarCadastro({ ...cadastroValido, aceite: valor }).aceite);
  }
});

test("login exige e-mail válido e senha", () => {
  assert.deepEqual(validarLogin({ email: "ana@exemplo.com", password: "x" }), {});
  assert.deepEqual(Object.keys(validarLogin({ email: "", password: "" })).sort(), ["email", "password"]);
  assert.ok(validarLogin({ email: "ana@", password: "x" }).email);
});

test("mensagens de erro cobrem os códigos da API e não vazam texto desconhecido", () => {
  for (const codigo of [
    "CREDENCIAIS_INVALIDAS", "DADOS_INVALIDOS", "CONSENTIMENTO_OBRIGATORIO", "SENHA_FRACA",
    "CONTA_JA_EXISTE", "MUITAS_TENTATIVAS", "DOCUMENTOS_PENDENTES", "ORIGEM_INVALIDA", "SEM_REDE",
  ]) {
    assert.equal(mensagemDeErro(codigo), MENSAGENS_ERRO[codigo]);
  }
  assert.match(mensagemDeErro("ERRO_INTERNO_XYZ"), /Não foi possível/);
  assert.doesNotMatch(mensagemDeErro("CONTA_JA_EXISTE"), /já existe um usuário|e-mail já/i);
});
