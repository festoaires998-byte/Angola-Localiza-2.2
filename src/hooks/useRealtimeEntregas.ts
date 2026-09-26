import { useEffect } from 'react';

import { supabase } from '@/api/supabase';

type PapelEntrega = 'criador' | 'estafeta' | 'organizacao';

const COLUNA: Record<PapelEntrega, 'created_by' | 'assigned_driver'> = {
  criador: 'created_by',
  estafeta: 'assigned_driver',
  organizacao: 'created_by',
};

/**
 * Mantém as listas de entregas atualizadas quando o servidor muda.
 * O evento Realtime é apenas um sinal: o estado oficial continua a ser lido
 * pela consulta normal, evitando depender de um único evento entregue.
 */
export function useRealtimeEntregas(
  userId: string | null,
  papel: PapelEntrega,
  online: boolean,
  aoMudar: () => void | Promise<void>,
): void {
  useEffect(() => {
    if (!userId || !online) return;

    let ativo = true;
    const coluna = COLUNA[papel];
    const canal = supabase
      .channel(`entregas:${papel}:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deliveries',
          ...(papel === 'organizacao' ? {} : { filter: `${coluna}=eq.${userId}` }),
        },
        () => {
          if (ativo) void aoMudar();
        },
      )
      .subscribe((status) => {
        // Ao reconectar, relê o estado completo para recuperar eventos perdidos.
        if (status === 'SUBSCRIBED' && ativo) void aoMudar();
      });

    return () => {
      ativo = false;
      void supabase.removeChannel(canal);
    };
  }, [aoMudar, online, papel, userId]);
}
