# src/database

Base de dados local do telemóvel (SQLite, através do `expo-sqlite`).
É o que permite à app funcionar sem rede: tudo é gravado aqui primeiro
e enviado para o servidor quando houver ligação (o envio é feito noutro PR, em `src/sync`).

## Como usar

```ts
import { abrirBaseDados } from '@/database/client';
import { criarRepositorioFilaSaida } from '@/database/repositories';

const db = await abrirBaseDados();
const fila = criarRepositorioFilaSaida(db, { deviceId });
await fila.adicionar('create_address', payload);
```

`abrirBaseDados()` abre o ficheiro `angola_localiza.db` uma única vez,
liga o modo WAL (leituras e escritas não se bloqueiam) e as chaves
estrangeiras, e aplica as migrações que faltarem.

## Ficheiros

| Ficheiro | Para que serve |
| --- | --- |
| `tipos.ts` | A interface `BaseDados` (exec, run, getAll, getFirst, transacao). Os repositórios só usam esta interface. |
| `baseDados.ts` | Põe as chamadas numa fila (uma de cada vez) e trata das transações. |
| `client.ts` | Liga a interface ao `expo-sqlite` e abre a base de dados. |
| `migrations/` | Criação e alteração das tabelas. |
| `repositories/` | Funções para ler e gravar em cada tabela. |
| `geo.ts` | Distância entre dois pontos (haversine). |
| `ids.ts`, `util.ts` | Pequenas ajudas: UUID, datas, JSON. |
| `testes/baseDadosSqlJs.ts` | A mesma interface servida pelo `sql.js`, só para os testes. |

## Regras

- Datas em texto ISO UTC (`2026-09-23T10:15:00.000Z`).
- Sim/não guardado como `0`/`1`.
- JSON guardado em colunas de texto.
- Dentro de `db.transacao(async (tx) => ...)` use sempre o `tx`,
  nunca o `db` de fora (senão a app fica à espera para sempre).
- A chave **privada** do dispositivo **nunca** é gravada aqui: vai para o `expo-secure-store`.
- Fotos e assinaturas ficam em `FileSystem.documentDirectory` (não na cache,
  que o sistema pode apagar). A base de dados só guarda o registo.

## Testes

`npm test` corre os testes com o `sql.js` (SQLite em JavaScript), por isso
não é preciso telemóvel. Estão em `__tests__/database.test.ts`.
