// Estado de sessão apenas em memória; dados pessoais não são guardados no armazenamento do navegador.
let estado = { user: null, offline: false, classes: [] };
const ouvintes = new Set();

export function getSessao() { return estado; }

export function setSessao(proximo) {
  estado = { ...estado, ...proximo };
  for (const ouvinte of ouvintes) ouvinte(estado);
}

export function observarSessao(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}
