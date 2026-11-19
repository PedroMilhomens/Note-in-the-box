# Registro técnico de tratamento de dados

Este registro descreve o tratamento técnico implementado; não determina base legal nem substitui revisão humana. Itens marcados `HUMANO` precisam ser definidos antes do uso em produção.

## Ciclos Pomodoro - fase 10

- **Dados:** `user_id`, `class_id` opcional, tipo de ciclo, início, duração em segundos e indicador de conclusão. Todos os campos já existiam em `pomodoro_sessions`; esta fase passou a gravar sessões concluídas.
- **Finalidade técnica:** registrar os ciclos concluídos iniciados pelo usuário, associados opcionalmente a uma classe.
- **Acesso:** a gravação exige sessão autenticada. Se uma classe for informada, a API valida a associação do usuário. Não há rota pública nem listagem do histórico; a resposta da criação retorna somente a sessão recém-criada ao usuário autenticado.
- **Compartilhamento:** notificações mostram somente uma mensagem genérica; não incluem nome de classe ou conteúdo de estudo. Nenhum terceiro recebe os dados.
- **Exclusão:** a exclusão da conta remove as sessões pelo vínculo `user_id`; a exclusão da classe remove o vínculo `class_id`, mantendo o registro pessoal enquanto a conta existir.
- **Base legal e prazo de retenção:** `HUMANO` - validar a base legal aplicável e definir prazo antes de habilitar o uso em produção.
