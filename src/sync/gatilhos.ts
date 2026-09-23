import { AppState } from 'react-native';

import { supabase } from '@/api/supabase';
import { estaOnline, subscrever as subscreverRede } from '@/services/rede/conectividade';

import { eventosSync, type Emissor } from './eventos';
import { sincronizar } from './motorSync';

/** De onde vêm os avisos (trocável nos testes). */
export interface FontesGatilhos {
  sincronizar(): unknown;
  estaOnline(): Promise<boolean>;
  /** Chama `mudanca(online)` quando a rede muda. Devolve "deixar de ouvir". */
  ouvirRede(mudanca: (online: boolean) => void): () => void;
  /** Chama `ativa()` quando a app volta ao primeiro plano. */
  ouvirPrimeiroPlano(ativa: () => void): () => void;
  /** Chama `entrou()` quando o utilizador inicia sessão. */
  ouvirInicioSessao(entrou: () => void): () => void;
  eventos: Emissor;
}

/**
 * Liga os momentos em que vale a pena sincronizar:
 * - a rede voltou;
 * - a app voltou ao primeiro plano;
 * - o utilizador iniciou sessão;
 * - entrou uma operação nova na fila (só se houver rede).
 * Devolve a função que desliga tudo.
 */
export function ligarGatilhos(f: FontesGatilhos): () => void {
  const correr = () => {
    Promise.resolve(f.sincronizar()).catch(() => undefined);
  };
  const desligar = [
    f.ouvirRede((online) => {
      if (online) correr();
    }),
    f.ouvirPrimeiroPlano(correr),
    f.ouvirInicioSessao(correr),
    f.eventos.ouvir('operacaoAcrescentada', () => {
      f.estaOnline()
        .then((online) => {
          if (online) correr();
        })
        .catch(() => undefined);
    }),
  ];
  return () => desligar.forEach((d) => d());
}

const fontesDaApp: FontesGatilhos = {
  sincronizar: () => sincronizar(),
  estaOnline,
  ouvirRede: subscreverRede,
  ouvirPrimeiroPlano(ativa) {
    let anterior = AppState.currentState;
    const s = AppState.addEventListener('change', (novo) => {
      if (novo === 'active' && anterior !== 'active') ativa();
      anterior = novo;
    });
    return () => s.remove();
  },
  ouvirInicioSessao(entrou) {
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      // Não chamar o cliente dentro deste callback (pode bloquear): corre logo a seguir.
      if (evento === 'SIGNED_IN') setTimeout(entrou, 0);
    });
    return () => data.subscription.unsubscribe();
  },
  eventos: eventosSync,
};

let desligar: (() => void) | null = null;

/** Liga os gatilhos da app (só a primeira chamada conta). */
export function iniciarSync(): void {
  if (desligar) return;
  desligar = ligarGatilhos(fontesDaApp);
}

/** Desliga os gatilhos. */
export function pararSync(): void {
  desligar?.();
  desligar = null;
}
