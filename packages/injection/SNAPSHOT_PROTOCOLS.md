# Contratos públicos de snapshots

Os snapshots são a fronteira estável entre um producer (scraper) e a
injection. O producer grava um diretório imutável; o consumer lê somente o
`manifest.json` e os componentes declarados nele.

## Envelope comum

Todo snapshot contém:

- `manifest.json` (obrigatório), com `protocol`, `version`, `snapshotId`,
  `partition`, `status` e `components`;
- `issues.json` (obrigatório), com as issues encontradas durante a coleta;
- um arquivo por componente listado em `components`.

Cada componente contém `status`, `path`, `sha256`, `schemaVersion` e
`records`. Um componente `COMPLETE` precisa ter `path` e `sha256` válidos; um
componente `UNAVAILABLE` ou `FAILED` pode ter `path` nulo. O manifesto só pode
ser publicado com `status: "COMPLETE"`; snapshots parciais permanecem fora da
injeção.

Campos opcionais do manifesto são `profile`, `producer` e `issues`. O campo
`producer` pode registrar limites de amostra, versão do scraper e metadados de
origem sem ser interpretado pelo consumer.

## Protocolos e componentes

| Provider               | `protocol`                             | Partição                            | Componentes obrigatórios no perfil operacional                                      |
| ---------------------- | -------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| Calendar               | `pomi.calendar.snapshot`               | `year`                              | `events`                                                                            |
| Daily menus            | `pomi.daily-menus.snapshot`            | `firstDate`, `lastDate`             | `menus`                                                                             |
| Exchange notices       | `pomi.exchange-notices.snapshot`       | `collectionKey`                     | `notices`                                                                           |
| Catalog disciplines    | `pomi.catalog-disciplines.snapshot`    | `year`                              | `catalog` e `relationships`                                                         |
| Catalog programs       | `pomi.catalog-programs.snapshot`       | `year`                              | `programs`; no perfil `complete`, também `curricula`, `information` e `suggestions` |
| Professors data portal | `pomi.professors-data-portal.snapshot` | `collectionKey`                     | `profiles`                                                                          |
| Academic data          | `pomi.academic-data.snapshot`          | `year`, `semester`, `instituteCode` | componente acadêmico emitido pelo scraper                                           |

O workflow `catalog-programs` usa `catalog-programs-snapshot` como etapa; essa
entrada não possui schedule próprio para evitar duas fontes de execução.

## Versionamento e incompatibilidade

`version` identifica o contrato do manifesto. `schemaVersion` identifica o
schema de cada componente. Ambos começam em `1` e são inteiros monotônicos.

- Mudança aditiva compatível pode manter a versão e adicionar somente campos
  opcionais.
- Alteração de tipo, significado, caminho ou componente obrigatório exige
  incremento da versão correspondente.
- O consumer aceita somente o par de versões que conhece. Uma versão futura ou
  incompatível deve falhar antes da persistência e marcar a execução como
  `FAILED`; nunca deve tentar interpretar o JSON por aproximação.
- O producer deve atualizar testes, documentação e a versão no mesmo change
  que alterar o JSON. Alterar o payload sem alterar a versão é proibido.

## Testes producer/consumer

Cada protocolo deve manter fixtures de producer e testes do consumer para:

1. manifesto completo válido;
2. componente obrigatório ausente ou incompleto;
3. hash incorreto;
4. versão incompatível;
5. partição divergente;
6. execução repetida com o mesmo `snapshotId` sem duplicar componentes.

A validação ponta a ponta em homologação deve executar o producer real, validar
o manifesto, publicar o snapshot, executar a injection e consultar
`DataSnapshot` como `PUBLISHED`. Falhas de coleta devem gerar `FAILED` e o
retry deve reutilizar o mesmo contrato antes de uma nova publicação.

## Disciplinas de catálogo V2

O protocolo de disciplinas na versão 2 separa os componentes `catalog` e
`relationships`. O primeiro contém cursos planos, sem agrupamento pela página
de origem; o segundo contém exclusivamente os pré-requisitos. Os valores de
oferecimento são `ODD_PERIODS`, `EVEN_PERIODS`, `ALL_PERIODS` e
`UNIT_DISCRETION`, e os valores de avaliação são `GRADE_AND_ATTENDANCE`,
`ATTENDANCE` e `CONCEPT`.

A injection aceita a versão 1 durante a transição e normaliza seus valores
textuais antes da persistência. Producers devem emitir somente a versão 2.
