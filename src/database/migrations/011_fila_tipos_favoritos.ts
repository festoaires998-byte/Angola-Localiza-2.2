import { TIPOS_OPERACAO } from '../repositories/filaSaida';
import type { Migracao } from './tipos';

const tipos = TIPOS_OPERACAO.map((t) => `'${t}'`).join(', ');

/**
 * A fila passa a aceitar todos os tipos que a app envia (TIPOS_OPERACAO).
 *
 * A migração 001 só deixava 4 tipos ('create_address', 'create_delivery',
 * 'field_submit', 'delivery_proof'). As operações dos favoritos
 * ('create_favorite', 'update_favorite', 'remove_favorite') falhavam no CHECK:
 * "Guardar como favorito" no Mapa gravava a morada no telemóvel mas nunca a
 * mandava ao servidor.
 *
 * O SQLite não muda um CHECK: a tabela é refeita (mesmas colunas e índices).
 * O DROP TABLE apagaria as ligações das fotos e dos levantamentos à operação
 * (ON DELETE SET NULL); por isso guardam-se antes e repõem-se depois.
 */
export const migracao011: Migracao = {
  versao: 11,
  nome: 'fila_tipos_favoritos',
  async aplicar(tx) {
    await tx.exec(`
      CREATE TEMP TABLE _ligacoes_fila AS
        SELECT 'ficheiros_pendentes' AS tabela, id, operation_id FROM ficheiros_pendentes WHERE operation_id IS NOT NULL
        UNION ALL
        SELECT 'levantamentos' AS tabela, id, operation_id FROM levantamentos WHERE operation_id IS NOT NULL;

      CREATE TABLE fila_saida_nova (
        operation_id         TEXT PRIMARY KEY NOT NULL,
        device_id            TEXT NOT NULL,
        operation_type       TEXT NOT NULL CHECK (operation_type IN (${tipos})),
        payload_json         TEXT NOT NULL CHECK (json_valid(payload_json)),
        estado               TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN
                               ('pendente', 'a_enviar', 'concluida', 'falhou_definitivo')),
        tentativas           INTEGER NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
        ultimo_erro          TEXT,
        proxima_tentativa_em TEXT,
        criado_em            TEXT NOT NULL,
        atualizado_em        TEXT NOT NULL,
        user_id              TEXT
      );
      INSERT INTO fila_saida_nova
        (operation_id, device_id, operation_type, payload_json, estado, tentativas,
         ultimo_erro, proxima_tentativa_em, criado_em, atualizado_em, user_id)
        SELECT operation_id, device_id, operation_type, payload_json, estado, tentativas,
               ultimo_erro, proxima_tentativa_em, criado_em, atualizado_em, user_id
          FROM fila_saida;

      DROP TABLE fila_saida;
      ALTER TABLE fila_saida_nova RENAME TO fila_saida;
      CREATE INDEX idx_fila_saida_prontas ON fila_saida (estado, proxima_tentativa_em, criado_em);
      CREATE INDEX idx_fila_saida_utilizador ON fila_saida (user_id, estado, proxima_tentativa_em, criado_em);

      UPDATE ficheiros_pendentes
         SET operation_id = (SELECT l.operation_id FROM _ligacoes_fila l
                              WHERE l.tabela = 'ficheiros_pendentes' AND l.id = ficheiros_pendentes.id)
       WHERE id IN (SELECT id FROM _ligacoes_fila WHERE tabela = 'ficheiros_pendentes');
      UPDATE levantamentos
         SET operation_id = (SELECT l.operation_id FROM _ligacoes_fila l
                              WHERE l.tabela = 'levantamentos' AND l.id = levantamentos.id)
       WHERE id IN (SELECT id FROM _ligacoes_fila WHERE tabela = 'levantamentos');

      DROP TABLE _ligacoes_fila;
    `);
  },
};
