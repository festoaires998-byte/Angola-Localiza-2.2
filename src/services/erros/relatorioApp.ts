import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/api/supabase';
import { abrirBaseDados } from '@/database/client';
import { gerarUuid } from '@/database/ids';
import { criarRepositorioErrosPendentes } from '@/database/repositories/errosPendentes';
import { obterIdDispositivo } from '@/services/cofre/idDispositivo';
import { eventosSync } from '@/sync/eventos';

import { criarRelatorioErros, type LinhaErroServidor } from './relatorio';

const erros = () => abrirBaseDados().then((db) => criarRepositorioErrosPendentes(db));

/** Relatório de erros ligado à base de dados do telemóvel e ao Supabase (tabela app_errors). */
export const relatorioErros = criarRelatorioErros({
  erros: {
    guardar: async (e) => (await erros()).guardar(e),
    listar: async (n) => (await erros()).listar(n),
    apagar: async (ids) => (await erros()).apagar(ids),
    limitar: async (n) => (await erros()).limitar(n),
  },
  async enviar(linhas: LinhaErroServidor[]) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error('Sem sessão iniciada.');
    const { error } = await supabase.from('app_errors').insert(linhas);
    if (error) throw new Error(error.message);
  },
  gerarId: gerarUuid,
  async info() {
    return {
      versao: Constants.expoConfig?.version ?? null,
      plataforma: Platform.OS,
      deviceId: await obterIdDispositivo().catch(() => null),
    };
  },
});

let instalado = false;

/**
 * Guarda os erros que ninguém apanhou (e os fatais) e envia os guardados
 * ao arrancar e depois de cada sincronização (quando há rede).
 */
export function instalarRelatorioErros(): void {
  if (instalado) return;
  instalado = true;
  const utils = (globalThis as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void } }).ErrorUtils;
  if (utils) {
    const anterior = utils.getGlobalHandler();
    utils.setGlobalHandler((erro, fatal) => {
      void relatorioErros.registar(erro, { fatal: fatal === true });
      anterior(erro, fatal);
    });
  }
  eventosSync.ouvir('sincronizado', () => void relatorioErros.enviarPendentes());
  void relatorioErros.enviarPendentes();
}
