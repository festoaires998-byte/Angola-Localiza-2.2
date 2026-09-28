import type { PerfilLocal } from '@/database/repositories/perfilLocal';
import { decidirAcesso, type DecisaoAcesso } from '@/domain/organizacao/cargos';

import { criarLoja, type Loja } from './loja';

export interface UtilizadorSessao {
  id: string;
  email: string | null;
  /** Nome completo da conta (user_metadata.full_name); null se ainda não tem. */
  nome?: string | null;
  /** País escolhido no registo (user_metadata.country_code). */
  countryCode?: string | null;
}

export interface NivelSessao {
  atual: 'aal1' | 'aal2' | null;
  proximo: 'aal1' | 'aal2' | null;
}

export interface EstadoSessao {
  carregado: boolean;
  utilizador: UtilizadorSessao | null;
  perfil: PerfilLocal | null;
  perfilLido: boolean;
  perfilConfirmadoAgora: boolean;
  nivel: NivelSessao;
  acesso: DecisaoAcesso;
}

export interface DependenciasSessao {
  ouvirSessao(ouvinte: (utilizador: UtilizadorSessao | null) => void): () => void;
  nivelGarantia(): Promise<NivelSessao>;
  carregarPerfil(): Promise<{
    utilizador: UtilizadorSessao;
    perfil: PerfilLocal | null;
    confirmadoAgora: boolean;
  } | null>;
  perfilGuardado?(userId: string): Promise<PerfilLocal | null>;
  esperaPerfilMs?: number;
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
    perfilLido: false,
    perfilConfirmadoAgora: false,
    nivel: SEM_NIVEL,
    acesso: calcularAcesso(null, SEM_NIVEL),
  };
}

export interface ControloSessao {
  loja: Loja<EstadoSessao>;
  iniciar(): void;
  recarregar(): Promise<void>;
  parar(): void;
}

export function criarSessao(deps: DependenciasSessao): ControloSessao {
  const loja = criarLoja<EstadoSessao>(estadoInicial());
  let volta = 0;
  let pararDeOuvir: (() => void) | null = null;
  let espera: ReturnType<typeof setTimeout> | null = null;

  function pararEspera(): void {
    if (espera) clearTimeout(espera);
    espera = null;
  }

  async function atualizar(utilizador: UtilizadorSessao | null): Promise<void> {
    const minha = ++volta;
    pararEspera();

    if (!utilizador) {
      loja.definir({ ...estadoInicial(), carregado: true });
      return;
    }

    const mesmo = loja.obter().utilizador?.id === utilizador.id;
    const [nivel, guardado] = await Promise.all([
      deps.nivelGarantia().catch(() => SEM_NIVEL),
      mesmo || !deps.perfilGuardado
        ? Promise.resolve(null)
        : deps.perfilGuardado(utilizador.id).catch(() => null),
    ]);
    if (minha !== volta) return;

    loja.definir((a) => {
      const doMesmo = a.utilizador?.id === utilizador.id;
      const perfil = doMesmo ? a.perfil : guardado?.user_id === utilizador.id ? guardado : null;
      return {
        carregado: true,
        utilizador,
        perfil,
        perfilLido: (doMesmo && a.perfilLido) || perfil !== null,
        perfilConfirmadoAgora: doMesmo && a.perfilConfirmadoAgora,
        nivel,
        acesso: calcularAcesso(perfil, nivel),
      };
    });

    if (!loja.obter().perfilLido) {
      espera = setTimeout(() => {
        espera = null;
        if (minha === volta && !loja.obter().perfilLido) {
          loja.definir((a) => ({ ...a, perfilLido: true }));
        }
      }, deps.esperaPerfilMs ?? 5000);
    }

    const resultado = await deps.carregarPerfil().catch(() => null);
    if (minha !== volta) return;
    pararEspera();

    if (!resultado || resultado.utilizador.id !== utilizador.id) {
      loja.definir((a) => (a.perfilLido ? a : { ...a, perfilLido: true }));
      return;
    }

    loja.definir((a) => ({
      ...a,
      utilizador: { ...a.utilizador, countryCode: utilizador.countryCode ?? a.utilizador?.countryCode },
      perfil: resultado.perfil,
      perfilLido: true,
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
      pararEspera();
    },
  };
}
