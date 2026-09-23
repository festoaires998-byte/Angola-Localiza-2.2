import { useMemo } from 'react';

import { normalizarCargos, type Cargo, type Separador } from '@/domain/organizacao/cargos';

import { useSessao } from './useSessao';

export interface EstadoCargos {
  cargos: Cargo[];
  estadoKyc: string | null;
  separadores: Separador[];
  /** Tem cargos mas a sessão ainda não está em AAL2. */
  faltaMfa: boolean;
  /** 'verificar' (já tem fator) ou 'inscrever' (ainda não tem). */
  passoMfa: 'verificar' | 'inscrever' | null;
  /** false quando se está a usar o último perfil guardado (sem rede ou erro). */
  confirmadoAgora: boolean;
}

/** Cargos e separadores permitidos do utilizador atual. */
export function useCargos(): EstadoCargos {
  const { perfil, acesso, perfilConfirmadoAgora } = useSessao();
  return useMemo(
    () => ({
      cargos: normalizarCargos(perfil?.cargos ?? []),
      estadoKyc: perfil?.estado_kyc ?? null,
      separadores: acesso.separadores,
      faltaMfa: acesso.faltaMfa,
      passoMfa: acesso.passoMfa,
      confirmadoAgora: perfilConfirmadoAgora,
    }),
    [perfil, acesso, perfilConfirmadoAgora],
  );
}
