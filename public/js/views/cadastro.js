import { renderAuth } from "../components/auth-form.js";

export const titulo = "Criar conta";

export function render(contexto) {
  return renderAuth({ ...contexto, modo: "cadastro" });
}
