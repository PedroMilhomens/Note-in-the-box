# Dependências externas

## pg

- Função: driver PostgreSQL para Node.js.
- Por que não nativo: Node.js não possui implementação nativa de protocolo PostgreSQL.
- Versão fixa: `8.23.1`.
- Licença: MIT.
- Resultado do npm audit: **0 vulnerabilidades** (verificado em 2026-11-24, `npm audit --omit=dev`).

## Docker Base Images (runtime)

### node:22-alpine
- Função: imagem base do runtime da aplicação (Stage 2 do Dockerfile multi-stage).
- Por que não nativo: Docker não tem runtime nativo; Node.js é a plataforma da aplicação.
- Versão fixa: `22-alpine` (digest pinado no build).
- Licença: MIT (Node.js) / Alpine Linux (GPL/BSD/MIT).
- Tamanho: ~40 MB (base) + ~20 MB (node_modules pg).
- Resultado do npm audit: **0 vulnerabilidades** (herda do `npm audit` da aplicação).

### postgres:16-alpine
- Função: banco de dados PostgreSQL 16 para produção e testes.
- Por que não nativo: PostgreSQL é serviço externo; roda em contêiner separado.
- Versão fixa: `16-alpine` (digest pinado no compose).
- Licença: PostgreSQL License (similar a MIT/BSD).
- Tamanho: ~80 MB.
- Configuração: usuário `nib_user` sem SUPERUSER; TLS opcional via `sslmode=disable` em rede interna.

### dumb-init (apk)
- Função: init system mínimo para tratamento correto de sinais (SIGTERM, etc.) no contêiner.
- Por que não nativo: PID 1 no Linux não repassa sinais para filhos sem init.
- Versão: última do repositório Alpine (instalada via `apk add --no-cache dumb-init`).
- Licença: MIT.
