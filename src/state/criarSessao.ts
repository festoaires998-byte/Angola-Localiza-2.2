import type { PerfilLocal } from '@/database/repositories/perfilLocal';
import { decidirAcesso, type DecisaoAcesso } from '@/domain/organizacao/cargos';

import { criarLoja, type Loja } from './loja';

export interface UtilizadorSessao {
  id: string;
  email: string | null;
  /** Nome completo da conta (user_metadata.full_name); null se ainda não tem. */
  nome?: string | null;
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
  /**
   * Já se sabe o perfil a usar (guardado neste telemóvel ou vindo do servidor),
   * ou já se esperou o suficiente por ele. Os ecrãs mostram "a carregar" até lá,
   * para não abrirem separadores e depois os fecharem.
   */
  perfilLido: boolean;
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
  /**
   * Último perfil guardado neste telemóvel (sem rede). Serve para a app abrir
   * logo com ele, sem esperar pelo servidor.
   */
  perfilGuardado?(userId: string): Promise<PerfilLocal | null>;
  /** Quanto tempo esperar pelo servidor quando não há perfil guardado (por omissão 5 s). */
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

    // 1) Já sem rede: mostra o que se sabe (perfil só se for do mesmo utilizador;
    //    senão, o último guardado neste telemóvel).
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
      // Sem perfil guardado: não fica à espera do servidor para sempre.
      espera = setTimeout(() => {
        espera = null;
        if (minha === volta && !loja.obter().perfilLido) {
          loja.definir((a) => ({ ...a, perfilLido: true }));
        }
      }, deps.esperaPerfilMs ?? 5000);
    }

    // 2) Pede ao servidor (ou lê o último guardado, se falhar).
    const resultado = await deps.carregarPerfil().catch(() => null);
    if (minha !== volta) return;
    pararEspera();
    if (!resultado || resultado.utilizador.id !== utilizador.id) {
      loja.definir((a) => (a.perfilLido ? a : { ...a, perfilLido: true }));
      return;
    }
    loja.definir((a) => ({
      ...a,
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
