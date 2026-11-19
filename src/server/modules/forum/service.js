import { HttpError } from "../../http/errors.js";
import {
  createPost as createPostRecord,
  createTopic as createTopicRecord,
  deletePost as deletePostRecord,
  deleteTopic as deleteTopicRecord,
  getTopicPosts as getTopicPostsRecord,
  listNoteCandidates,
  listTopics,
} from "./repository.js";

export async function getTopics(pool, classId, pagination) {
  const topics = await listTopics(pool, classId, pagination);
  return { topics, pagination };
}

export async function getForumNoteCandidates(pool, classId, pagination) {
  const notes = await listNoteCandidates(pool, classId, pagination);
  return { notes, pagination };
}

export async function createTopic(pool, values) {
  const topic = await createTopicRecord(pool, values);
  if (!topic) throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  return { topic };
}

export async function getTopicPosts(pool, classId, topicId, pagination) {
  const result = await getTopicPostsRecord(pool, classId, topicId, pagination);
  if (!result) throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  return { ...result, pagination };
}

export async function createPost(pool, values) {
  const post = await createPostRecord(pool, values);
  if (!post) throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  return { post };
}

export async function removeTopic(pool, values) {
  const result = await deleteTopicRecord(pool, values);
  if (result === "not_found") {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  if (result === "forbidden") {
    throw new HttpError(403, "PERMISSAO_NEGADA", "permissão negada");
  }
}

export async function removePost(pool, values) {
  const result = await deletePostRecord(pool, values);
  if (result === "not_found") {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  if (result === "forbidden") {
    throw new HttpError(403, "PERMISSAO_NEGADA", "permissão negada");
  }
}
