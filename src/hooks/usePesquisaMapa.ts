import { useRef, useState } from 'react';

import { pesquisarNoServidor } from '@/api/pesquisa';
import { interpretarEntrada, type ResultadoPesquisa } from '@/domain/enderecamento/pesquisa';
import type { Coordenada } from '@/domain/enderecamento/plusCode';

/** Um ponto a mostrar no mapa (da pesquisa, de um resultado ou de um QR). */
export interface PontoEncontrado extends Coordenada {
  titulo: string;
}

export interface EstadoPesquisa {
  aProcurar: boolean;
  resultados: ResultadoPesquisa[] | null;
  /** Mensagem de erro (sem rede, servidor, texto inválido). */
  erro: string | null;
  /** Link que não é de mapas (lido num QR): só se abre se a pessoa quiser. */
  link: string | null;
}

const VAZIO: EstadoPesquisa = { aProcurar: false, resultados: null, erro: null, link: null };

/**
 * A pesquisa única do Mapa. Plus Codes, coordenadas e links de mapas
 * resolvem-se no telemóvel (mesmo sem rede); o resto vai ao servidor.
 */
export function usePesquisaMapa(opcoes: {
  online: boolean | null;
  referencia: Coordenada;
  aoEncontrarPonto(ponto: PontoEncontrado): void;
}) {
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<EstadoPesquisa>(VAZIO);
  const pedido = useRef(0);

  async function procurar(entrada: string = texto): Promise<void> {
    const n = ++pedido.current;
    const r = interpretarEntrada(entrada, opcoes.referencia);
    if (r.tipo === 'invalida') return setEstado({ ...VAZIO, erro: r.motivo });
    if (r.tipo === 'link') return setEstado({ ...VAZIO, link: r.url });
    if (r.tipo === 'ponto') {
      setEstado(VAZIO);
      const titulo = r.origem === 'plus_code' ? entrada.trim().toUpperCase() : `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}`;
      opcoes.aoEncontrarPonto({ latitude: r.latitude, longitude: r.longitude, titulo });
      return;
    }
    if (opcoes.online === false) {
      return setEstado({
        ...VAZIO,
        erro: 'Sem rede: sem internet só se encontram Plus Codes, coordenadas e links de mapas. Os códigos postais, as ruas e os bairros precisam de rede.',
      });
    }
    setEstado({ ...VAZIO, aProcurar: true });
    try {
      const resultados = await pesquisarNoServidor(r.query);
      if (n === pedido.current) setEstado({ ...VAZIO, resultados });
    } catch (e) {
      if (n === pedido.current) {
        setEstado({ ...VAZIO, erro: `Não foi possível pesquisar agora. ${e instanceof Error ? e.message : ''}`.trim() });
      }
    }
  }

  function limpar() {
    pedido.current++;
    setTexto('');
    setEstado(VAZIO);
  }

  return { texto, setTexto, estado, procurar, limpar };
}
