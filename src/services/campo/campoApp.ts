import * as Crypto from 'expo-crypto';

import { chamarFuncao } from '@/api/edge/chamarFuncao';
import { supabase } from '@/api/supabase';
import { cofreApp } from '@/services/cofre/cofreApp';

const CHAVE_DEVICE = 'campo.device_id.v1';

export interface RuaCampo { id: string; name: string; next_seq: number; numbering_mode: string; }
export interface ContextoCampo {
  quadra_code: string;
  quadra_id?: string;
  area_m2: number;
  kind: string;
  streets: RuaCampo[];
  neighborhoods_nearby: string[];
}
export interface ResultadoCampo { field_record_id: string; status: string; nearby_matches: unknown[]; idempotent_replay?: boolean; }
export interface DuplicadoCampo { found: boolean; distance_meters?: number; postal_code?: string | null; address_id?: string | null; }
export interface ReverificacaoCampo { id: string; postal_code?: string | null; plus_code?: string | null; latitude: number; longitude: number; reference?: string | null; reason: string; }

async function obterDeviceId(): Promise<string> {
  const guardado = await cofreApp.getItemAsync(CHAVE_DEVICE);
  if (guardado) return guardado;
  const id = Crypto.randomUUID();
  await cofreApp.setItemAsync(CHAVE_DEVICE, id);
  return id;
}

/**
 * Regista o dispositivo uma única vez. O servidor associa-o à sessão autenticada.
 * O campo public_key_jwk mantém o contrato da tabela signing_keys; a autorização
 * efetiva desta versão é a associação user_id + device_id validada no servidor.
 */
export async function prepararDispositivo(): Promise<string> {
  const deviceId = await obterDeviceId();
  await chamarFuncao('field-service', 'register_device', {
    body: { device_id: deviceId, public_key_jwk: { kty: 'device', device_id: deviceId } },
  });
  return deviceId;
}

export function verificarDuplicadoCampo(latitude: number, longitude: number): Promise<DuplicadoCampo> {
  return chamarFuncao<DuplicadoCampo>('field-service', 'check_duplicates', { body: { latitude, longitude } });
}

export function listarNumerosRua(streetId: string): Promise<{ house_numbers: number[] }> {
  return chamarFuncao<{ house_numbers: number[] }>('field-service', 'nearby_house_numbers', { body: { street_id: streetId } });
}

export function listarReverificacoesCampo(): Promise<{ flagged: ReverificacaoCampo[] }> {
  return chamarFuncao<{ flagged: ReverificacaoCampo[] }>('field-service', 'list_flagged_for_reverify');
}

export function listarContextoCampo(latitude: number, longitude: number): Promise<ContextoCampo> {
  return chamarFuncao<ContextoCampo>('field-service', 'list_streets_in_quadra', {
    body: { latitude, longitude },
  });
}

export function contarCampoHoje(): Promise<{ count: number }> {
  return chamarFuncao<{ count: number }>('field-service', 'daily_count', { body: {} });
}

export async function enviarCampo(input: {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  accuracyJustification?: string;
  photoFacadeUrl: string;
  photoQrUrl?: string;
  streetId?: string;
  streetName?: string;
  newUnnamedStreet?: boolean;
  neighborhoodName?: string;
  reference: string;
  placeKind?: string;
  watermarkMatch?: boolean;
  syncOperationId?: string;
  overrideDuplicate?: boolean;
  duplicateJustification?: string;
  infillBaseHouseNumber?: number | null;
}): Promise<ResultadoCampo> {
  const deviceId = await prepararDispositivo();
  return chamarFuncao<ResultadoCampo>('field-service', 'submit', {
    body: {
      device_id: deviceId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy_meters: input.accuracyMeters,
      accuracy_justification: input.accuracyJustification,
      photo_facade_url: input.photoFacadeUrl,
      photo_qr_url: input.photoQrUrl,
      street_id: input.streetId,
      street_name: input.streetName,
      new_unnamed_street: input.newUnnamedStreet,
      neighborhood_name: input.neighborhoodName,
      reference: input.reference.trim(),
      place_kind: input.placeKind,
      watermark_match: input.watermarkMatch,
      override_duplicate: input.overrideDuplicate,
      duplicate_justification: input.duplicateJustification,
      infill_base_house_number: input.infillBaseHouseNumber ?? null,
      sync_operation_id: input.syncOperationId ?? Crypto.randomUUID(),
    },
  });
}

/**
 * Envia a foto da fachada para o bucket privado field-photos. `nome` é
 * "<id da pessoa>/<ficheiro>": a regra do Storage só aceita a pasta de quem
 * envia (migração 20260928064000) e a field-service v22 também o exige.
 */
export async function enviarFotoCampo(uri: string, nome: string): Promise<string> {
  const resposta = await fetch(uri);
  if (!resposta.ok) throw new Error('Não foi possível ler a fotografia preparada.');
  const blob = await resposta.blob();
  const caminho = caminhoFotoCampo(nome);
  const { error } = await supabase.storage.from('field-photos').upload(caminho, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return supabase.storage.from('field-photos').getPublicUrl(caminho).data.publicUrl;
}

/** Caminho da foto no bucket: a pasta da pessoa, sem prefixos (antes ia para "users/…" e o Storage recusava). */
export function caminhoFotoCampo(nome: string): string {
  const limpo = nome.replace(/^\/+/, '').replace(/^users\//, '');
  if (!/^[0-9a-f-]{36}\/[^/]+$/i.test(limpo)) throw new Error('A foto tem de ficar na pasta da pessoa (<id>/<ficheiro>).');
  return limpo;
}
