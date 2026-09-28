import { cancelarEnvio, criarEnvio, definirUrgenciaEnvio, gerarPinNovo, lerPinEnvio, listarEnvios } from '@/api/entregas';
import { abrirBaseDados } from '@/database/client';
import { criarRepositorioEntregas } from '@/database/repositories/entregas';
import { acrescentarOperacao, obterRepositoriosSync } from '@/sync/fila';

import { criarServicoEnvios } from './envios';

const entregas = () => abrirBaseDados().then((db) => criarRepositorioEntregas(db));

/** Serviço do separador Enviar ligado à base de dados, à fila e ao Supabase. */
export const servicoEnvios = criarServicoEnvios({
  servidor: { criar: criarEnvio, listar: listarEnvios, lerPin: lerPinEnvio, gerarPin: gerarPinNovo, cancelar: cancelarEnvio, definirUrgencia: definirUrgenciaEnvio },
  entregas: {
    guardarVarias: async (e) => (await entregas()).guardarVarias(e),
    listar: async () => (await entregas()).listar(),
  },
  fila: {
    acrescentar: acrescentarOperacao,
    porEnviar: async (userId, tipo) => (await obterRepositoriosSync()).fila.listarPorEnviarDoTipo(userId, tipo),
  },
});
