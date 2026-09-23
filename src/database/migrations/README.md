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
| 3 | `003_chaves_e_evidencias.ts` | Cria `chaves_no_servidor` (chave pública que a app sabe estar registada no servidor, por `user_id` + `device_id`) e `provas_evidencia` (cópia local das provas enviadas cuja assinatura não confere com a chave registada). |
| 4 | `004_avisos_vistos.ts` | Junta `visto_em` à `provas_evidencia`: data em que o utilizador carregou em "Já vi" no aviso. A prova **nunca** é apagada; só deixa de aparecer na lista das Definições. |
| 5 | `005_zonas_geocodificadas.ts` | Cria `zonas_geocodificadas`: a última província e município que o servidor devolveu para cada zona (Plus Code de 8 dígitos, ~275 m), para os mostrar sem rede. |
| 6 | `006_codigos_confirmados.ts` | Cria `codigos_confirmados`: o último Código Postal Digital confirmado pelo servidor para cada célula (sigla + grelha), para o mostrar sem rede em vez do provisório. |
| 7 | `007_favoritos_do_utilizador.ts` | Junta à `favoritos` as colunas `user_id` (de quem é), `pendente` (`atualizar`/`remover` feito sem rede, à espera de ir para o servidor) e `criado_em`. Os favoritos antigos ficam com `user_id` nulo e não aparecem a ninguém. |

## Como juntar uma migração nova

1. Criar `002_nome_curto.ts` com `versao: 2`.
2. Acrescentá-la no fim da lista `MIGRACOES` em `index.ts`.
3. **Nunca** alterar uma migração que já foi publicada: os telemóveis que já a
   correram não a voltam a correr. Qualquer mudança vai numa migração nova.
