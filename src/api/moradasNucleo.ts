/** Leitura dos favoritos do servidor (public.favorites + addresses), sem rede e testável. */
import { eCategoriaFavorito, type FavoritoNovo } from '@/database/repositories/favoritos';
import type { Morada } from '@/database/repositories/moradas';

/** O que se pede ao servidor (PostgREST): o favorito e a morada, com os nomes da província e do município. */
export const SELECAO_FAVORITOS =
  'id,category,label,created_at,address_id,' +
  'addresses(id,postal_code,plus_code,latitude,longitude,accuracy_meters,reference,house_number,' +
  'status,visibility_level,created_at,updated_at,provinces(name),municipalities(name))';

/** Dados da morada que não têm coluna própria na tabela local (vão em `dados`). */
export interface DadosMorada {
  referencia: string | null;
  numero_porta: string | null;
  visibilidade: string | null;
  criada_em: string | null;
}

export interface FavoritoDoServidor {
  favorito: Omit<FavoritoNovo, 'user_id'>;
  morada: Morada;
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

function nomeDe(valor: unknown): string | null {
  // O PostgREST devolve a relação como objeto (ou lista, conforme a relação).
  const v = Array.isArray(valor) ? valor[0] : valor;
  return texto((v as { name?: unknown } | null)?.name);
}

/**
 * Converte as linhas do servidor. Ignora (sem falhar) as que não se conseguem
 * ler: favorito sem morada visível (ex.: morada de outra pessoa que deixou de
 * ser pública) ou sem coordenadas.
 */
export function lerFavoritosDoServidor(linhas: unknown, agoraIso: string): FavoritoDoServidor[] {
  if (!Array.isArray(linhas)) throw new Error('Resposta do servidor inesperada (favoritos).');
  const resultado: FavoritoDoServidor[] = [];
  for (const linha of linhas as Record<string, unknown>[]) {
    const id = texto(linha?.id);
    const a = (Array.isArray(linha?.addresses) ? linha.addresses[0] : linha?.addresses) as
      | Record<string, unknown>
      | null
      | undefined;
    const moradaId = texto(a?.id) ?? texto(linha?.address_id);
    const latitude = numero(a?.latitude);
    const longitude = numero(a?.longitude);
    if (!id || !a || !moradaId || latitude === null || longitude === null) continue;
    const dados: DadosMorada = {
      referencia: texto(a.reference),
      numero_porta: texto(a.house_number),
      visibilidade: texto(a.visibility_level),
      criada_em: texto(a.created_at),
    };
    resultado.push({
      favorito: {
        id,
        morada_id: moradaId,
        nome: texto(linha.label) ?? '',
        categoria: eCategoriaFavorito(linha.category) ? linha.category : 'outro',
        criado_em: texto(linha.created_at),
        atualizado_em: agoraIso,
      },
      morada: {
        id: moradaId,
        plus_code: texto(a.plus_code),
        codigo_postal: texto(a.postal_code),
        latitude,
        longitude,
        precisao_m: numero(a.accuracy_meters),
        provincia: nomeDe(a.provinces),
        municipio: nomeDe(a.municipalities),
        estado: texto(a.status),
        origem: 'servidor',
        dados,
        atualizado_em: texto(a.updated_at) ?? agoraIso,
      },
    });
  }
  return resultado;
}

/** Lê `dados` de uma morada local (pode vir de outra origem, sem estes campos). */
export function lerDadosMorada(dados: unknown): DadosMorada {
  const d = (dados ?? {}) as Record<string, unknown>;
  return {
    referencia: texto(d.referencia),
    numero_porta: texto(d.numero_porta),
    visibilidade: texto(d.visibilidade),
    criada_em: texto(d.criada_em),
  };
}
