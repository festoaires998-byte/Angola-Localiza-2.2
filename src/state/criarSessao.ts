import type { PerfilLocal } from '@/database/repositories/perfilLocal';
import { decidirAcesso, type DecisaoAcesso } from '@/domain/organizacao/cargos';

import { criarLoja, type Loja } from './loja';

export interface UtilizadorSessao {
  id: string;
  email: string | null;
}

export interface NivelSessao {
  atual: 'aal1' | 'aal2' | null;
  proximo: 'aal1' | 'aal2' | null;
}

export interface EstadoSessao {
  /** false até se ler a sessão guardada no arranque. */
  carregado: boolean;
  utilizador: UtilizadorSessao | null;
  /** Último perfil confirmado (cargos + KYC) do utilizador atual. */
  perfil: PerfilLocal | null;
  /** O perfil foi confirmado pelo servidor nesta abertura da app? */
  perfilConfirmadoAgora: boolean;
  nivel: NivelSessao;
  /** Separadores permitidos, se falta MFA e porquê. */
  acesso: DecisaoAcesso;
}

export interface DependenciasSessao {
  /** Chama o ouvinte com o utilizador atual sempre que a sessão muda. Devolve "parar de ouvir". */
  ouvirSessao(ouvinte: (utilizador: UtilizadorSessao | null) => void): () => void;
  nivelGarantia(): Promise<NivelSessao>;
  carregarPerfil(): Promise<{
    utilizador: UtilizadorSessao;
    perfil: PerfilLocal | null;
    confirmadoAgora: boolean;
  } | null>;
}

const SEM_NIVEL: NivelSessao = { atual: null, proximo: null };

function calcularAcesso(perfil: PerfilLocal | null, nivel: NivelSessao): DecisaoAcesso {
  return decidirAcesso({
    perfil: perfil ? { cargos: perfil.cargos, estadoKyc: perfil.estado_kyc } : null,
    nivel: nivel.atual,
    temFatorMfa: nivel.proximo === null ? null : nivel.proximo === 'aal2',
  });
}

export function estadoInicial(): EstadoSessao {
  return {
    carregado: false,
    utilizador: null,
    perfil: null,
    perfilConfirmadoAgora: false,
    nivel: SEM_NIVEL,
    acesso: calcularAcesso(null, SEM_NIVEL),
  };
}

export interface ControloSessao {
  loja: Loja<EstadoSessao>;
  /** Começa a ouvir a sessão (só a primeira chamada conta). */
  iniciar(): void;
  /** Volta a pedir cargos/KYC e o nível da sessão (ex.: depois de verificar o MFA). */
  recarregar(): Promise<void>;
  parar(): void;
}

/**
 * Liga a sessão do Supabase ao estado da app.
 * Cada mudança de sessão começa uma "volta" nova; resultados de voltas antigas
 * (ex.: um pedido lento de antes de sair) são ignorados.
 */
export function criarSessao(deps: DependenciasSessao): ControloSessao {
  const loja = criarLoja<EstadoSessao>(estadoInicial());
  let volta = 0;
  let pararDeOuvir: (() => void) | null = null;

  async function atualizar(utilizador: UtilizadorSessao | null): Promise<void> {
    const minha = ++volta;
    if (!utilizador) {
      loja.definir({ ...estadoInicial(), carregado: true });
      return;
    }

    // 1) Já sem rede: mostra o que se sabe (perfil só se for do mesmo utilizador).
    const nivel = await deps.nivelGarantia().catch(() => SEM_NIVEL);
    if (minha !== volta) return;
    loja.definir((a) => {
      const perfil = a.utilizador?.id === utilizador.id ? a.perfil : null;
      return {
        carregado: true,
        utilizador,
        perfil,
        perfilConfirmadoAgora: a.utilizador?.id === utilizador.id && a.perfilConfirmadoAgora,
        nivel,
        acesso: calcularAcesso(perfil, nivel),
      };
    });

    // 2) Pede ao servidor (ou lê o último guardado, se falhar).
    const resultado = await deps.carregarPerfil().catch(() => null);
    if (minha !== volta) return;
    if (!resultado || resultado.utilizador.id !== utilizador.id) return;
    loja.definir((a) => ({
      ...a,
      perfil: resultado.perfil,
      perfilConfirmadoAgora: resultado.confirmadoAgora,
      acesso: calcularAcesso(resultado.perfil, a.nivel),
    }));
  }

  return {
    loja,
    iniciar() {
      if (pararDeOuvir) return;
      pararDeOuvir = deps.ouvirSessao((utilizador) => {
        void atualizar(utilizador);
      });
    },
    recarregar() {
      return atualizar(loja.obter().utilizador);
    },
    parar() {
      pararDeOuvir?.();
      pararDeOuvir = null;
      volta++;
    },
  };
}
