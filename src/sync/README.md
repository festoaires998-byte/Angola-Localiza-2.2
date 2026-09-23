# src/sync

Motor de sincronização: fila de saída (SQLite) → Edge Function `sync`.
Não tem ecrãs; os ecrãs usam `useFilaSync()` (`src/hooks`).

| Ficheiro | Para que serve |
| --- | --- |
| `motorSync.ts` | `sincronizar({ forcar })` e `estadoSync` (ligados ao Supabase, ao disco e à rede). |
| `nucleoMotor.ts` | A lógica do motor, com as dependências recebidas por parâmetro (é o que os testes usam). |
| `marcadores.ts` | Encontrar e trocar os marcadores `offline:<id>` do payload. |
| `fila.ts` | Repositórios da app e `acrescentarOperacao()` (põe na fila e avisa o motor). |
| `gatilhos.ts` | `iniciarSync()` / `pararSync()`: quando sincronizar sozinho. |
| `tarefaSegundoPlano.ts` | Tarefa do sistema (`expo-background-task`) que chama `sincronizar()`. |
| `eventos.ts` | Avisos `sincronizado` e `operacaoAcrescentada`. |

## Contrato (igual ao site)

`POST /functions/v1/sync` com `{ operations: [{ operation_id, device_id, operation_type, payload }] }`,
resposta `{ results: [{ operation_id, status, error? }] }`.

A função `sync` em produção (versão 6) devolve em `status`:

| status | Quando | O que a app faz |
| --- | --- | --- |
| `SYNCED` | Gravada (ou já tinha sido antes, mesmo `operation_id`). | `concluida` |
| `CONFLICT` | `update_address` de uma morada já validada que mudou entretanto. | `concluida` (a regra do site: tudo o que não é `FAILED`) |
| `FAILED` | Erro ao gravar ou `operation_type` desconhecido (vem com `error`). | volta a `pendente`, +1 tentativa |
| (não veio) | — | volta a `pendente`, +1 tentativa |

Fora de `results`: **401** (sessão inválida), 400 (`operations` vazio) e 500.

## Uma volta de `sincronizar()`

1. Na primeira vez desde que a app abriu: `libertarPresasAEnviar()`.
2. Só continua com sessão iniciada e rede. Se o token expira nos próximos 2 minutos, renova-o.
3. `listarProntas(userId)` em lotes de 20. Com `forcar: true` ignora a espera entre tentativas
   (é o botão "Sincronizar agora").
4. Fotos de cada operação (`photo_facade_url`, `photo_qr_url`, `proof.photo_url`, `proof.signature_url`):
   - lê o ficheiro (`caminho_local`: nome relativo a `documentDirectory`, caminho absoluto ou `file://`);
   - se o registo tem `sha256` e o ficheiro mudou, **não envia** e regista o erro;
   - envia para o Storage (`<bucket do registo>/offline-<id>.jpg`, ou `.png` se for `image/png`);
     a resposta **409** (já existe: a app fechou a meio de um envio anterior) conta como sucesso;
   - marca o ficheiro como enviado e **grava logo o payload com o URL real** na fila, antes do POST;
   - o URL fica `SUPABASE_URL/storage/v1/object/public/<bucket>/<nome>`.
   Se uma foto falhar, só essa operação espera (`registarFalhaOperacao`); as outras seguem.
5. `marcarAEnviar` → POST → `aplicarResultadosSync(results)`.
   - sem rede / erro 5xx: `registarFalhaEnvio` (nada se perde, conta como tentativa);
   - **401**: pára, as operações voltam a `pendente` **sem** somar tentativas e
     `precisaEntrarDeNovo` fica `true`. Não se volta a tentar com o mesmo token;
     com um token novo (entrou de novo) tenta outra vez.
6. Apaga os ficheiros locais **só** das operações que ficaram `concluida` (até lá são a prova).
7. `limparConcluidasAntigas()` e o evento `sincronizado`.

### Uma volta de cada vez

Se `sincronizar()` for chamado durante um envio, não corre em paralelo: devolve a
mesma promessa e faz **mais uma volta** no fim (várias chamadas juntam-se numa só volta extra).

### Utilizadores

Só se enviam as operações do utilizador da sessão atual, com o token dele. Antes de
cada lote confirma que a sessão ainda é do mesmo utilizador; se mudou, pára.

## Gatilhos (`iniciarSync()`)

Sincroniza quando: a rede volta, a app volta ao primeiro plano, o utilizador inicia
sessão e logo depois de `acrescentarOperacao()` (se houver rede).
Nada disto é ligado sozinho: `iniciarSync()` será chamado no PR dos ecrãs (no `_layout`).

## Segundo plano (`tarefaSegundoPlano.ts`)

A tarefa é definida quando o ficheiro é importado (tem de ser importado no arranque
da app, fora de componentes, no PR dos ecrãs) e registada com `registarTarefaSync()`.

**Quem decide quando a tarefa corre é o sistema, não a app.** Pedimos um intervalo
mínimo de 15 minutos (o mínimo permitido). O Android costuma respeitar mais ou menos
esse intervalo quando há bateria e rede; o iOS corre-a quando quiser — às vezes
horas depois, muitas vezes à noite com o telemóvel a carregar — e deixa de a correr
se o utilizador fechar a app à força. Por isso a tarefa é só uma ajuda: os
gatilhos acima continuam a ser a forma principal de sincronizar.

Com o iPhone bloqueado, a tarefa só consegue ler a sessão porque o cofre usa
`AFTER_FIRST_UNLOCK` (ver `src/services/cofre/README.md`). Antes do primeiro
desbloqueio depois de ligar o telemóvel, não sincroniza (e não apaga a sessão).

## Testes

`__tests__/motorSync.test.ts` usa sql.js e um `fetch` falso (Storage e sync simulados).
