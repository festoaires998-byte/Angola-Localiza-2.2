import type { CategoriaFavorito } from '@/database/repositories/favoritos';
import type { OperacaoFila } from '@/database/repositories/filaSaida';
import {
  aprovadosPorJuntar,
  categoriaDoTipo,
  registoDaFila,
  type Registo,
} from '@/domain/enderecamento/meusRegistos';

/**
 * "Os meus registos" no separador Moradas.
 * - Com rede: lê os registos do servidor e guarda-os no telemóvel (abre sem rede).
 * - Um registo aprovado entra nos favoritos (Moradas) **uma só vez**: se a pessoa
 *   depois o tirar, a app não o volta a pôr.
 * - Os registos feitos sem rede, ainda na fila, aparecem "à espera de rede".
 */
export interface DependenciasRegistos {
  servidor: {
    lerMeusRegistos(userId: string): Promise<Registo[]>;
    juntarAosFavoritos(userId: string, moradaId: string, categoria: CategoriaFavorito, nome: string | null): Promise<void>;
  };
  preferencias: { obter(chave: string): Promise<string | null>; guardar(chave: string, valor: string): Promise<void> };
  fila: { porEnviar(userId: string): Promise<OperacaoFila[]> };
}

const chaveLista = (userId: string) => `meus_registos:${userId}`;
const chaveJuntados = (userId: string) => `registos_nos_favoritos:${userId}`;

function lerJson<T>(texto: string | null, omissao: T): T {
  if (!texto) return omissao;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return omissao;
  }
}

export function criarServicoRegistos(deps: DependenciasRegistos) {
  async function naFila(userId: string): Promise<Registo[]> {
    const ops = await deps.fila.porEnviar(userId).catch(() => []);
    return ops.map((op) => registoDaFila(op.operation_id, op.payload, op.criado_em)).reverse();
  }

  return {
    /** Só o telemóvel: os da fila primeiro, depois os últimos vindos do servidor. */
    async listar(userId: string): Promise<Registo[]> {
      const guardados = lerJson<Registo[]>(await deps.preferencias.obter(chaveLista(userId)).catch(() => null), []);
      return [...(await naFila(userId)), ...guardados];
    },

    /**
     * Com rede: traz os registos do servidor e junta aos favoritos os aprovados
     * que ainda não foram juntados. Devolve quantos juntou.
     */
    async atualizar(userId: string): Promise<{ juntados: number }> {
      const registos = await deps.servidor.lerMeusRegistos(userId);
      await deps.preferencias.guardar(chaveLista(userId), JSON.stringify(registos));

      const juntados = new Set(lerJson<string[]>(await deps.preferencias.obter(chaveJuntados(userId)), []));
      let novos = 0;
      for (const r of aprovadosPorJuntar(registos, juntados)) {
        try {
          await deps.servidor.juntarAosFavoritos(userId, r.moradaId!, categoriaDoTipo(r.tipo), r.tipo);
          juntados.add(r.moradaId!);
          novos++;
        } catch {
          // Fica para a próxima vez que houver rede.
        }
      }
      if (novos > 0) await deps.preferencias.guardar(chaveJuntados(userId), JSON.stringify([...juntados]));
      return { juntados: novos };
    },
  };
}

export type ServicoRegistos = ReturnType<typeof criarServicoRegistos>;
