import type { Migracao } from './tipos';

/**
 * Assinatura das provas de entrega:
 * - chaves_no_servidor: a chave pública que a app sabe estar registada no
 *   servidor para cada (utilizador, aparelho). O servidor guarda-a por
 *   utilizador + aparelho e substitui-a quando se regista outra. Serve para
 *   enviar primeiro as provas assinadas com a chave antiga antes de registar
 *   uma chave nova.
 * - provas_evidencia: cópia local das provas enviadas cuja assinatura não
 *   confere com a chave registada (o servidor marca-as "não verificadas").
 */
export const migracao003: Migracao = {
  versao: 3,
  nome: 'chaves_e_evidencias',
  async aplicar(tx) {
    await tx.exec(`
      CREATE TABLE chaves_no_servidor (
        user_id           TEXT NOT NULL,
        device_id         TEXT NOT NULL,
        chave_publica_jwk TEXT NOT NULL CHECK (json_valid(chave_publica_jwk)),
        registada_em      TEXT NOT NULL,
        PRIMARY KEY (user_id, device_id)
      );

      CREATE TABLE provas_evidencia (
        operation_id TEXT PRIMARY KEY NOT NULL,
        user_id      TEXT NOT NULL,
        device_id    TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        motivo       TEXT NOT NULL,
        criada_em    TEXT NOT NULL
      );
      CREATE INDEX idx_provas_evidencia_utilizador ON provas_evidencia (user_id, criada_em);
    `);
  },
};
