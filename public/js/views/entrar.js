import { renderAuth } from "../components/auth-form.js";

export const titulo = "Entrar";

export function render(contexto) {
  return renderAuth({ ...contexto, modo: "entrar" });
}
