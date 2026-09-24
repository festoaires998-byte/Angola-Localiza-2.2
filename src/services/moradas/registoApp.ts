import { lerVerificacaoCidadao, pedirRuasDaQuadra, procurarDuplicado } from '@/api/registo';
import { abrirBaseDados } from '@/database/client';
import { criarRepositorioPreferencias } from '@/database/repositories/preferencias';
import { criarRepositorioReferencias } from '@/database/repositories/referencias';
import { obterIdDispositivo } from '@/services/cofre/idDispositivo';
import { acrescentarOperacao, obterRepositoriosSync } from '@/sync/fila';

import { criarServicoRegisto } from './registo';

const referencias = () => abrirBaseDados().then((db) => criarRepositorioReferencias(db));
const preferencias = () => abrirBaseDados().then((db) => criarRepositorioPreferencias(db));

/** Serviço de registo de moradas ligado à base de dados, à fila e ao Supabase. */
export const servicoRegisto = criarServicoRegisto({
  ficheiros: {
    registar: async (novo) => (await obterRepositoriosSync()).ficheiros.registar(novo),
    associarOperacao: async (id, op) => (await obterRepositoriosSync()).ficheiros.associarOperacao(id, op),
  },
  acrescentarOperacao,
  idDispositivo: obterIdDispositivo,
  referencias: {
    guardarVarias: async (r) => (await referencias()).guardarVarias(r),
    listar: async (tipo, pai) => (await referencias()).listar(tipo, pai),
    obter: async (tipo, id) => (await referencias()).obter(tipo, id),
  },
  preferencias: {
    obter: async (c) => (await preferencias()).obter(c),
    guardar: async (c, v) => (await preferencias()).guardar(c, v),
  },
  servidor: { pedirRuasDaQuadra, procurarDuplicado, lerVerificacaoCidadao },
});
