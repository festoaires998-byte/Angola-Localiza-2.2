import { abrirBaseDados } from '@/database/client';
import {
  criarRepositorioChavesDispositivo,
  type RepositorioChavesDispositivo,
} from '@/database/repositories/chavesDispositivo';
import {
  criarRepositorioFicheirosPendentes,
  type RepositorioFicheirosPendentes,
} from '@/database/repositories/ficheirosPendentes';
import {
  criarRepositorioFilaSaida,
  type OperacaoFila,
  type RepositorioFilaSaida,
  type TipoOperacao,
} from '@/database/repositories/filaSaida';
import {
  criarRepositorioProvasEvidencia,
  type RepositorioProvasEvidencia,
} from '@/database/repositories/provasEvidencia';
import { obterIdDispositivo } from '@/services/cofre/idDispositivo';

import { eventosSync } from './eventos';

export interface RepositoriosSync {
  fila: RepositorioFilaSaida;
  ficheiros: RepositorioFicheirosPendentes;
  chaves: RepositorioChavesDispositivo;
  /** Cópias locais das provas cuja assinatura não confere com a chave registada. */
  evidencias: RepositorioProvasEvidencia;
}

let repositorios: Promise<RepositoriosSync> | null = null;

/** Fila de saída e ficheiros pendentes da app (abertos uma só vez). */
export function obterRepositoriosSync(): Promise<RepositoriosSync> {
  if (!repositorios) {
    repositorios = (async () => {
      const [db, deviceId] = await Promise.all([abrirBaseDados(), obterIdDispositivo()]);
      return {
        fila: criarRepositorioFilaSaida(db, { deviceId }),
        ficheiros: criarRepositorioFicheirosPendentes(db),
        chaves: criarRepositorioChavesDispositivo(db),
        evidencias: criarRepositorioProvasEvidencia(db),
      };
    })().catch((erro) => {
      repositorios = null;
      throw erro;
    });
  }
  return repositorios;
}

/**
 * Põe uma operação na fila e avisa o motor (que envia logo, se houver rede).
 * Os ecrãs devem usar esta função em vez de chamar o repositório diretamente.
 */
export async function acrescentarOperacao(
  userId: string,
  tipo: TipoOperacao,
  payload: unknown,
  operationId?: string,
): Promise<OperacaoFila> {
  const { fila } = await obterRepositoriosSync();
  const op = await fila.adicionar(userId, tipo, payload, operationId);
  eventosSync.emitir('operacaoAcrescentada');
  return op;
}
