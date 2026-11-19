import { clearOfflineData } from "./offline-store.js";

const profileForm = document.querySelector("#profile-form");
const accountStatus = document.querySelector("#account-status");
const consentList = document.querySelector("#consent-list");
const exportButton = document.querySelector("#export-data");
const deleteForm = document.querySelector("#delete-form");
const deleteConfirmation = document.querySelector("#delete-confirmation");
const logoutChannel = "BroadcastChannel" in globalThis
  ? new BroadcastChannel("note-in-the-box-logout")
  : null;
const profileInputs = {
  name: document.querySelector("#profile-name"),
  email: document.querySelector("#profile-email"),
  institution: document.querySelector("#profile-institution"),
  course: document.querySelector("#profile-course"),
};
const submitProfileButton = document.querySelector("#save-profile");
const deleteAccountButton = document.querySelector("#delete-account");

function showStatus(message, isError = false) {
  accountStatus.textContent = message;
  accountStatus.classList.toggle("error", isError);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.erro ?? "Não foi possível concluir a solicitação.");
  }
  return response;
}

function consentTitle(kind) {
  return kind === "termos" ? "Termos de Uso" : "Política de Privacidade";
}

function formatDate(value) {
  return new Date(value).toLocaleString("pt-BR");
}

function renderConsents(consents) {
  consentList.replaceChildren();
  for (const consent of consents) {
    const item = document.createElement("li");
    const description = document.createElement("p");
    description.className = "consent-description";
    description.textContent = consent.revokedAt
      ? `${consentTitle(consent.kind)} (${consent.version}) — revogado em ${formatDate(consent.revokedAt)}`
      : `${consentTitle(consent.kind)} (${consent.version}) — aceito em ${formatDate(consent.grantedAt)}`;
    item.append(description);

    if (!consent.revokedAt) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = `Revogar ${consentTitle(consent.kind)}`;
      button.addEventListener("click", () => {
        void revokeConsent(consent.kind, button);
      });
      item.append(button);
    }
    consentList.append(item);
  }
  if (consents.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "Nenhum consentimento registrado.";
    consentList.append(empty);
  }
}

async function loadAccount() {
  const [accountResponse, consentResponse] = await Promise.all([
    request("/api/me"),
    request("/api/me/consents"),
  ]);
  const { user } = await accountResponse.json();
  const { consents } = await consentResponse.json();
  for (const [field, input] of Object.entries(profileInputs)) {
    input.value = user[field] ?? "";
    input.disabled = false;
  }
  submitProfileButton.disabled = false;
  exportButton.disabled = false;
  deleteConfirmation.disabled = false;
  deleteAccountButton.disabled = false;
  renderConsents(consents);
  showStatus("");
}

async function revokeConsent(kind, button) {
  button.disabled = true;
  try {
    const response = await request("/api/me/consents", {
      method: "PATCH",
      body: JSON.stringify({ kind }),
    });
    const { consent } = await response.json();
    const currentConsents = await request("/api/me/consents");
    renderConsents((await currentConsents.json()).consents);
    showStatus(`${consentTitle(consent.kind)}: solicitação de revogação registrada.`);
  } catch (error) {
    button.disabled = false;
    showStatus(error.message, true);
  }
}

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitProfileButton.disabled = true;
  const fields = Object.fromEntries(
    Object.entries(profileInputs).map(([field, input]) => [field, input.value]),
  );
  try {
    const response = await request("/api/me", {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
    const { user } = await response.json();
    for (const [field, input] of Object.entries(profileInputs)) {
      input.value = user[field] ?? "";
    }
    showStatus("Seus dados foram atualizados.");
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    submitProfileButton.disabled = false;
  }
});

exportButton.addEventListener("click", async () => {
  exportButton.disabled = true;
  try {
    const response = await request("/api/me/export");
    const download = document.createElement("a");
    const objectUrl = URL.createObjectURL(await response.blob());
    download.href = objectUrl;
    download.download = "meus-dados.json";
    download.hidden = true;
    document.body.append(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    showStatus("Sua exportação foi preparada.");
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    exportButton.disabled = false;
  }
});

deleteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (deleteConfirmation.value !== "EXCLUIR") {
    showStatus("Digite EXCLUIR para confirmar.", true);
    deleteConfirmation.focus();
    return;
  }
  deleteAccountButton.disabled = true;
  try {
    await request("/api/me", {
      method: "DELETE",
      body: JSON.stringify({ confirmation: deleteConfirmation.value }),
    });
    try {
      await clearOfflineData();
    } catch (error) {
      showStatus(
        `A conta foi excluída, mas os dados locais não foram removidos: ${error.message}`,
        true,
      );
      return;
    }
    logoutChannel?.postMessage("logout");
    window.location.replace("/");
  } catch (error) {
    showStatus(error.message, true);
    deleteAccountButton.disabled = false;
  }
});

loadAccount().catch((error) => {
  showStatus(error.message, true);
});
