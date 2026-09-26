import { useCallback, useEffect, useRef, useState } from 'react';

import type { CategoriaFavorito } from '@/database/repositories/favoritos';
import type { Registo } from '@/domain/enderecamento/meusRegistos';
import { ultimaAtualizacao, type ItemMorada } from '@/services/moradas/moradas';
import { mudancasMoradas, servicoMoradas, servicoRegistos } from '@/services/moradas/moradasApp';
import { eventosSync } from '@/sync/eventos';

import { useSessao } from './useSessao';

export interface EstadoMoradas {
  /** null enquanto lê o telemóvel pela primeira vez. */
  itens: ItemMorada[] | null;
  aAtualizar: boolean;
  /** Frase simples do último erro ao falar com o servidor (ou null). */
  erro: string | null;
  /** Quando a lista foi trazida do servidor pela última vez (ISO). */
  atualizadoEm: string | null;
  /** Há alterações feitas sem rede à espera de ir para o servidor. */
  pendentes: number;
  /** "Os meus registos": moradas registadas e em que ponto estão (à espera de rede, por validar, aprovadas…). */
  registos: Registo[];
  atualizar(): Promise<void>;
  alterar(id: string, mudancas: { nome: string; categoria: CategoriaFavorito }): Promise<void>;
  remover(id: string): Promise<void>;
}

function frase(e: unknown): string {
  const texto = e instanceof Error ? e.message : String(e);
  return /network|fetch|ligação|rede/i.test(texto)
    ? 'Sem ligação ao servidor. A mostrar o que está neste telemóvel.'
    : texto;
}

/**
 * Favoritos do utilizador (separador Moradas). Mostra logo o que está no
 * telemóvel; com rede, envia as alterações pendentes e traz a lista do servidor.
 */
export function useMoradas(online: boolean | null, { atualizarAoAbrir = true } = {}): EstadoMoradas {
  const userId = useSessao().utilizador?.id ?? null;
  const [itens, setItens] = useState<ItemMorada[] | null>(null);
  const [aAtualizar, setAAtualizar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [registos, setRegistos] = useState<Registo[]>([]);
  const pedido = useRef(0);

  const lerLocal = useCallback(async () => {
    if (!userId) return;
    const meu = ++pedido.current;
    const [lista, meusRegistos] = await Promise.all([
      servicoMoradas.listar(userId).catch(() => null),
      servicoRegistos.listar(userId).catch(() => null),
    ]);
    if (meu !== pedido.current) return;
    if (lista) setItens(lista);
    if (meusRegistos) setRegistos(meusRegistos);
  }, [userId]);

  const atualizar = useCallback(async () => {
    if (!userId || !online) return;
    setAAtualizar(true);
    try {
      // Primeiro os registos: um registo aprovado entra nos favoritos e vem já na lista abaixo.
      await servicoRegistos.atualizar(userId).catch(() => undefined);
      const r = await servicoMoradas.atualizar(userId);
      setErro(r.erro ? frase(r.erro) : null);
    } catch (e) {
      setErro(frase(e));
    } finally {
      setAAtualizar(false);
      mudancasMoradas.avisar();
    }
  }, [userId, online]);

  // Lê o telemóvel e volta a ler quando algum ecrã muda as moradas.
  useEffect(() => {
    void lerLocal();
    const pararA = mudancasMoradas.ouvir(() => void lerLocal());
    // Um registo feito sem rede sai pela fila: deixa de estar "à espera de rede".
    const pararB = eventosSync.ouvir('sincronizado', () => {
      if (online && userId) void atualizar();
      else void lerLocal();
    });
    return () => {
      pararA();
      pararB();
    };
  }, [lerLocal, atualizar, online, userId]);

  // Com rede: atualiza (ao abrir e quando a rede volta). O detalhe não precisa:
  // a lista já o fez.
  useEffect(() => {
    if (atualizarAoAbrir) void atualizar();
  }, [atualizar, atualizarAoAbrir]);

  const alterar = useCallback(
    async (id: string, mudancas: { nome: string; categoria: CategoriaFavorito }) => {
      await servicoMoradas.alterar(id, mudancas);
      mudancasMoradas.avisar();
    },
    [online, userId],
  );

  const remover = useCallback(
    async (id: string) => {
      await servicoMoradas.remover(id);
      mudancasMoradas.avisar();
    },
    [online, userId],
  );

  return {
    itens,
    aAtualizar,
    erro,
    atualizadoEm: itens ? ultimaAtualizacao(itens) : null,
    pendentes: itens ? itens.filter((i) => i.favorito.pendente !== null).length : 0,
    registos,
    atualizar,
    alterar,
    remover,
  };
}
