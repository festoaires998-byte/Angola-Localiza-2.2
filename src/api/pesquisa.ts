import { lerResultados, type ResultadoPesquisa } from '@/domain/enderecamento/pesquisa';

import { chamarFuncao } from './edge/chamarFuncao';

/**
 * Pesquisa no servidor (Edge Function "pesquisa"): código postal, Plus Code,
 * "Rua X, 12", ruas, bairros e referências. Só devolve moradas aprovadas
 * (as privadas só a quem as criou).
 */
export async function pesquisarNoServidor(query: string): Promise<ResultadoPesquisa[]> {
  const resposta = await chamarFuncao('pesquisa', 'pesquisar', { body: { query }, tempoMaximo: 15_000 });
  return lerResultados(resposta);
}
