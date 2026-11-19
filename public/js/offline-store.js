const DATABASE_NAME = "note-in-the-box-offline";
const DATABASE_VERSION = 1;
const STORE_NAMES = ["sessions", "notes", "drafts", "mutations"];
const CACHE_PREFIX = "note-in-the-box-";

let databasePromise;

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("O armazenamento offline não está disponível."));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const storeName of STORE_NAMES) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: "key" });
        }
      }
    };
    request.onerror = () => reject(
      request.error ?? new Error("Não foi possível abrir o armazenamento offline."),
    );
    request.onblocked = () => reject(
      new Error("Feche outras abas do aplicativo para abrir o armazenamento offline."),
    );
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });

  return databasePromise;
}

function transact(storeNames, mode, run) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(storeNames, mode);
    let result;
    let settled = false;
    const setResult = (value) => {
      result = value;
    };
    transaction.oncomplete = () => {
      settled = true;
      resolve(result);
    };
    transaction.onerror = () => {
      if (settled) return;
      settled = true;
      reject(transaction.error ?? new Error("A operação offline falhou."));
    };
    transaction.onabort = () => {
      if (settled) return;
      settled = true;
      reject(transaction.error ?? new Error("A operação offline foi cancelada."));
    };
    try {
      run(transaction, setResult);
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  }));
}

function readRecord(storeName, key) {
  return transact([storeName], "readonly", (transaction, setResult) => {
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => setResult(request.result ?? null);
  });
}

function readAll(storeName) {
  return transact([storeName], "readonly", (transaction, setResult) => {
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => setResult(request.result);
  });
}

function writeRecord(storeName, record) {
  return transact([storeName], "readwrite", (transaction) => {
    transaction.objectStore(storeName).put(record);
  });
}

function deleteRecord(storeName, key) {
  return transact([storeName], "readwrite", (transaction) => {
    transaction.objectStore(storeName).delete(key);
  });
}

export function offlineNoteKey(userId, classId, noteId) {
  return `${userId}:${classId}:${noteId}`;
}

export function offlineDraftKey(userId, classId, branchId, noteId) {
  return `${userId}:${classId}:${branchId}:${noteId}`;
}

export function mergePendingMutation(previous, next) {
  if (!previous) return next;
  return {
    ...next,
    kind: previous.kind === "create" ? "create" : next.kind,
    baseUpdatedAt: previous.kind === "create"
      ? null
      : previous.baseUpdatedAt ?? next.baseUpdatedAt,
    conflict: previous.conflict ?? next.conflict ?? null,
    createdAt: previous.createdAt,
  };
}

export async function saveOfflineSession({ userId, userName, classes }) {
  const previous = await readRecord("sessions", "active");
  if (previous && previous.userId !== userId) {
    await clearOfflineRecords();
  }
  return writeRecord("sessions", {
    key: "active",
    userId,
    userName,
    classes,
  });
}

export function getOfflineSession() {
  return readRecord("sessions", "active");
}

export async function saveOfflineBranchNotes({
  userId,
  classId,
  branchId,
  notes,
  userName,
}) {
  const [storedNotes, mutations] = await Promise.all([
    readAll("notes"),
    readAll("mutations"),
  ]);
  const receivedIds = new Set(notes.map((note) => note.id));
  const pendingIds = new Set(
    mutations
      .filter((item) => item.userId === userId && item.classId === classId)
      .map((item) => item.noteId),
  );
  await transact(["notes"], "readwrite", (transaction) => {
    const store = transaction.objectStore("notes");
    for (const stored of storedNotes) {
      if (
        stored.userId === userId
        && stored.classId === classId
        && stored.branchId === branchId
        && !receivedIds.has(stored.id)
        && !pendingIds.has(stored.id)
      ) {
        store.delete(stored.key);
      }
    }
    for (const note of notes) {
      const existing = storedNotes.find((item) => (
        item.userId === userId
        && item.classId === classId
        && item.id === note.id
      ));
      store.put({
        ...existing,
        ...note,
        key: offlineNoteKey(userId, classId, note.id),
        userId,
        userName,
        classId,
        branchId,
        ownerId: userId,
        ownerName: userName,
      });
    }
  });
}

export function saveOfflineNote(note) {
  return writeRecord("notes", {
    ...note,
    key: offlineNoteKey(note.userId, note.classId, note.id),
  });
}

export async function listOfflineNotes(userId, classId, branchId) {
  const [notes, drafts, mutations] = await Promise.all([
    readAll("notes"),
    readAll("drafts"),
    readAll("mutations"),
  ]);
  const pendingIds = new Set(
    mutations
      .filter((item) => item.userId === userId && item.classId === classId)
      .map((item) => item.noteId),
  );
  const cached = notes.filter((note) => (
    note.userId === userId
    && note.classId === classId
    && note.branchId === branchId
  ));
  const localDrafts = drafts
    .filter((draft) => (
      draft.userId === userId
      && draft.classId === classId
      && draft.branchId === branchId
    ))
    .map((draft) => ({
      ...draft.fields,
      id: draft.noteId,
      branchId,
      lessonDate: draft.fields.lessonDate,
      status: draft.fields.status,
      updatedAt: draft.baseUpdatedAt,
      ownerId: userId,
      ownerName: draft.userName,
      isDraft: true,
    }));
  return [...localDrafts, ...cached]
    .map((note) => ({
      ...note,
      pending: pendingIds.has(note.id),
    }))
    .filter((note, index, all) => (
      all.findIndex((item) => item.id === note.id) === index
    ));
}

export function getOfflineNote(userId, classId, noteId) {
  return readRecord("notes", offlineNoteKey(userId, classId, noteId));
}

export function deleteOfflineNote(userId, classId, noteId) {
  return deleteRecord("notes", offlineNoteKey(userId, classId, noteId));
}

export function getOfflineDraft(userId, classId, branchId, noteId) {
  return readRecord(
    "drafts",
    offlineDraftKey(userId, classId, branchId, noteId),
  );
}

export async function saveOfflineDraft(draft) {
  return writeRecord("drafts", {
    ...draft,
    key: offlineDraftKey(
      draft.userId,
      draft.classId,
      draft.branchId,
      draft.noteId,
    ),
  });
}

export function deleteOfflineDraft(userId, classId, branchId, noteId) {
  return deleteRecord(
    "drafts",
    offlineDraftKey(userId, classId, branchId, noteId),
  );
}

export async function saveNoteMutation(mutation) {
  const existing = await readRecord("mutations", mutation.key);
  return writeRecord(
    "mutations",
    mergePendingMutation(existing, mutation),
  );
}

export async function listNoteMutations(userId, classId = null) {
  return (await readAll("mutations"))
    .filter((item) => (
      item.userId === userId
      && (classId === null || item.classId === classId)
    ))
    .sort((left, right) => left.createdAt - right.createdAt);
}

export function deleteNoteMutation(key) {
  return deleteRecord("mutations", key);
}

export async function completeNoteMutation(mutation, note) {
  await transact(["notes", "drafts", "mutations"], "readwrite", (transaction) => {
    const notes = transaction.objectStore("notes");
    const drafts = transaction.objectStore("drafts");
    const mutations = transaction.objectStore("mutations");
    notes.delete(offlineNoteKey(
      mutation.userId,
      mutation.classId,
      mutation.noteId,
    ));
    notes.put({
      ...note,
      key: offlineNoteKey(mutation.userId, mutation.classId, note.id),
      userId: mutation.userId,
      classId: mutation.classId,
      branchId: mutation.branchId,
      ownerId: mutation.userId,
      ownerName: mutation.userName,
    });
    drafts.delete(offlineDraftKey(
      mutation.userId,
      mutation.classId,
      mutation.branchId,
      mutation.noteId,
    ));
    mutations.delete(mutation.key);
  });
}

export async function clearOfflineRecords() {
  await transact(STORE_NAMES, "readwrite", (transaction) => {
    for (const storeName of STORE_NAMES) {
      transaction.objectStore(storeName).clear();
    }
  });
}

export async function clearOfflineData() {
  let recordError = null;
  let cacheError = null;
  if (globalThis.indexedDB) {
    try {
      await clearOfflineRecords();
    } catch (error) {
      recordError = error;
    }
  }
  if (globalThis.caches) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith(CACHE_PREFIX))
          .map((name) => caches.delete(name)),
      );
    } catch (error) {
      cacheError = error;
    }
  }
  if (recordError && cacheError) {
    throw new AggregateError(
      [recordError, cacheError],
      "Não foi possível remover todos os dados offline.",
    );
  }
  if (recordError) throw recordError;
  if (cacheError) throw cacheError;
}

export function offlineStorageAvailable() {
  return Boolean(globalThis.indexedDB);
}
