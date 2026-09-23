import { gerarUuid, type GeradorId } from '../ids';
import type { BaseDados } from '../tipos';
import { paraIso, relogioDoSistema, type Relogio } from '../util';

/**
 * Registo das fotos e assinaturas tiradas sem rede.
 *
 * O ficheiro em si é guardado em FileSystem.documentDirectory (NÃO na cache,
 * que o sistema pode apagar quando quiser). Esta tabela só guarda o registo:
 * onde está, para que bucket vai e, depois do upload, o URL real.
 *
 * No payload da operação, o ficheiro aparece como "offline:<id>" nos campos
 * photo_facade_url, photo_qr_url, proof.photo_url e proof.signature_url.
 * O marcador só é trocado pelo URL real no momento do envio.
 */

export const PREFIXO_OFFLINE = 'offline:';

/** Marcador a pôr no payload, ex.: "offline:3f2a...". */
export function marcadorOffline(id: string): string {
  return `${PREFIXO_OFFLINE}${id}`;
}

/** Se o valor for um marcador "offline:<id>", devolve o id; senão null. */
export function idDoMarcador(valor: unknown): string | null {
  return typeof valor === 'string' && valor.startsWith(PREFIXO_OFFLINE)
    ? valor.slice(PREFIXO_OFFLINE.length)
    : null;
}

export type EstadoFicheiro = 'pendente' | 'enviado';

export interface FicheiroPendente {
  id: string;
  caminho_local: string;
  bucket: string;
  content_type: string;
  sha256: string | null;
  tamanho_bytes: number | null;
  operation_id: string | null;
  url_remota: string | null;
  estado: EstadoFicheiro;
  criado_em: string;
}

export interface NovoFicheiro {
  /** Opcional: se não vier, é gerado um UUID. */
  id?: string;
  caminho_local: string;
  bucket: string;
  content_type: string;
  sha256?: string | null;
  tamanho_bytes?: number | null;
  operation_id?: string | null;
}

export interface OpcoesFicheirosPendentes {
  gerarId?: GeradorId;
  relogio?: Relogio;
}

export function criarRepositorioFicheirosPendentes(
  db: BaseDados,
  opcoes: OpcoesFicheirosPendentes = {},
) {
  const gerarId = opcoes.gerarId ?? gerarUuid;
  const agora = opcoes.relogio ?? relogioDoSistema;

  return {
    async registar(novo: NovoFicheiro): Promise<FicheiroPendente> {
      const ficheiro: FicheiroPendente = {
        id: novo.id ?? gerarId(),
        caminho_local: novo.caminho_local,
        bucket: novo.bucket,
        content_type: novo.content_type,
        sha256: novo.sha256 ?? null,
        tamanho_bytes: novo.tamanho_bytes ?? null,
        operation_id: novo.operation_id ?? null,
        url_remota: null,
        estado: 'pendente',
        criado_em: paraIso(agora()),
      };
      await db.run(
        `INSERT INTO ficheiros_pendentes (id, caminho_local, bucket, content_type, sha256,
           tamanho_bytes, operation_id, url_remota, estado, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'pendente', ?)`,
        [
          ficheiro.id,
          ficheiro.caminho_local,
          ficheiro.bucket,
          ficheiro.content_type,
          ficheiro.sha256,
          ficheiro.tamanho_bytes,
          ficheiro.operation_id,
          ficheiro.criado_em,
        ],
      );
      return ficheiro;
    },

    obter(id: string): Promise<FicheiroPendente | null> {
      return db.getFirst<FicheiroPendente>('SELECT * FROM ficheiros_pendentes WHERE id = ?', [id]);
    },

    /** Liga um ficheiro já registado a uma operação da fila. */
    async associarOperacao(id: string, operationId: string): Promise<void> {
      await db.run('UPDATE ficheiros_pendentes SET operation_id = ? WHERE id = ?', [
        operationId,
        id,
      ]);
    },

    listarPorOperacao(operationId: string): Promise<FicheiroPendente[]> {
      return db.getAll<FicheiroPendente>(
        'SELECT * FROM ficheiros_pendentes WHERE operation_id = ? ORDER BY criado_em, id',
        [operationId],
      );
    },

    /** Guarda o URL real depois do upload. */
    async marcarEnviado(id: string, url: string): Promise<void> {
      const r = await db.run(
        `UPDATE ficheiros_pendentes SET estado = 'enviado', url_remota = ? WHERE id = ?`,
        [url, id],
      );
      if (r.alteracoes === 0) throw new Error(`Ficheiro pendente não encontrado: ${id}`);
    },

    async contarPendentes(): Promise<number> {
      const linha = await db.getFirst<{ total: number }>(
        `SELECT COUNT(*) AS total FROM ficheiros_pendentes WHERE estado = 'pendente'`,
      );
      return linha?.total ?? 0;
    },

    /** Apaga só o registo (o ficheiro no disco tem de ser apagado à parte). */
    async apagar(id: string): Promise<void> {
      await db.run('DELETE FROM ficheiros_pendentes WHERE id = ?', [id]);
    },
  };
}

export type RepositorioFicheirosPendentes = ReturnType<typeof criarRepositorioFicheirosPendentes>;
