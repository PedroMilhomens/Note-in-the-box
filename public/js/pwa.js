import { clearOfflineData } from "./offline-store.js";

const logoutChannel = "BroadcastChannel" in globalThis
  ? new BroadcastChannel("note-in-the-box-logout")
  : null;

function showLogoutStatus(message, isError = false) {
  for (const logoutStatus of document.querySelectorAll("#logout-status, .logout-status")) {
    logoutStatus.textContent = message;
    logoutStatus.classList.toggle("error", isError);
  }
}

async function logout(logoutButton) {
  if (!navigator.onLine) {
    showLogoutStatus("Conecte-se à internet para encerrar sua sessão.", true);
    return;
  }

  logoutButton.disabled = true;
  showLogoutStatus("Encerrando sessão e removendo dados offline...");
  let response;
  try {
    response = await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    logoutButton.disabled = false;
    showLogoutStatus("Não foi possível encerrar a sessão. Tente novamente.", true);
    return;
  }

  if (!response.ok) {
    logoutButton.disabled = false;
    showLogoutStatus("Não foi possível encerrar a sessão.", true);
    return;
  }

  try {
    await clearOfflineData();
  } catch {
    showLogoutStatus(
      "A sessão foi encerrada, mas não foi possível remover os dados offline deste dispositivo.",
      true,
    );
    return;
  }
  logoutChannel?.postMessage("logout");
  window.location.replace("/");
}

// Delegação: o botão pode ser criado depois (shell do app) ou já existir (páginas antigas).
document.addEventListener("click", (event) => {
  const logoutButton = event.target.closest?.("#logout-button, [data-logout]");
  if (logoutButton) void logout(logoutButton);
});

logoutChannel?.addEventListener("message", (event) => {
  if (event.data === "logout") window.location.replace("/");
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js", { scope: "/" })
    .then(() => {
      window.dispatchEvent(new Event("pwa-ready"));
    })
    .catch(() => {
      window.dispatchEvent(new Event("pwa-registration-error"));
    });
}

window.addEventListener("online", () => {
  window.dispatchEvent(new Event("connection-state-change"));
});
window.addEventListener("offline", () => {
  window.dispatchEvent(new Event("connection-state-change"));
});
