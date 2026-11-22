// Cliente da API. Só fala com /api/ da mesma origem; o servidor confere Origin nas mutações.
export class ApiError extends Error {
  constructor(status, codigo, mensagem, payload = null) {
    super(mensagem);
    this.name = "ApiError";
    this.status = status;
    this.codigo = codigo;
    this.payload = payload;
  }
}

// Falha de conexão (sem resposta do servidor), em oposição a um erro HTTP.
export function ehErroDeRede(erro) {
  return erro instanceof TypeError || erro?.status === 0;
}

export function createApi({ fetchImpl = globalThis.fetch?.bind(globalThis), onUnauthorized } = {}) {
  async function request(metodo, caminho, corpo, { semRedirecionar = false, bruto, cabecalhos } = {}) {
    if (typeof caminho !== "string" || !caminho.startsWith("/api/") || caminho.startsWith("//")) {
      throw new TypeError("Caminho de API inválido");
    }
    const init = { method: metodo, credentials: "same-origin", headers: { accept: "application/json" } };
    if (bruto !== undefined) {
      Object.assign(init.headers, cabecalhos);
      init.body = bruto;
    } else if (corpo !== undefined) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(corpo);
    }

    let resposta;
    try {
      resposta = await fetchImpl(caminho, init);
    } catch {
      throw new ApiError(0, "SEM_REDE", "Sem conexão com o servidor.");
    }

    let dados = null;
    if ((resposta.headers.get("content-type") ?? "").includes("application/json")) {
      try {
        dados = await resposta.json();
      } catch {
        dados = null;
      }
    }

    if (!resposta.ok) {
      if (resposta.status === 401 && !semRedirecionar) onUnauthorized?.();
      throw new ApiError(resposta.status, dados?.codigo ?? "ERRO", dados?.erro ?? "Não foi possível concluir a ação.", dados);
    }
    return dados;
  }

  return {
    request,
    get: (caminho, opcoes) => request("GET", caminho, undefined, opcoes),
    post: (caminho, corpo, opcoes) => request("POST", caminho, corpo ?? {}, opcoes),
    patch: (caminho, corpo, opcoes) => request("PATCH", caminho, corpo ?? {}, opcoes),
    delete: (caminho, corpo, opcoes) => request("DELETE", caminho, corpo, opcoes),
    upload: (caminho, arquivo, cabecalhos) => request("POST", caminho, undefined, { bruto: arquivo, cabecalhos }),
  };
}
