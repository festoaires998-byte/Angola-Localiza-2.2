import { listarAtribuidas } from '@/api/entregas';
import { abrirBaseDados } from '@/database/client';
import { criarRepositorioEntregas } from '@/database/repositories/entregas';
import { assinarProva, paraCamposProva } from '@/services/crypto';
import { acrescentarOperacao, obterRepositoriosSync } from '@/sync/fila';

import { criarServicoEstafeta } from './estafeta';

const entregas = () => abrirBaseDados().then((db) => criarRepositorioEntregas(db));

/** Serviço do separador Entregas (estafeta) ligado à base de dados, à fila, à chave do aparelho e ao Supabase. */
export const servicoEstafeta = criarServicoEstafeta({
  servidor: { listarAtribuidas },
  entregas: {
    guardarVarias: async (e) => (await entregas()).guardarVarias(e),
    listar: async () => (await entregas()).listar(),
  },
  fila: {
    acrescentar: acrescentarOperacao,
    porEnviar: async (userId, tipo) => (await obterRepositoriosSync()).fila.listarPorEnviarDoTipo(userId, tipo),
    falhadas: async (userId) => (await obterRepositoriosSync()).fila.listarFalhadasDoUtilizador(userId),
  },
  ficheiros: {
    registar: async (novo) => (await obterRepositoriosSync()).ficheiros.registar(novo),
    associarOperacao: async (id, op) => (await obterRepositoriosSync()).ficheiros.associarOperacao(id, op),
  },
  assinarProva: async (dados) => paraCamposProva(await assinarProva(dados)),
});
