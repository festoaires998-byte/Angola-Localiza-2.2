import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

import { obterConfigSupabase } from '@/config/env';
import { supabase } from '@/api/supabase';
import { prepararDispositivo } from './campoApp';
import { chamarFuncao } from '@/api/edge/chamarFuncao';

export type OperacaoCampoOffline = {
  operation_id: string;
  created_at: string;
  payload: Record<string, unknown>;
  photo_local_uri: string;
};

type Fila = OperacaoCampoOffline[];
type ZonaOffline = {
  centro: { latitude: number; longitude: number };
  raio_metros: number;
  moradas: Array<{
    id: string;
    postal_code?: string | null;
    plus_code?: string | null;
    latitude: number;
    longitude: number;
    house_number?: number | null;
    reference?: string | null;
    street_name?: string | null;
  }>;
  preparado_em: string;
};

const pasta = new Directory(Paths.document, 'campo-offline');
const filaFile = new File(pasta, 'fila.json');
const zonaFile = new File(pasta, 'zona.json');

function garantirPasta() {
  if (!pasta.exists) pasta.create({ intermediates: true, idempotent: true });
}

async function lerJson<T>(file: File, fallback: T): Promise<T> {
  try {
    if (!file.exists) return fallback;
    return JSON.parse(await file.text()) as T;
  } catch {
    return fallback;
  }
}

async function escreverJson(file: File, value: unknown) {
  garantirPasta();
  if (file.exists) file.delete();
  file.create();
  await file.write(JSON.stringify(value));
}

export async function contarCampoOffline(): Promise<number> {
  return (await lerJson<Fila>(filaFile, [])).length;
}

export async function prepararZonaCampoOffline(latitude: number, longitude: number): Promise<ZonaOffline> {
  const zona = await chamarFuncao<ZonaOffline>('offline-zone', 'prepare', {
    body: { latitude, longitude, radius_meters: 800 },
    tempoMaximo: 20_000,
  });
  await escreverJson(zonaFile, zona);
  return zona;
}

export async function lerZonaCampoOffline(): Promise<ZonaOffline | null> {
  return lerJson<ZonaOffline | null>(zonaFile, null);
}

export async function enfileirarCampoOffline(
  payload: Record<string, unknown>,
  fotoUri: string,
): Promise<string> {
  garantirPasta();
  const operationId = Crypto.randomUUID();
  const origem = new File(fotoUri);
  if (!origem.exists) throw new Error('A fotografia já não está disponível neste telemóvel.');
  const destino = new File(pasta, operationId + '.jpg');
  await origem.copy(destino);

  const fila = await lerJson<Fila>(filaFile, []);
  fila.push({
    operation_id: operationId,
    created_at: new Date().toISOString(),
    payload,
    photo_local_uri: destino.uri,
  });
  await escreverJson(filaFile, fila);
  return operationId;
}

export async function sincronizarCampoOffline(): Promise<{ synced: number; pending: number; errors: string[] }> {
  const fila = await lerJson<Fila>(filaFile, []);
  if (fila.length === 0) return { synced: 0, pending: 0, errors: [] };

  const deviceId = await prepararDispositivo();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sem sessão iniciada.');

  const { url, chaveAnon } = obterConfigSupabase();
  const restantes: Fila = [];
  const errors: string[] = [];
  let synced = 0;

  for (const op of fila) {
    try {
      const foto = new File(op.photo_local_uri);
      if (!foto.exists) throw new Error('Fotografia offline não encontrada.');
      const blob = await (await fetch(foto.uri)).blob();
      const caminho = `users/${data.session!.user.id}/${op.operation_id}.jpg`;
      const upload = await supabase.storage.from('field-photos').upload(caminho, blob, {
        contentType: 'image/jpeg',
        upsert: false,
      });
      if (upload.error && !upload.error.message.toLowerCase().includes('already exists')) throw new Error(upload.error.message);
      const publicUrl = supabase.storage.from('field-photos').getPublicUrl(caminho).data.publicUrl;

      const payload = { ...op.payload, photo_facade_url: publicUrl, sync_operation_id: op.operation_id };
      const resposta = await fetch(`${url}/functions/v1/sync`, {
        method: 'POST',
        headers: {
          apikey: chaveAnon,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operations: [{
            operation_id: op.operation_id,
            device_id: deviceId,
            operation_type: 'field_submit',
            payload,
          }],
        }),
      });
      const body = await resposta.json();
      const result = body?.results?.[0];
      if (!resposta.ok || !result || !['SYNCED'].includes(result.status)) {
        throw new Error(result?.error || body?.error || `Erro ${resposta.status} na sincronização.`);
      }
      if (foto.exists) foto.delete();
      synced++;
    } catch (e) {
      restantes.push(op);
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  await escreverJson(filaFile, restantes);
  return { synced, pending: restantes.length, errors };
}
