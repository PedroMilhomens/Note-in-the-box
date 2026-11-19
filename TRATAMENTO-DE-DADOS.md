# Registro técnico de tratamento de dados

Este registro descreve o tratamento técnico implementado; não determina base legal nem substitui revisão humana. Itens marcados `HUMANO` precisam ser definidos antes do uso em produção.

## Ciclos Pomodoro - fase 10

- **Dados:** `user_id`, `class_id` opcional, tipo de ciclo, início, duração em segundos e indicador de conclusão. Todos os campos já existiam em `pomodoro_sessions`; esta fase passou a gravar sessões concluídas.
- **Finalidade técnica:** registrar os ciclos concluídos iniciados pelo usuário, associados opcionalmente a uma classe.
- **Acesso:** a gravação exige sessão autenticada. Se uma classe for informada, a API valida a associação do usuário. Não há rota pública nem listagem do histórico; a resposta da criação retorna somente a sessão recém-criada ao usuário autenticado.
- **Compartilhamento:** notificações mostram somente uma mensagem genérica; não incluem nome de classe ou conteúdo de estudo. Nenhum terceiro recebe os dados.
- **Exclusão:** a exclusão da conta remove as sessões pelo vínculo `user_id`; a exclusão da classe remove o vínculo `class_id`, mantendo o registro pessoal enquanto a conta existir.
- **Base legal e prazo de retenção:** `HUMANO` - validar a base legal aplicável e definir prazo antes de habilitar o uso em produção.

## Armazenamento offline - fase 11

- **Dados:** cópias locais do nome e identificadores da conta/classe/branch, título, corpo, data e estado de notas da branch própria; rascunhos e alterações pendentes incluem a revisão-base e dados de sincronização. Nenhum campo novo foi adicionado ao banco.
- **Finalidade técnica:** abrir notas próprias e continuar rascunhos sem conexão; sincronizar alterações explícitas quando a conexão voltar; detectar alterações concorrentes sem sobrescrever silenciosamente a versão do servidor.
- **Armazenamento e acesso:** IndexedDB no perfil do navegador e dispositivo usados pelo próprio titular. O app não usa `localStorage` e não copia notas de colegas para o armazenamento offline. Não há transmissão a terceiros.
- **Cache:** o Service Worker armazena somente arquivos estáticos de uma lista fixa. Requisições de API autenticadas não são interceptadas nem armazenadas no Cache Storage.
- **Exclusão e retenção:** “Sair” limpa os registros do IndexedDB e os caches do app após a sessão ser encerrada; “Apagar dados offline deste dispositivo” limpa os registros e caches localmente. Limpar os dados do site no navegador também remove o armazenamento. `HUMANO` - definir prazo de retenção e avaliar o risco de uso em dispositivo compartilhado antes da produção.
- **Base legal:** `HUMANO` - validar a base aplicável ao armazenamento local das notas e rascunhos.
