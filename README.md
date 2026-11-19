# Projeto final de Introdução ao desenvolvimento para dispositivos móvies
### Nome do projeto: Note in the box
*Autor do projeto: Pedro Henrique de Oliveira Milhomens*<br>
E-mail para contato: pmilhomens1211@gmail.com

**Descrição inicial do problema:**

Todo universitário ou estudante já passou por algum problema em relação suas anotações para uma classe, seja perder uma aula por conta de trabalho, doença transporte ou outro motivo, suas anotações estarem incompletas ou desorganizadas, então quando chega época de prova, ter que virar um adivinho para descobrir onde estão suas anotações, se você fez anotações, qual ordem elas estão e como usar elas para estudar, para no final de tudo chegar na prova e ter um branco sobre tudo que estudou. 
Esses são os problemas que a **Note in the box** quer resolver, nós centralizammos seu estudo em apenas um ambiente compartilhado, junto das suas anotações e de seus colegas e ferramentas para auxiliá-lo em seus estudos. 

**Como vamos te ajudar? (Futuras implementações)**

Dentro do aplicativo as anotações serão organizadas por classes, cada classe age como um repositório git sem uma branch main ou master, cada aluno possui sua própria "branch", e as versões dos outros alunos na classe ficam disponíveis para vizualição e comentários, dentro das branches cada anotação pode referênciar uma outra seja ela pertencente a sua branch ou não, com o tempo essas anotações vão se tornar uma rede de informações conexas, fora as "branches" cada classe possui um fórum para discussão, e uma ferramenta para os usuários criarem flashcards e revisões sobre a matéria. Além das classes a paginal principal tem uma área para criação de novas classes ou para entrar em uma classe já existente e possui um timer de pomodoro, um metódo de estudo para quem não consegue manter o foco por muito tempo, com pausas reguralares para manter o cérebro ativo e causar a sensação de recompensa ao terminar cada período de estudo, que está lá para auxiliá-lo ainda mais em seus estudos.

Preview do site em [PREVIEW.md](PREVIEW.md).


## Desenvolvimento - fase 0

### Pré-requisitos

- Node.js 22 ou mais recente
- npm

### Configuração local

1. Copie `.env.example` para `.env`.
2. Ajuste `HOST` e `PORT`, se necessário.
3. Execute `npm install`.
4. Execute `npm start`.
5. Confira `http://127.0.0.1:3000/api/saude`.

### Comandos

- `npm start`: inicia o servidor local.
- `npm test`: executa testes unitários, integração e smoke.
- `npm run test:security`: executa testes de segurança.
- `npm run verify`: executa todos os testes e auditoria de dependências.

## Banco de dados

- Configure `DATABASE_URL` no `.env` para o PostgreSQL de desenvolvimento.
- Configure `DATABASE_URL_TEST` somente para o banco separado usado pela integração.
- Execute `npm run migrate` para aplicar migrations pendentes.
- Execute `npm run migrate:test` para preparar o banco de teste; o comando rejeita alvos que não terminem em `test`.
- Nunca execute os testes ou migrations contra desenvolvimento ou produção.

## HTTP e arquivos estáticos

- O servidor publica somente arquivos dentro de `public/`.
- Rotas de API devem ser registradas no roteador próprio em `src/server/router.js`.
- O leitor JSON limita o corpo a 1 MB e o tempo de leitura a 10 segundos por padrão.
- Respostas incluem CSP e cabeçalhos de segurança; CORS permanece fechado.
- Os logs são JSON estruturado e não incluem caminho completo, query string, cabeçalhos ou corpo.

## Autenticação - fase 3

- Cadastro: `POST /api/auth/register` com nome, e-mail, senha e `acceptTerms`/`acceptPrivacy` iguais a `true`.
- Login: `POST /api/auth/login`; a sessão é entregue em cookie `HttpOnly`, `SameSite=Lax`, com `Secure` em produção.
- Conta atual: `GET /api/me`; logout: `POST /api/auth/logout`.
- Requisições que alteram dados devem enviar `Origin` ou `Referer` da mesma origem.
- A configuração exige banco PostgreSQL. Os testes de integração usam exclusivamente `DATABASE_URL_TEST`, cujo nome deve identificar um banco de teste.
- O cadastro permanece bloqueado enquanto `LEGAL_DOCUMENTS_APPROVED=false`. Os textos em `/termos.html` e `/privacidade.html` são avisos, não documentos legais; somente habilite o cadastro após aprovação humana dos textos finais.
- Em produção, configure `APP_ORIGIN` como a origem HTTPS pública.

## Classes - fase 4

- `POST /api/classes` cria uma classe, adiciona o criador como proprietário e cria sua branch. A resposta inclui o código de convite uma única vez; somente o hash do código é armazenado.
- `POST /api/classes/join` recebe `{ "inviteCode": "..." }`, adiciona o usuário como membro e cria (ou reutiliza) sua branch.
- `GET /api/classes` lista as classes do usuário; `GET /api/classes/:classId` retorna os detalhes somente para membros.
- As rotas de listagem aceitam `limit` (1 a 100, padrão 20) e `offset` (0 a 1.000.000). E-mails dos membros e códigos de convite não são incluídos nas respostas.
- Um usuário sem sessão recebe `401`; um usuário autenticado que não pertence à classe recebe `404` ao tentar ler seus detalhes.

## Notas - fase 5

- `POST` e `GET /api/classes/:classId/branches/:branchId/notes` criam notas na branch própria ou listam as notas de uma branch da classe; listas omitem o corpo.
- `GET`, `PATCH` e `DELETE /api/classes/:classId/notes/:noteId` leem, salvam e excluem notas. Todos os membros leem; somente o dono da branch pode alterar ou excluir. Cada criação e salvamento registra uma versão do corpo em `note_versions`.
- `GET /api/classes/:classId/missed-lessons` identifica datas passadas com notas de colegas e sem nota na branch do usuário, sugerindo até cinco notas de colegas por data. A comparação usa as datas disponíveis nas próprias notas, pois ainda não há calendário de aulas.
- As rotas exigem sessão e associação à classe; um membro que tenta editar nota alheia recebe `403`. O editor em `/notes.html` renderiza conteúdo do usuário com `textContent`.
- Listas de notas e aulas aceitam `limit` (1 a 100, padrão 20) e `offset` (0 a 1.000.000).

## Rede de notas - fase 6

- `GET /api/classes/:classId/notes/:noteId/references` lista referências; `POST` no mesmo caminho cria uma referência e `DELETE /api/classes/:classId/notes/:noteId/references/:targetNoteId` a remove.
- O destino deve ser uma nota ativa de outra branch da mesma classe. Somente o dono da nota de origem pode criar ou remover referências.
- `GET /api/classes/:classId/reference-candidates?noteId=...` lista destinos possíveis; `GET /api/classes/:classId/graph?noteId=...` devolve a nota e suas conexões diretas. Ambos respeitam a associação à classe e a paginação.
- No editor, “Referenciar nota” ou `Alt+Shift+R` insere `[[título]]`; o mapa SVG é construído com elementos de texto, sem interpretar títulos como HTML.

## Comentários, anexos e denúncias - fase 7

- Membros da classe podem consultar e comentar notas ativas. As respostas incluem autoria e data; comentários podem ser excluídos pelo próprio autor ou pelo dono da nota.
- O dono da nota pode anexar até cinco arquivos de até 5 MB cada: PDF, PNG, JPEG ou WebP. O servidor confere a assinatura dos bytes, gera uma chave aleatória e armazena os arquivos na pasta ignorada `uploads/`, fora de `public/`.
- Anexos são listados e baixados somente por membros autenticados da classe; downloads usam `Content-Disposition: attachment` e `nosniff`. Só o dono da nota pode enviar ou remover anexos.
- O editor permite denunciar notas e comentários; o fórum permite denunciar tópicos e respostas. `POST /api/classes/:classId/reports` recebe `targetType`, `targetId` e `reason` e valida se o alvo ativo pertence à classe.
- Comentários, upload, download, remoção de anexos e denúncias exigem sessão e associação à classe. Denúncias e criação de conteúdo têm limite de tentativas.

## Fórum - fase 8

- `GET` e `POST /api/classes/:classId/forum/topics` listam e criam tópicos. A listagem é paginada; título aceita até 200 caracteres e o corpo até 20.000.
- `GET /api/classes/:classId/forum/topics/:topicId/posts` retorna o tópico e respostas; `POST` no mesmo caminho publica uma resposta. As respostas também são paginadas.
- Tópicos podem referenciar opcionalmente uma nota ativa da mesma classe; referências a outra classe são rejeitadas. `GET /api/classes/:classId/forum/notes` fornece opções paginadas para a interface.
- `GET /api/classes/:classId` inclui as regras da classe. O dono pode alterá-las com `PATCH /api/classes/:classId/rules` (até 5000 caracteres); outros membros só podem consultá-las.
- O autor pode excluir seu conteúdo e o dono da classe pode moderar tópicos ou respostas de qualquer membro; a exclusão é lógica. A interface em `/forum.html` mostra as regras no topo e oferece denúncia em tópicos e respostas.
- Todas as rotas do fórum exigem associação à classe; criação de tópicos, respostas e alteração de regras têm limite de tentativas. Conteúdo de usuários é exibido como texto, sem interpretação HTML.

## Flashcards - fase 9

- `GET` e `POST /api/classes/:classId/flashcards` listam (paginado) e criam cartões para a classe; somente membros acessam. Perguntas aceitam até 500 caracteres e respostas até 20.000.
- `GET /api/classes/:classId/flashcards/due` retorna os cartões ainda não revisados ou já vencidos para o usuário autenticado. Cada membro mantém seu próprio calendário, mesmo quando os cartões são compartilhados na classe.
- `POST /api/flashcards/:cardId/review` recebe `{ "rating": "errei|dificil|bom|facil" }`; só aceita cartões vencidos ou nunca revisados. `GET /api/classes/:classId/flashcards/performance` resume as contagens pessoais dos últimos sete dias UTC.
- Intervalos: `errei` reinicia em 10 minutos; `dificil` usa `ceil(1,2 × intervalo anterior)` com mínimo de 1 dia; `bom`, `ceil(2 × intervalo anterior)` com mínimo de 2 dias; `facil`, `ceil(3 × intervalo anterior)` com mínimo de 4 dias. Para o primeiro review, o intervalo anterior é zero e aplicam-se os mínimos.
- Em `/flashcards.html` é possível criar cartões manualmente, revisar os pendentes e consultar o desempenho. Em `/notes.html`, selecionar um trecho da visualização preenche a resposta e vincula o cartão à nota. O texto selecionado não é colocado na URL nem persistido em armazenamento local.
- A migration `004_flashcard_review_indexes.sql` adiciona índices ao histórico sem alterar migrations anteriores. Conteúdo de cartão é exibido como texto; o título de nota relacionado só é consultado dentro da mesma classe.

## Pomodoro - fase 10

- `/pomodoro.html` inicia ciclos de foco, pausa curta e pausa longa. Os padrões são 25, 5 e 15 minutos; cada duração pode ser configurada entre 1 e 120 minutos. A pausa longa segue quatro ciclos de foco concluídos.
- O timer usa Web Worker e calcula o restante por prazo absoluto, para não acumular deriva em abas em segundo plano. Sem suporte a Worker, usa uma alternativa que recalcula o tempo restante.
- Notificações genéricas só podem solicitar permissão após o usuário iniciar o timer; o Wake Lock é tentado somente durante foco e a saída da aba durante foco é avisada pelo Page Visibility. APIs opcionais indisponíveis não impedem o timer.
- `POST /api/pomodoro/sessions` registra ciclos concluídos para a conta autenticada. `kind` aceita `foco`, `pausa` ou `longa`; `durationS` aceita 60 a 7200 segundos; `startedAt` deve ser ISO UTC e indicar que a duração passou; `classId` pode ser nulo ou apontar para uma classe de que o usuário seja membro. Ciclos incompletos não são gravados.
- As sessões são privadas do usuário; uma classe associada só é aceita após validação de associação. O endpoint aplica rate limit, valida a entrada e não registra texto de notas ou outros conteúdos.
- O registro técnico desses dados e as pendências humanas de base legal e retenção estão em [TRATAMENTO-DE-DADOS.md](./TRATAMENTO-DE-DADOS.md).

<br><br>
*Por enquanto é só! Obrigado por ter lido até aqui! Nos vemos nas próximas atualizações. - Equipe Note in the box.*