import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { aplicarMigracoes } from '@/database/migrations';
import { criarRepositorioZonasGeocodificadas } from '@/database/repositories/zonasGeocodificadas';
import { criarBaseDadosSqlJs } from '@/database/testes/baseDadosSqlJs';
import { codigoPostalProvisorio } from '@/domain/enderecamento/codigoPostal';

import { codigoPostalValido, criarInfoLocal, VALIDADE_ZONA_MS, zonaDe } from '../infoLocal';

const HUAMBO = { lat: -12.7761, lng: 15.7392 };

async function montar() {
  const { db } = await criarBaseDadosSqlJs();
  await aplicarMigracoes(db);
  let agora = Date.parse('2026-09-23T10:00:00.000Z');
  const zonas = criarRepositorioZonasGeocodificadas(db, () => new Date(agora));
  const geocodificar = jest.fn(async (_lat: number, _lng: number) => ({
    provincia: 'Huambo' as string | null,
    municipio: 'Huambo' as string | null,
    resposta: { address: { state: 'Huambo' } } as unknown,
  }));
  const confirmarCodigo = jest.fn(async (lat: number, lng: number, prov: string | null) => ({
    codigo: codigoPostalProvisorio(lat, lng, prov).codigo.replace(/-(\d{2})$/, '-2-$1'),
  }));
  const info = criarInfoLocal({ zonas, geocodificar, confirmarCodigo, agora: () => agora });
  return { info, zonas, geocodificar, confirmarCodigo, avancar: (ms: number) => (agora += ms) };
}

describe('informação do sítio onde estou', () => {
  let t: Awaited<ReturnType<typeof montar>>;
  beforeEach(async () => {
    t = await montar();
  });

  test('sem rede e sem nada guardado: Plus Code e código provisório com XXX', async () => {
    const i = await t.info.semRede(HUAMBO.lat, HUAMBO.lng);
    expect(i.plusCode).toHaveLength(12); // 11 dígitos + "+"
    expect(i.plusCode).toContain('+');
    expect(i.local).toEqual({ provincia: null, municipio: null, origem: null, atualizadoEm: null });
    if (i.codigoPostal.estado !== 'indisponivel') {
      expect(i.codigoPostal.codigo!.startsWith('AO-XXX-')).toBe(true);
      expect(i.codigoPostal.estado).toBe('provisorio');
    }
  });

  test('com rede: pede a província, guarda-a e confirma o código', async () => {
    const i = await t.info.comRede(HUAMBO.lat, HUAMBO.lng);
    expect(i.local).toMatchObject({ provincia: 'Huambo', municipio: 'Huambo', origem: 'servidor' });
    expect(t.geocodificar).toHaveBeenCalledTimes(1);
    expect(t.confirmarCodigo).toHaveBeenCalledWith(HUAMBO.lat, HUAMBO.lng, 'Huambo');
    expect(await t.zonas.obter(zonaDe(HUAMBO.lat, HUAMBO.lng))).not.toBeNull();
    if (i.codigoPostal.estado !== 'indisponivel') {
      expect(i.codigoPostal).toMatchObject({ estado: 'confirmado' });
      expect(i.codigoPostal.codigo).toMatch(/^AO-HUA-.{8}-2-\d{2}$/);
    }
  });

  test('depois, sem rede, usa a província guardada desta zona', async () => {
    await t.info.comRede(HUAMBO.lat, HUAMBO.lng);
    const i = await t.info.semRede(HUAMBO.lat + 0.0001, HUAMBO.lng);
    expect(i.local).toMatchObject({ provincia: 'Huambo', origem: 'guardado' });
  });

  test('sem rede, numa zona nunca vista mas perto: usa a vizinha e diz que é "perto"', async () => {
    await t.info.comRede(HUAMBO.lat, HUAMBO.lng);
    const i = await t.info.semRede(HUAMBO.lat + 0.01, HUAMBO.lng); // ~1,1 km
    expect(i.local).toMatchObject({ provincia: 'Huambo', origem: 'perto' });
    const longe = await t.info.semRede(HUAMBO.lat + 0.2, HUAMBO.lng); // ~22 km
    expect(longe.local.origem).toBeNull();
  });

  test('não volta a pedir a mesma zona enquanto a resposta é recente', async () => {
    await t.info.comRede(HUAMBO.lat, HUAMBO.lng);
    await t.info.comRede(HUAMBO.lat, HUAMBO.lng);
    expect(t.geocodificar).toHaveBeenCalledTimes(1);
    expect(t.confirmarCodigo).toHaveBeenCalledTimes(1);
    t.avancar(VALIDADE_ZONA_MS + 1);
    await t.info.comRede(HUAMBO.lat, HUAMBO.lng);
    expect(t.geocodificar).toHaveBeenCalledTimes(2);
  });

  test('se o servidor falhar, fica com o provisório e com o que estava guardado', async () => {
    t.geocodificar.mockRejectedValueOnce(new Error('Sem ligação ao servidor.'));
    t.confirmarCodigo.mockRejectedValueOnce(new Error('Sem ligação ao servidor.'));
    const i = await t.info.comRede(HUAMBO.lat, HUAMBO.lng);
    expect(i.local.origem).toBeNull();
    expect(i.codigoPostal.estado === 'provisorio' || i.codigoPostal.estado === 'indisponivel').toBe(true);
  });

  test('código com "undefined" (erro conhecido do servidor) aparece como indisponível', async () => {
    // Procura um ponto do Huambo onde o cálculo dá "undefined".
    let ponto: [number, number] | null = null;
    for (let i = 0; i < 2000 && !ponto; i++) {
      const lat = -12.9 + i * 0.00017;
      const lng = 15.6 + i * 0.00013;
      if (codigoPostalProvisorio(lat, lng, 'Huambo').codigo.includes('undefined')) ponto = [lat, lng];
    }
    expect(ponto).not.toBeNull();
    const i = await t.info.semRede(ponto![0], ponto![1]);
    expect(i.codigoPostal).toEqual({ codigo: null, estado: 'indisponivel' });
  });

  test('validação do formato (a mesma do servidor)', () => {
    expect(codigoPostalValido('AO-HUA-MNFQR6JW-41')).toBe(true);
    expect(codigoPostalValido('AO-HUA-MNFQR6JW-2-41')).toBe(true);
    expect(codigoPostalValido('AO-UÍG-MNFQR6JW-41')).toBe(false);
    expect(codigoPostalValido('AO-HUA-MNundefinedQ-41')).toBe(false);
  });
});
