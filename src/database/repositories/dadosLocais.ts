import type { BaseDados } from '../tipos';

/**
 * Apaga do telemóvel os dados de um utilizador (depois de apagar a conta):
 * operações por enviar, favoritos, perfil, chaves conhecidas e evidências.
 * Os dados de outras pessoas que usam o mesmo telemóvel ficam.
 */
export async function apagarDadosLocaisDoUtilizador(db: BaseDados, userId: string): Promise<void> {
  await db.transacao(async (tx) => {
    for (const tabela of ['fila_saida', 'favoritos', 'perfil_local', 'chaves_no_servidor', 'provas_evidencia']) {
      await tx.run(`DELETE FROM ${tabela} WHERE user_id = ?`, [userId]);
    }
    await tx.run(`DELETE FROM preferencias WHERE chave LIKE ?`, [`%:${userId}`]);
  });
}
