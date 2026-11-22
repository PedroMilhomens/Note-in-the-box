// Formatação de datas e contagens em português.
export function plural(n, singular, pluralTexto) {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

// "2026-11-07" -> "07/11". Aceita só datas ISO simples (AAAA-MM-DD).
export function dataCurta(iso) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(iso ?? ""));
  return partes ? `${partes[3]}/${partes[2]}` : "";
}

// Tempo relativo curto: "agora", "há 5 min", "há 2 h", "ontem", "há 3 dias".
export function tempoRelativo(iso, agora = Date.now()) {
  const instante = Date.parse(iso ?? "");
  if (Number.isNaN(instante)) return "";
  const minutos = Math.max(0, Math.floor((agora - instante) / 60_000));
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  return "há mais de um mês";
}

export const ROTULO_STATUS = {
  draft: "Rascunho",
  complete: "Completa",
  incomplete: "Incompleta",
};

export function listaDeNomes(nomes) {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
}
