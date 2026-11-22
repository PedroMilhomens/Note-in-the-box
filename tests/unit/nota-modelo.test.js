import assert from "node:assert/strict";
import test from "node:test";
import {
  clientIdDe, estadoDaNota, isLocalNote, mesclarNotasLocais, mutacaoDeNota, notaVazia, novoIdLocal, registroOffline,
} from "../../public/js/nota/modelo.js";

const contexto = { user: { id: "u1", name: "Ana" }, classId: "c1", branchId: "b1" };

test("ids locais são reconhecidos e geram clientId idempotente", () => {
  const id = novoIdLocal({ randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" });
  assert.equal(id, "local-123e4567-e89b-42d3-a456-426614174000");
  assert.equal(isLocalNote(id), true);
  assert.equal(isLocalNote("123e4567"), false);
  assert.equal(isLocalNote(null), false);
  assert.equal(clientIdDe(id), "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(clientIdDe("abc"), null);
  assert.throws(() => novoIdLocal({}), /offline/);
});

test("mutação de criação leva clientId; atualização não", () => {
  const criar = mutacaoDeNota(contexto, "create", "local-xyz", { title: "T" }, null, 5);
  assert.equal(criar.clientId, "xyz");
  assert.equal(criar.key, "u1:c1:local-xyz");
  assert.equal(criar.createdAt, 5);
  assert.equal(criar.conflict, null);
  const atualizar = mutacaoDeNota(contexto, "update", "n1", { title: "T" }, "2026-01-01T00:00:00.000Z");
  assert.equal(atualizar.clientId, null);
  assert.equal(atualizar.baseUpdatedAt, "2026-01-01T00:00:00.000Z");
});

test("registro offline e nota vazia pertencem ao usuário e à branch", () => {
  const registro = registroOffline(contexto, "n1", { title: "T" }, { baseUpdatedAt: "x", pending: true });
  assert.deepEqual(
    [registro.ownerId, registro.branchId, registro.pending, registro.updatedAt],
    ["u1", "b1", true, "x"],
  );
  const vazia = notaVazia(contexto, "local-1");
  assert.deepEqual([vazia.title, vazia.status, vazia.updatedAt], ["", "draft", null]);
});

test("mesclarNotasLocais aplica pendências e acrescenta notas só locais", () => {
  const servidor = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
  const mutacoes = [{ noteId: "a", fields: { title: "A editada" }, conflict: null }];
  const locais = [{ id: "a", title: "dup" }, { id: "local-1", title: "Nova", isDraft: true }];
  const notas = mesclarNotasLocais(servidor, mutacoes, locais);
  assert.deepEqual(notas.map((n) => n.id), ["a", "b", "local-1"]);
  assert.equal(notas[0].title, "A editada");
  assert.equal(notas[0].pending, true);
  assert.equal(notas[1].pending, false);
  assert.equal(estadoDaNota(notas[0]), "Pendente");
  assert.equal(estadoDaNota({ conflict: {} }), "Conflito");
  assert.equal(estadoDaNota(notas[2]), "Rascunho local");
  assert.equal(estadoDaNota(notas[1]), "");
});
