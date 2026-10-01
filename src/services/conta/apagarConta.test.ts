/**
 * @jest-environment node
 */
import { describe, expect, jest, test } from '@jest/globals';

import { aplicarMigracoes } from '@/database/migrations';
import { apagarDadosLocaisDoUtilizador } from '@/database/repositories/dadosLocais';
import { criarRepositorioFilaSaida } from '@/database/repositories/filaSaida';
import { criarBaseDadosSqlJs } from '@/database/testes/baseDadosSqlJs';

import { criarApagarConta, mensagemErroApagar } from './apagarConta';

describe('apagar a conta (app)', () => {
  test('primeiro o servidor; só depois apaga o telemóvel e sai', async () => {
    const ordem: string[] = [];
    const apagar = criarApagarConta({
      pedirAoServidor: async (c) => void ordem.push(`servidor:${c}`),
      apagarDadosLocais: async (u) => void ordem.push(`local:${u}`),
      sair: async () => void ordem.push('sair'),
    });
    expect(await apagar('u1', 'APAGAR')).toEqual({ ok: true });
    expect(ordem).toEqual(['servidor:APAGAR', 'local:u1', 'sair']);
  });

  test('se o servidor recusar, não apaga nada no telemóvel nem sai', async () => {
    const local = jest.fn(async (_u: string) => undefined);
    const sair = jest.fn(async () => undefined);
    const apagar = criarApagarConta({
      pedirAoServidor: async () => {
        throw new Error('SUPER_ADMIN: pede a outro super admin');
      },
      apagarDadosLocais: local,
      sair,
    });
    const r = await apagar('u1', 'APAGAR');
    expect(r).toEqual({ ok: false, erro: expect.stringContaining('super administrador') });
    expect(local).not.toHaveBeenCalled();
    expect(sair).not.toHaveBeenCalled();
  });

  test('mensagens simples', () => {
    expect(mensagemErroApagar(new Error('Sem ligação ao servidor.'))).toMatch(/precisas de rede/);
    expect(mensagemErroApagar(new Error('CONFIRMACAO_EM_FALTA: x'))).toMatch(/Escreve APAGAR/);
    expect(mensagemErroApagar(new Error('boom'))).toMatch(/Não foi possível apagar a conta \(boom\)/);
  });

  test('no telemóvel só apaga os dados desta pessoa (outra pessoa no mesmo telemóvel fica)', async () => {
    const { db } = await criarBaseDadosSqlJs();
    await aplicarMigracoes(db);
    let n = 0;
    const fila = criarRepositorioFilaSaida(db, { deviceId: 'app-x', gerarId: () => `op-${++n}` });
    await fila.adicionar('ana', 'create_favorite', {});
    await fila.adicionar('bento', 'create_favorite', {});
    await db.run(`INSERT INTO preferencias (chave, valor, atualizado_em) VALUES ('cidadao_verificado:ana', '1', 'x'), ('cidadao_verificado:bento', '1', 'x')`);
    await apagarDadosLocaisDoUtilizador(db, 'ana');
    expect((await db.getAll<{ user_id: string }>('SELECT user_id FROM fila_saida')).map((l) => l.user_id)).toEqual(['bento']);
    expect((await db.getAll<{ chave: string }>('SELECT chave FROM preferencias')).map((l) => l.chave)).toEqual(['cidadao_verificado:bento']);
  });
});
