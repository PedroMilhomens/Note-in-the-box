import {
  completeNoteMutation,
  listNoteMutations,
  saveNoteMutation,
} from "./offline-store.js";

export async function syncPendingNotes(userId, request) {
  const mutations = await listNoteMutations(userId);
  const result = {
    synced: [],
    conflicts: [],
    errors: [],
    interrupted: false,
  };

  for (const mutation of mutations) {
    if (mutation.conflict) {
      result.conflicts.push(mutation);
      continue;
    }

    const isCreate = mutation.kind === "create";
    const path = isCreate
      ? `/api/classes/${mutation.classId}/branches/${mutation.branchId}/notes`
      : `/api/classes/${mutation.classId}/notes/${mutation.noteId}`;
    const body = isCreate
      ? { ...mutation.fields, clientId: mutation.clientId }
      : {
        ...mutation.fields,
        baseUpdatedAt: mutation.baseUpdatedAt,
      };

    try {
      const payload = await request(path, {
        method: isCreate ? "POST" : "PATCH",
        body: JSON.stringify(body),
      });
      await completeNoteMutation(mutation, payload.note);
      result.synced.push({
        localNoteId: mutation.noteId,
        note: payload.note,
      });
    } catch (error) {
      if (error.status === 409 && error.payload?.codigo === "CONFLITO_NOTA") {
        const conflict = {
          ...mutation,
          conflict: error.payload.note,
        };
        await saveNoteMutation(conflict);
        result.conflicts.push(conflict);
        continue;
      }
      if (error instanceof TypeError) {
        result.interrupted = true;
        break;
      }
      result.errors.push({
        noteId: mutation.noteId,
        message: error.message,
      });
    }
  }

  return result;
}
