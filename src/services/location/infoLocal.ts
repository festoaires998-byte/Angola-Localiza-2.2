import type { ProvinciaMunicipio } from '@/api/geocodeNucleo';
import type { CodigoConfirmado } from '@/database/repositories/codigosConfirmados';
import type { ZonaGeocodificada } from '@/database/repositories/zonasGeocodificadas';
import { codigoPostalProvisorio } from '@/domain/enderecamento/codigoPostal';
import { encode } from '@/domain/enderecamento/plusCode';
import { paisAtual } from '@/state/pais';

/**
 * O que o ecrã do Mapa mostra sobre o sítio onde a pessoa está.
 * Tudo o que dá para calcular sem rede é calculado no telemóvel; o resto vem
 * do servidor quando há rede e fica guardado para a próxima vez.
 */
export interface InfoLocal {
  /** Plus Code de 11 caracteres (~3 m). */
  plusCode: string;
  codigoPostal: {
    /** null quando não há código válido para mostrar. */
    codigo: string | null;
    /**
     * - provisorio: calculado no telemóvel (sem o "-N" que só o servidor sabe);
     * - confirmado: devolvido pelo servidor (agora ou numa vez anterior, ver confirmadoEm);
     * - indisponivel: o cálculo dá um código que o servidor não aceita (não devia acontecer).
     */
    estado: 'provisorio' | 'confirmado' | 'indisponivel';
    /** Quando o servidor o confirmou (ISO); null se não é confirmado. */
    confirmadoEm: string | null;
  };
  local: ProvinciaMunicipio & {
    /**
     * - servidor: acabado de pedir;
     * - guardado: resposta guardada desta zona;
     * - perto: não há resposta desta zona; é a de uma zona guardada perto;
     * - null: não se sabe.
     */
    origem: 'servidor' | 'guardado' | 'perto' | null;
    atualizadoEm: string | null;
  };
}

/** Formato que o servidor aceita (é o regex do action=validate). */
const CODIGO_VALIDO = /^[A-Z]{2}-[A-Z]{3}-[2-9A-HJ-NP-Z]{8}(?:-\d+)?-\d{2}$/;

export function codigoPostalValido(codigo: string, countryCode = paisAtual()): boolean {
  return codigo.toUpperCase().startsWith(`${countryCode.toUpperCase()}-`) && CODIGO_VALIDO.test(codigo);
}

/** Zona de cache: Plus Code de 8 dígitos (~275 m). */
export function zonaDe(latitude: number, longitude: number): string {
  return encode(latitude, longitude, 8).slice(0, 8);
}

export interface DependenciasInfoLocal {
  zonas: {
    obter(zona: string): Promise<ZonaGeocodificada | null>;
    maisProxima(latitude: number, longitude: number, raioM: number): Promise<ZonaGeocodificada | null>;
    guardar(z: Omit<ZonaGeocodificada, 'atualizado_em'>): Promise<ZonaGeocodificada>;
  };
  geocodificar(latitude: number, longitude: number): Promise<ProvinciaMunicipio & { resposta: unknown }>;
  confirmarCodigo(latitude: number, longitude: number, provincia: string | null): Promise<{ codigo: string }>;
  /** Último código confirmado de cada célula, guardado no telemóvel. */
  codigos: {
    obter(chave: string): Promise<CodigoConfirmado | null>;
    guardar(c: Omit<CodigoConfirmado, 'confirmado_em'>): Promise<CodigoConfirmado>;
  };
  agora?(): number;
}

/** Até onde se usa a resposta de uma zona vizinha, sem rede. */
export const RAIO_ZONA_PERTO_M = 3000;
/** De quanto em quanto tempo se volta a pedir a mesma zona ao servidor. */
export const VALIDADE_ZONA_MS = 7 * 24 * 60 * 60 * 1000;
/** De quanto em quanto tempo se volta a confirmar o código da mesma célula. */
export const VALIDADE_CODIGO_MS = 10 * 60 * 1000;

export interface OpcoesInfoLocal {
  /**
   * false quando a posição tem mais de ±10 m de erro (captura "fraca"): o código
   * fica provisório, não se pede a confirmação ao servidor nem se mostra um
   * código confirmado guardado (podia ser o de uma célula vizinha).
   * A província/município continuam a funcionar (as zonas têm ~275 m).
   */
  preciso?: boolean;
}

export function criarInfoLocal(deps: DependenciasInfoLocal) {
  const agora = deps.agora ?? Date.now;
  /** Quando se pediu cada célula ao servidor nesta sessão (para não repetir). */
  const pedidos = new Map<string, number>();

  async function montar(
    latitude: number,
    longitude: number,
    local: InfoLocal['local'],
    preciso: boolean,
  ): Promise<InfoLocal> {
    const provisorio = codigoPostalProvisorio(latitude, longitude, local.provincia, paisAtual());
    const chave = `${provisorio.sigla}-${provisorio.grelha}`;
    const confirmado = preciso ? await deps.codigos.obter(chave).catch(() => null) : null;
    let codigoPostal: InfoLocal['codigoPostal'];
    if (confirmado && codigoPostalValido(confirmado.codigo, paisAtual())) {
      codigoPostal = { codigo: confirmado.codigo, estado: 'confirmado', confirmadoEm: confirmado.confirmado_em };
    } else if (codigoPostalValido(provisorio.codigo, paisAtual())) {
      codigoPostal = { codigo: provisorio.codigo, estado: 'provisorio', confirmadoEm: null };
    } else {
      codigoPostal = { codigo: null, estado: 'indisponivel', confirmadoEm: null };
    }
    return { plusCode: encode(latitude, longitude), codigoPostal, local };
  }

  async function localGuardado(latitude: number, longitude: number): Promise<InfoLocal['local']> {
    try {
      const exata = await deps.zonas.obter(zonaDe(latitude, longitude));
      if (exata) {
        return { provincia: exata.provincia, municipio: exata.municipio, origem: 'guardado', atualizadoEm: exata.atualizado_em };
      }
      const perto = await deps.zonas.maisProxima(latitude, longitude, RAIO_ZONA_PERTO_M);
      if (perto) {
        return { provincia: perto.provincia, municipio: perto.municipio, origem: 'perto', atualizadoEm: perto.atualizado_em };
      }
    } catch {
      // Sem base de dados: continua sem província.
    }
    return { provincia: null, municipio: null, origem: null, atualizadoEm: null };
  }

  return {
    /** Só com o que está no telemóvel (funciona sem rede). */
    async semRede(latitude: number, longitude: number, opcoes: OpcoesInfoLocal = {}): Promise<InfoLocal> {
      return montar(latitude, longitude, await localGuardado(latitude, longitude), opcoes.preciso ?? true);
    },

    /**
     * Com rede: pede a província/município se a zona não está guardada (ou
     * está velha), guarda a resposta, e confirma o código postal (só se a
     * posição for precisa). Se algum pedido falhar, fica com o que já se sabia.
     */
    async comRede(latitude: number, longitude: number, opcoes: OpcoesInfoLocal = {}): Promise<InfoLocal> {
      const preciso = opcoes.preciso ?? true;
      const zona = zonaDe(latitude, longitude);
      let local = await localGuardado(latitude, longitude);
      const velha =
        local.origem !== 'guardado' ||
        !local.atualizadoEm ||
        agora() - Date.parse(local.atualizadoEm) > VALIDADE_ZONA_MS;
      if (velha) {
        try {
          const r = await deps.geocodificar(latitude, longitude);
          const guardada = await deps.zonas
            .guardar({ zona, latitude, longitude, provincia: r.provincia, municipio: r.municipio, resposta: r.resposta })
            .catch(() => null);
          local = {
            provincia: r.provincia,
            municipio: r.municipio,
            origem: 'servidor',
            atualizadoEm: guardada?.atualizado_em ?? new Date(agora()).toISOString(),
          };
        } catch {
          // Mantém o guardado.
        }
      }

      const provisorio = codigoPostalProvisorio(latitude, longitude, local.provincia);
      const chave = `${provisorio.sigla}-${provisorio.grelha}`;
      const anterior = pedidos.get(chave);
      if (preciso && (anterior === undefined || agora() - anterior > VALIDADE_CODIGO_MS)) {
        try {
          const r = await deps.confirmarCodigo(latitude, longitude, local.provincia);
          pedidos.set(chave, agora());
          if (codigoPostalValido(r.codigo)) {
            await deps.codigos.guardar({ chave, codigo: r.codigo, latitude, longitude }).catch(() => null);
          }
        } catch {
          // Fica o último confirmado guardado (ou o provisório).
        }
      }
      return montar(latitude, longitude, local, preciso);
    },
  };
}

export type ResolvedorInfoLocal = ReturnType<typeof criarInfoLocal>;