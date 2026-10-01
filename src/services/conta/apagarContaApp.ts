import { sair } from '@/api/auth';
import { chamarFuncao } from '@/api/edge/chamarFuncao';
import { abrirBaseDados } from '@/database/client';
import { apagarDadosLocaisDoUtilizador } from '@/database/repositories/dadosLocais';

import { criarApagarConta } from './apagarConta';

/** Apagar a conta, ligado ao Supabase e à base de dados do telemóvel. */
export const apagarConta = criarApagarConta({
  async pedirAoServidor(confirmacao) {
    await chamarFuncao('apagar-conta', 'apagar', { body: { confirmacao }, tempoMaximo: 60_000 });
  },
  apagarDadosLocais: async (userId) => apagarDadosLocaisDoUtilizador(await abrirBaseDados(), userId),
  sair,
});
