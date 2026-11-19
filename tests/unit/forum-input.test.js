import assert from "node:assert/strict";
import test from "node:test";
import {
  parseClassRulesInput,
} from "../../src/server/modules/classes/routes.js";
import {
  parseForumPostInput,
  parseForumTopicInput,
} from "../../src/server/modules/forum/routes.js";

test("forum topic validates title, body, and optional note UUID", () => {
  const noteId = "10caec75-e013-4f36-9416-3e4f97fba26e";
  assert.deepEqual(
    parseForumTopicInput({
      title: "  Dúvida  ",
      body: "Texto\ncom linhas",
      noteId,
    }),
    { title: "Dúvida", body: "Texto\ncom linhas", noteId },
  );
  assert.deepEqual(
    parseForumTopicInput({ title: "Discussão", body: "Texto" }),
    { title: "Discussão", body: "Texto", noteId: null },
  );
  assert.throws(
    () => parseForumTopicInput({
      title: "Dúvida",
      body: "Texto",
      noteId: "não-é-uuid",
    }),
    { status: 400 },
  );
  assert.throws(
    () => parseForumTopicInput({ title: " ", body: "Texto" }),
    { status: 400 },
  );
  assert.throws(
    () => parseForumTopicInput({ title: "Dúvida", body: "Texto", extra: true }),
    { status: 400 },
  );
});

test("forum replies and class rules enforce bounded plain text", () => {
  assert.deepEqual(parseForumPostInput({ body: "Resposta" }), {
    body: "Resposta",
  });
  assert.throws(
    () => parseForumPostInput({ body: " " }),
    { status: 400 },
  );
  assert.deepEqual(parseClassRulesInput({ rules: "Seja respeitoso." }), {
    rules: "Seja respeitoso.",
  });
  assert.throws(
    () => parseClassRulesInput({ rules: "x".repeat(5001) }),
    { status: 400 },
  );
  assert.throws(
    () => parseClassRulesInput({ rules: "Regras", extra: "campo" }),
    { status: 400 },
  );
});
