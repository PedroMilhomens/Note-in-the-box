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

<br><br>
*Por enquanto é só! Obrigado por ter lido até aqui! Nos vemos nas próximas atualizações. - Equipe Note in the box.*