import { File } from 'expo-file-system';

import { supabase } from '@/api/supabase';
import { enviarFotoIdentidade, submeterVerificacao } from '@/api/verificacao';
import { abrirBaseDados } from '@/database/client';
import { criarRepositorioPreferencias } from '@/database/repositories/preferencias';

import { criarServicoVerificacao, type ResultadoEnvio } from './verificacao';

const preferencias = () => abrirBaseDados().then((db) => criarRepositorioPreferencias(db));

/** Verificação simples ligada à base de dados, aos ficheiros e ao Supabase (uma só para a app). */
export const servicoVerificacao = criarServicoVerificacao({
  preferencias: {
    obter: async (c) => (await preferencias()).obter(c),
    guardar: async (c, v) => (await preferencias()).guardar(c, v),
    apagar: async (c) => (await preferencias()).apagar(c),
  },
  lerBytes: async (uri) => {
    const f = new File(uri);
    if (!f.exists) throw new Error('Uma das fotos da verificação já não está no telemóvel. Tira as fotos de novo.');
    return f.bytes();
  },
  apagarFicheiro: async (uri) => {
    const f = new File(uri);
    if (f.exists) f.delete();
  },
  enviarFicheiro: enviarFotoIdentidade,
  submeter: submeterVerificacao,
});

/**
 * Envia a verificação pendente de quem tem sessão (chamado pelos gatilhos da
 * sincronização: rede de volta, app aberta, sessão iniciada). Nunca lança erros.
 */
export async function enviarVerificacaoDaSessao(): Promise<ResultadoEnvio | null> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return null;
  return servicoVerificacao.enviarPendente(userId);
}
