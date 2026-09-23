# src/database/migrations

Criação e alteração das tabelas da base de dados local.

## Como funciona

- O SQLite guarda um número de versão (`PRAGMA user_version`). Uma base nova começa em 0.
- Cada migração tem um número (1, 2, 3, ...) e só corre se a base estiver numa versão mais baixa.
- Cada migração corre dentro de uma transação, junto com a mudança do número de versão.
  Se alguma coisa falhar, essa migração é desfeita por inteiro e a base fica como estava.
- Correr as migrações outra vez não faz nada.

## Migrações

| Versão | Ficheiro | O que faz |
| --- | --- | --- |
| 1 | `001_inicial.ts` | Cria as 9 tabelas: `fila_saida`, `ficheiros_pendentes`, `moradas`, `zona_offline`, `favoritos`, `levantamentos`, `entregas`, `referencias`, `chaves_dispositivo`. |
| 2 | `002_perfil_e_utilizador.ts` | Cria `perfil_local` (último perfil confirmado por utilizador: `user_id`, `email`, `cargos_json`, `estado_kyc`, `confirmado_em`) e junta a coluna `user_id` à `fila_saida`. As operações que já existiam ficam com `user_id` nulo e **não** são enviadas automaticamente. |
| 3 | `003_chave_registada_utilizador.ts` | Junta `registada_user_id` à `chaves_dispositivo`: para que utilizador a chave pública foi registada no servidor (o servidor guarda-a por utilizador + aparelho). |

## Como juntar uma migração nova

1. Criar `002_nome_curto.ts` com `versao: 2`.
2. Acrescentá-la no fim da lista `MIGRACOES` em `index.ts`.
3. **Nunca** alterar uma migração que já foi publicada: os telemóveis que já a
   correram não a voltam a correr. Qualquer mudança vai numa migração nova.
