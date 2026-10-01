/**
 * @jest-environment node
 */
import { describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import { aplicarMigracoes } from '@/database/migrations';
import { criarRepositorioErrosPendentes } from '@/database/repositories/errosPendentes';
import { criarBaseDadosSqlJs } from '@/database/testes/baseDadosSqlJs';

import { criarRelatorioErros, descreverErro, MAX_GUARDADOS, MAX_MENSAGEM, type LinhaErroServidor } from './relatorio';

async function montar() {
  const { db } = await criarBaseDadosSqlJs();
  await aplicarMigracoes(db);
  const erros = criarRepositorioErrosPendentes(db);
  let agora = new Date('2026-10-01T10:00:00.000Z');
  let n = 0;
  const enviados: LinhaErroServidor[][] = [];
  const servidor = { falhar: false };
  const relatorio = criarRelatorioErros({
    erros,
    enviar: jest.fn(async (linhas: LinhaErroServidor[]) => {
      if (servidor.falhar) throw new Error('Sem ligação ao servidor.');
      enviados.push(linhas);
    }),
    gerarId: () => `e-${String(++n).padStart(4, '0')}`,
    agora: () => agora,
    info: async () => ({ versao: '1.0.0', plataforma: 'android', deviceId: 'app-x' }),
  });
  return { erros, relatorio, enviados, servidor, avancar: (ms: number) => (agora = new Date(agora.getTime() + ms)) };
}

describe('relatório de erros', () => {
  test('guarda no telemóvel e envia com a versão, a plataforma e o aparelho; depois apaga', async () => {
    const t = await montar();
    await t.relatorio.registar(new TypeError('x is undefined'), { fatal: true, ecra: 'Mapa' });
    expect(await t.erros.contar()).toBe(1);
    expect(await t.relatorio.enviarPendentes()).toBe(1);
    expect(t.enviados).toEqual([[
      expect.objectContaining({
        message: 'TypeError: x is undefined', fatal: true, screen: 'Mapa',
        occurred_at: '2026-10-01T10:00:00.000Z', app_version: '1.0.0', platform: 'android', device_id: 'app-x',
      }),
    ]]);
    expect(await t.erros.contar()).toBe(0);
  });

  test('o mesmo erro só é guardado uma vez por hora', async () => {
    const t = await montar();
    await t.relatorio.registar(new Error('falhou'));
    await t.relatorio.registar(new Error('falhou'));
    expect(await t.erros.contar()).toBe(1);
    t.avancar(3600 * 1000 + 1);
    await t.relatorio.registar(new Error('falhou'));
    expect(await t.erros.contar()).toBe(2);
  });

  test(`guarda no máximo ${MAX_GUARDADOS} (ficam os mais recentes) e envia em lotes de 20`, async () => {
    const t = await montar();
    for (let i = 0; i < MAX_GUARDADOS + 5; i++) {
      t.avancar(1000);
      await t.relatorio.registar(new Error(`erro ${i}`));
    }
    expect(await t.erros.contar()).toBe(MAX_GUARDADOS);
    expect((await t.erros.listar(1))[0].mensagem).toBe('erro 5');
    expect(await t.relatorio.enviarPendentes()).toBe(MAX_GUARDADOS);
    expect(t.enviados.map((l) => l.length)).toEqual([20, 20, 10]);
  });

  test('sem rede fica guardado para a próxima (não lança)', async () => {
    const t = await montar();
    await t.relatorio.registar('texto solto');
    t.servidor.falhar = true;
    await expect(t.relatorio.enviarPendentes()).resolves.toBe(0);
    expect(await t.erros.contar()).toBe(1);
    t.servidor.falhar = false;
    expect(await t.relatorio.enviarPendentes()).toBe(1);
  });

  test('textos compridos são cortados; qualquer coisa lançada vira mensagem', () => {
    expect(descreverErro(new Error('a'.repeat(900))).mensagem).toHaveLength(MAX_MENSAGEM);
    expect(descreverErro({ codigo: 7 }).mensagem).toBe('{"codigo":7}');
    expect(descreverErro(undefined).mensagem).toBe('Erro desconhecido');
    expect(descreverErro(new Error('')).mensagem).toBe('Erro sem mensagem');
  });
});

describe('tabela app_errors (migração do servidor)', () => {
  const sql = readFileSync(join(__dirname, '../../../supabase/migrations/20261001110000_erros_da_app.sql'), 'utf8');

  test('só escrever os próprios erros; ninguém lê pela API', () => {
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/revoke all on table public\.app_errors from anon, authenticated/);
    expect(sql).toMatch(/grant insert on table public\.app_errors to authenticated/);
    expect(sql).toMatch(/for insert\s+to authenticated\s+with check \(user_id = \(select auth\.uid\(\)\)\)/);
    expect(sql).not.toMatch(/for select/);
  });

  test('limite de 50 por dia e apagados ao fim de 90 dias; textos com o mesmo tamanho da app', () => {
    expect(sql).toMatch(/>= 50 then/);
    expect(sql).toMatch(/interval '90 days'/);
    expect(sql).toMatch(/length\(message\) between 1 and 500/);
    expect(sql).toMatch(/length\(stack\) <= 4000/);
  });
});
