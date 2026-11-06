# POMI Backend Workspace

[![Lint and Format](https://github.com/ominira-unicamp/pomi-backend/actions/workflows/lint-and-format.yml/badge.svg?branch=main)](https://github.com/ominira-unicamp/pomi-backend/actions/workflows/lint-and-format.yml)
[![Deploy to GCP](https://github.com/ominira-unicamp/pomi-backend/actions/workflows/deploy.yml/badge.svg)](https://github.com/ominira-unicamp/pomi-backend/actions/workflows/deploy.yml)
![GitHub last commit (branch)](https://img.shields.io/github/last-commit/ominira-unicamp/pomi-backend/main)
![GitHub contributors](https://img.shields.io/github/contributors/ominira-unicamp/pomi-backend)

Este workspace reúne a API pública de dados universitários, a API de recursos pessoais do POMI, o schema compartilhado do banco e os processos de injeção.

## Índice

- [Tecnologias](#tecnologias)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Executando o Projeto](#executando-o-projeto)
- [Estrutura do Projeto](#estrutura-do-projeto)

## Sobre o Projeto

## Tecnologias

- **Runtime:** Node.js
- **Framework:** Express 5
- **Linguagem:** TypeScript
- **ORM:** Prisma 7
- **Banco de Dados:** PostgreSQL
- **Validação:** Zod
- **Documentação:** OpenAPI/Swagger (Scalar)
- **Autenticação:** OpenID Connect com Keycloak e validação JWT via JWKS (`jose`)
- **Segurança:** Helmet, CORS
- **Containerização:** Docker & Docker Compose

## Pré-requisitos

- Node.js (v18+)
- npm ou yarn
- Docker e Docker Compose (opcional, para desenvolvimento com containers)
- PostgreSQL (se não usar Docker)

## Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/ominira-unicamp/pomi-backend.git
cd pomi-backend
```

### 2. Instale as dependências

```bash
npm install
```

## Configuração

### Variáveis de Ambiente

Crie um arquivo `.env`, ou `.docker.env` caso utilize o docker, na raiz do projeto conforme o `.env.template`.

Com autenticação habilitada, configure `KEYCLOAK_ISSUER` e
`KEYCLOAK_AUDIENCE=pomi-api`. `DISABLED_AUTH=true` é aceito somente fora de
produção.

A primeira requisição autenticada de uma credencial humana desconhecida admite
automaticamente Principal, User e AuthIdentity, sem criar Student. Os clientes
humanos elegíveis são definidos por `KEYCLOAK_HUMAN_CLIENT_IDS` (lista separada
por vírgulas, padrão `pomi-frontend,pomi-token-cli`), comparada ao claim assinado
`azp`. Inclua somente clientes sem emissão de credenciais de serviço. Nome e
contato inicial vêm do token, sem associação por e-mail nem atualização automática
posterior. E-mail válido é normalizado e cadastrado como contato não verificado.
Uma lista vazia desabilita novas admissões; contas já cadastradas continuam
sujeitas aos bloqueios e permissões existentes.

## Executando o Projeto

Para iniciar o ambiente de desenvolvimento em um ambiente com docker:

```bash
# Inicie o banco e aplique as migrations
docker compose up db db-migrate -d

# Execute as migrations
npm run prisma:migrate:dev

# Gere o cliente Prisma
npm run prisma:generate

# Inicie as APIs em terminais separados
npm run dev:data
npm run dev:app
```

Para executar PostgreSQL, Keycloak e as duas APIs, preencha `.docker.env` a partir
de `.env.template` e execute `docker compose up --build`. A POMI Data API fica em
`http://localhost:3000` e a POMI App API em `http://localhost:3001`. Esse Compose usa a
configuração declarativa em `../pomi-infra/slices/pomi/keycloak` e o tema em
`../pomi-keycloak-theme/theme/pomi`; portanto, os três projetos devem estar
lado a lado. O realm `pomi`, o client público
`pomi-frontend` e a audiência `pomi-api` são reconciliados pelo serviço
transitório `keycloak-config`. O console local fica em `http://localhost:8080`.

### Orquestração de obtenções e injeções

O pacote `@pomi/injection` fornece o CLI `pomi-injection`. Cada injection é
predefinida no registry do pacote: a obtenção roda em um subprocesso externo e
a persistência é executada pelo serviço correspondente. O JSON configura a
agenda, o comando de obtenção, o arquivo de entrada e as opções tipadas da função.

Copie `packages/injection/injections.example.json`, ajuste os comandos e use:

```bash
npm run injection:validate
npm run injection:list
npm run injection:run -- academic-data
npm run injection:watch

# Enfileirar uma execução manual (retorna o ID do job)
# `request` usa apenas capabilities registradas no código; o worker usa o JSON operacional.
npm run injection:request -- academic-data all
npm run injection:request -- catalog-programs all --first-year 2026 --last-year 2026 --profile complete
npm run notifier:request

# Consultar o estado de um job
npm run injection:job-status -- <job-id>
npm run injection:retry -- <workflow-job-id>
npm run notifier:job-status -- <job-id>
```

`catalog-programs` é um workflow anual. O perfil `core` garante o vínculo do
programa com o catálogo, `available` coleta os componentes suportados pela
fonte daquele ano e `complete` exige currículos, informações institucionais e
sugestões. Para catálogos históricos, `complete` só publica quando os quatro
componentes foram coletados e validados; o backfill de 1998–2020 é manual. O job executa obtenção,
validação e persistência de um snapshot imutável. Os artefatos ficam em
`data/snapshots/catalog-programs/<ano>/<snapshot-id>`, com manifesto, hashes e
componentes versionados; a injection consome somente esse contrato JSON e não
importa código do provider. O modo `inject` exige `--snapshot-id`. São
preservados os três snapshots publicados mais recentes por ano e snapshots
com falha por sete dias.

O `watch` executa uma injection por vez, registra falhas e aguarda a próxima
ocorrência cron definida em cada entrada. As expressões usam cinco campos e o
fuso horário local do processo (configurável por `TZ`). O diretório de dados e
o lock do scheduler ficam sob a raiz configurada, sem remover arquivos
existentes. As configurações de catálogo usam somente
`catalog-programs-snapshot`; os persistidores de currículos, informações e
sugestões permanecem internos ao consumidor composto. Os demais tipos
configuráveis incluem `academic-data`, `calendar`, `catalog-disciplines`,
`daily-menus` e `exchange-notices`.
As alterações persistidas são emitidas como eventos JSON pelo Pino no stdout;
o nível pode ser ajustado com `LOG_LEVEL`. O envio opcional para OpenObserve usa
`OPENOBSERVE_URL` e `OPENOBSERVE_AUTH`, ou `OPENOBSERVE_USER` e
`OPENOBSERVE_PASSWORD`; o stream padrão é `pomi-injection-logs` e pode ser
alterado com `OPENOBSERVE_STREAM`. Sem `OPENOBSERVE_URL`, nenhum envio remoto
é realizado.

### Auditoria de integridade dos dados institucionais

Com `DATABASE_URL` configurada, execute `npm run data:integrity` para
conferir invariantes dos dados institucionais mantidos pela POMI Data API nos
schemas `data` e `unicamp_data_portal`: catálogo, períodos e turmas, horários,
perfis de docentes, cardápios, editais, calendário e eventos de auditoria.
Use `-- --json` para saída estruturada e `-- --sample-limit=10` para limitar
as chaves exibidas por regra. O comando apenas lê o banco: retorna `0` sem
ocorrências, `1` quando encontra ocorrências e `2` quando a auditoria falha.
Ele verifica invariantes locais e relações semânticas; a existência de todos
os registros esperados depende de comparação com os snapshots de origem.
Registros pessoais e operacionais da POMI App não fazem parte desta auditoria.

### Logs e telemetria das APIs

As APIs POMI Data e POMI App emitem logs JSON no stdout para cada requisição,
com `requestId`, método, rota parametrizada, status e duração. O identificador
também é devolvido em `X-Request-ID`, permitindo correlacionar uma resposta ao
log correspondente. Corpos, tokens e cookies não são registrados.

Use `LOG_LEVEL` para ajustar a verbosidade. Para enviar os mesmos eventos ao
OpenObserve, defina `OPENOBSERVE_URL` e `OPENOBSERVE_AUTH` (ou
`OPENOBSERVE_USER` e `OPENOBSERVE_PASSWORD`); `OPENOBSERVE_STREAM` é opcional e
usa `pomi-api-logs` por padrão. Sem `OPENOBSERVE_URL`, a aplicação não realiza
envio remoto.

### Acessando a Documentação

Após iniciar os servidores, acesse:

- **POMI Data:** http://localhost:3000/docs
- **POMI App:** http://localhost:3001/docs

Cada página exibe o documento OpenAPI completo da respectiva API; os arquivos
JSON também ficam disponíveis em `/openapi.json`.

## Estrutura do Projeto

```text
pomi-backend/
├── packages/
│   ├── db/          # Prisma, migrations e cliente compartilhado
│   ├── api-core/    # Infraestrutura HTTP comum
│   ├── data/        # API pública e administrativa de dados
│   ├── app/         # API autenticada de usuários e planejamentos
│   └── injection/   # Importadores e normalizadores
├── docker-compose.yaml
├── package.json
└── tsconfig.json
```

## Pendências de domínio

`StudyPeriod` registra atualmente apenas a data inicial do período acadêmico.
O modelo deverá passar a representar explicitamente as datas de início e fim
do semestre para que consumidores da API possam identificar o período vigente
sem heurísticas. Até essa evolução, o frontend considera janeiro a junho como
primeiro semestre e julho a dezembro como segundo semestre. Essa aproximação
representa a grade semanal prevista e não considera feriados, recessos,
cancelamentos ou outras exceções do calendário acadêmico.

## LICENÇA

O projeto está licenciado pelos termos da AGPL v3.0, para informações completas ver [licença](https://github.com/ominira-unicamp/pomi-backend/blob/main/LICENSE).

## Avatares de pessoas e grupos

A App API mantém somente avatares e as variantes `avatarSmall` e `avatarLarge`.
Uploads recebem corte central quadrado. Os grupos não possuem banner.

A migração `20261029173919_remove_group_banners` remove as colunas e o vínculo
antigos, preservando avatares e registros de mídia. Após o deploy, o job de
limpeza encaminha mídias ativas sem vínculo e com mais de 24 horas para
`PENDING_DELETE`, seguindo o fluxo existente de exclusão e retentativas no pict-rs.
Mídias vinculadas e uploads recentes são preservados.

O deploy deve aplicar a migração junto da versão correspondente da App API e
atualizar consumidores com o SDK regenerado. A migração foi gerada pelo Prisma
e validada somente em banco descartável; o banco da cloud não foi alterado.

### Integração transversal de imagens

A implementação de imagens fica em `packages/app/src/media`. Os módulos de
negócio usam `media/public.ts` para definir recursos com `defineImageResource`
e escolher `imageProfiles.avatar`. Os componentes HTTP reutilizáveis ficam em
`media/http.ts`; as declarações, os contratos e o registro dos endpoints de avatar ficam juntos
nos arquivos `.endpoints.ts` dos módulos de estudante e grupo. Em `media`, somente o endpoint comum de leitura é registrado.
Cada domínio declara seus endpoints de imagem em um objeto que referencia o recurso,
com caminho, schema dos parâmetros, mapeamento para o alvo, autorização e metadados
HTTP/SDK. Essa declaração não constrói componentes nem resolve dependências.
`createImageContracts` transforma a declaração em contratos;
`createImageActions` transforma a mesma declaração em actions, recebendo seletores
das operações e da identidade no contexto local. O controller mantém a resolução
das dependências e o registro das rotas. Novos recursos com uma imagem vinculada
podem reutilizar essa construção para substituição e remoção.

Cada definição fornece autorização, leitura do vínculo, substituição por
comparação de revisão, descoberta de referências e autorização de leitura.
Estudante e grupo mantêm seus vínculos `avatarMediaId` e `avatarRevision`.

A composição em `MediaResources.ts` registra as mesmas definições para a API e
o CLI de limpeza. A aplicação injeta operações vinculadas ao recurso,
`replace` e `remove`; os módulos não acessam pict-rs, aliases, processamento,
limites de upload ou estados de descarte. O perfil de avatar mantém o corte
quadrado e as variantes atuais. Os endpoints e o SDK permanecem compatíveis.

A substituição envia a imagem fora da transação e revalida acesso dentro dela,
usando o cliente transacional recebido pelo adaptador. O vínculo é alterado
somente se a imagem e a revisão ainda coincidirem; o descarte da imagem anterior
é agendado na mesma transação. Uploads cuja ativação falha são encaminhados para
limpeza, com reconciliação de órfãos como recuperação complementar.

Leitura e limpeza descobrem vínculos pelo registro de recursos. Referências
privadas e de grupos arquivados também impedem exclusão: autorização de leitura
não determina se uma imagem está vinculada. Falhas na descoberta interrompem o
descarte afetado. Novos recursos de imagem precisam ser registrados na composição
compartilhada antes de serem utilizados.

## Organização dos casos de uso da App API

Cada área em `packages/app/src/modules` possui um `index.ts` que declara sua
lista de controllers e endpoints. `createModule`, definido em `src/Module.ts`,
constrói router, registry OpenAPI e registro de autorização a partir dessa lista.
A composição global utiliza a mesma função; a agregação OpenAPI preserva as
definições também em composições aninhadas. A ordem declarada das rotas é mantida.
As funcionalidades internas são importadas diretamente, sem arquivos `index.ts`
que apenas reexportam controllers.

`student` reúne cadastro, seleção acadêmica, avatar e interesses de tags.
`identity` mantém conta, identidade autenticada e concessões de acesso.
`planning` reúne currículos, planos, tentativas, histórico e faltas.
`academic/evaluation` reúne avaliações de professores e seus sumários públicos.
`tagging` mantém o vocabulário de tags e suas associações com disciplinas.

`social` separa configuração do perfil público, diretório de pessoas e amizades
em contratos, controllers e serviços próprios. Os schemas, problemas e a
representação pública de pessoas são compartilhados dentro dessa área.
O contexto global continua disponível e fornece os três serviços sociais.

A aceitação de amizade é o primeiro piloto de separação por responsabilidades.
`AcceptFriendship.use-case.ts` coordena a operação, verifica as condições locais
e define seus tipos de rejeição esperada
sem informações HTTP. O serviço mantém sua interface de chamada e o controller
traduz essas falhas pelos mapeadores de `Social.problems.ts`. O relógio é uma
dependência de aplicação, registrada no container e substituível nos testes.
A seleção de amizade é compartilhada com listagem e criação por um arquivo de queries.

O piloto preserva a atualização condicionada e a leitura posterior da resposta,
sem adicionar transação ou repetição automática. A leitura pode não encontrar o
registro depois da escrita, mantendo a resposta de ausência já existente.
Os testes de persistência simulada verificam esse protocolo, sem demonstrar
concorrência real no banco. As demais operações sociais mantêm seu modelo atual.

Contratos e controllers extensos permanecem separados; integrações compactas,
como avatares, usam um arquivo `.endpoints.ts` junto da definição do recurso.
Arquivos de regras, consultas e apresentação são criados conforme a necessidade
da funcionalidade, sem exigir a mesma quantidade de arquivos em todas as pastas.
Esta organização preserva rotas, metadados do SDK e comportamento transacional.

O módulo de grupos separa vínculos, convites, roles e eventos em serviços e
controllers próprios. Cada controller recebe somente seu serviço por um contexto
local. Cadastro e arquivamento continuam em `GroupService`, e o avatar utiliza a
interface transversal de mídia. Autorização, governança e apresentação mantêm
componentes internos específicos do domínio.

Grupos, planejamento e avaliações isolam decisões determinísticas em arquivos `.rules.ts`.
Essas regras recebem fatos já consultados e instantes explícitos; não consultam
Prisma, contratos HTTP ou o relógio global. Os serviços carregam os dados,
traduzem issues para os problemas existentes e coordenam a persistência. As
fronteiras são verificadas por `npm run check:boundaries`.

No planejamento, as regras cobrem currículo, plano de período, tentativas,
importação de histórico e faltas. As regras de elegibilidade de avaliação ficam
em `academic/evaluation/professor`. Reordenações por posições
provisórias permanecem na persistência. A importação mantém seus estados aceitos
e sua política de warnings; elegibilidade de avaliação e aprovação para
pré-requisitos continuam sendo decisões distintas.

As alterações de role e de vínculo gerenciado delegam a casos de uso com falhas
locais, traduzidas nos controllers para os problemas públicos existentes. As
leituras de acesso, estado, referências e governança ocorrem na mesma transação
serializável das gravações. A resposta também é construída nessa transação.
A regra de governança avalia o estado final: remover uma atribuição afeta apenas
seu vínculo, remover a permissão de uma role afeta todas as suas atribuições, e
uma troca atômica de roles pode manter o único gestor ativo.

`application/transactions.ts` oferece `runAtomic`: um `err` no callback desfaz as
gravações, assim como uma exceção. O sinal de rollback é interno à invocação.
O mecanismo identifica conflitos do Prisma e do adaptador PostgreSQL; cada caso
de uso decide a tradução para sua falha local, sem repetição automática.

Em social, o presenter recebe uma decisão nomeada de divulgação, calculada por
uma função pura no mesmo arquivo. As condições atuais para perfil e disciplinas
continuam independentes, e os filtros de consulta permanecem nos serviços.

A importação de histórico delega a coordenação a um caso de uso e reutiliza seu
planejador puro. Seus fatos institucionais são carregados antes da transação,
conforme a hipótese existente de estabilidade durante a importação. A
reconciliação preserva warnings e resumo; repetir o documento com os mesmos
fatos atualiza as tentativas correspondentes, sem promessa de idempotência sob
concorrência. Ela usa a transação Prisma diretamente porque suas rejeições
esperadas ocorrem antes das gravações.

Os testes de integração de grupo e histórico usam exclusivamente
`POMI_APP_TEST_DATABASE_URL`, apontando para um banco descartável cujo nome termina
em `_test`. Não há fallback para `DATABASE_URL`. Prepare esse banco com as
migrations existentes e execute:

```bash
DATABASE_URL="$POMI_APP_TEST_DATABASE_URL" npm run prisma:deploy
POMI_APP_TEST_DATABASE_URL="$POMI_APP_TEST_DATABASE_URL" npm test --workspace @pomi/app
```

Sem essa variável, os testes de integração ficam explicitamente marcados como
ignorados. A suíte comum não comprova rollback e concorrência no PostgreSQL.

A adoção da proposta arquitetural também consolidou os metadados declarados de
comunidade em `Group.http.ts`, os tipos acadêmicos em `Academic.types.ts` e os
comandos migrados em schemas compartilhados com o transporte. Os presenters da
App API usam `.presenter.ts`; seleções reutilizadas ficam em `.queries.ts`. A
Data API mantém sua convenção de entidades. Recursos de avatar continuam nos
respectivos domínios, com `.resource.ts` e `.endpoints.ts` separados.

Os limites de feedback interpretam uma definição local e validada, mantendo uma
única instância por processo. A resposta de rejeição preserva o problema e envia
`Retry-After`. O relógio é injetável; presenters de convite recebem o instante
explicitamente. As transições de publicação e cancelamento de evento são
informações locais consumidas pelas regras e pela gravação.

Os resultados das operações migradas são registrados após sua conclusão, usando
o logger da requisição. Os eventos distinguem sucesso, rejeição e concorrência
sem registrar corpos ou documentos. Em mídia, registram ativação confirmada,
limpeza agendada ou recuperação pendente; não confundem agendamento com exclusão
física concluída. Falhas técnicas continuam no handler central. As fronteiras
verificam imports de tipo, estáticos e dinâmicos e possuem testes negativos em
`npm run test:boundaries`, também executados por `npm test`.

### Fundação de identidade

A introdução interna de `Principal`, `AuthIdentity`, `User` e `ServiceAccount`,
sem alteração dos contratos HTTP, está descrita em
[Fundação de identidade](docs/identity-foundation.md). O documento detalha a
compatibilidade com `AuthUser`, o backfill local e a ativação gradual. O rollout
de homologação de 02/11/2026 está registrado no próprio documento.
