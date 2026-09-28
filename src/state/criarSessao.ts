import type { PerfilLocal } from '@/database/repositories/perfilLocal';
import { decidirAcesso, type DecisaoAcesso } from '@/domain/organizacao/cargos';

import { criarLoja, type Loja } from './loja';

export interface UtilizadorSessao {
  id: string;
  email: string | null;
  /** Nome completo da conta (user_metadata.full_name); null se ainda não tem. */
  nome?: string | null;
  countryCode?: string | null;
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