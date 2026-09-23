import type { ProvinciaMunicipio } from '@/api/geocodeNucleo';
import type { ZonaGeocodificada } from '@/database/repositories/zonasGeocodificadas';
import { codigoPostalProvisorio } from '@/domain/enderecamento/codigoPostal';
import { encode } from '@/domain/enderecamento/plusCode';

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
     * - confirmado: devolvido pelo servidor;
     * - indisponivel: o cálculo dá um código inválido (erro conhecido do servidor).
     */
    estado: 'provisorio' | 'confirmado' | 'indisponivel';
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
const CODIGO_VALIDO = /^AO-[A-Z]{3}-[2-9A-HJ-NP-Z]{8}(?:-\d+)?-\d{2}$/;

export function codigoPostalValido(codigo: string): boolean {
  return CODIGO_VALIDO.test(codigo);
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
  agora?(): number;
}

/** Até onde se usa a resposta de uma zona vizinha, sem rede. */
export const RAIO_ZONA_PERTO_M = 3000;
/** De quanto em quanto tempo se volta a pedir a mesma zona ao servidor. */
export const VALIDADE_ZONA_MS = 7 * 24 * 60 * 60 * 1000;
/** De quanto em quanto tempo se volta a confirmar o código da mesma célula. */
export const VALIDADE_CODIGO_MS = 10 * 60 * 1000;

export function criarInfoLocal(deps: DependenciasInfoLocal) {
  const agora = deps.agora ?? Date.now;
  const confirmados = new Map<string, { codigo: string; em: number }>();

  function montar(
    latitude: number,
    longitude: number,
    local: InfoLocal['local'],
  ): InfoLocal {
    const provisorio = codigoPostalProvisorio(latitude, longitude, local.provincia);
    const chave = `${provisorio.sigla}-${provisorio.grelha}`;
    const confirmado = confirmados.get(chave);
    let codigoPostal: InfoLocal['codigoPostal'];
    if (confirmado && codigoPostalValido(confirmado.codigo)) {
      codigoPostal = { codigo: confirmado.codigo, estado: 'confirmado' };
    } else if (codigoPostalValido(provisorio.codigo)) {
      codigoPostal = { codigo: provisorio.codigo, estado: 'provisorio' };
    } else {
      codigoPostal = { codigo: null, estado: 'indisponivel' };
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
    async semRede(latitude: number, longitude: number): Promise<InfoLocal> {
      return montar(latitude, longitude, await localGuardado(latitude, longitude));
    },

    /**
     * Com rede: pede a província/município se a zona não está guardada (ou
     * está velha), guarda a resposta, e confirma o código postal. Se algum
     * pedido falhar, fica com o que já se sabia.
     */
    async comRede(latitude: number, longitude: number): Promise<InfoLocal> {
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
      const anterior = confirmados.get(chave);
      if (!anterior || agora() - anterior.em > VALIDADE_CODIGO_MS) {
        try {
          const r = await deps.confirmarCodigo(latitude, longitude, local.provincia);
          confirmados.set(chave, { codigo: r.codigo, em: agora() });
        } catch {
          // Fica o provisório.
        }
      }
      return montar(latitude, longitude, local);
    },
  };
}

export type ResolvedorInfoLocal = ReturnType<typeof criarInfoLocal>;
