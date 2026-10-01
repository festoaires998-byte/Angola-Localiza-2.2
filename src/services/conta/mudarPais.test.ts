import { describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import { avisoMudarPais, criarMudarPais, mensagemErroMudarPais, SEM_REDE_PAIS, type DependenciasMudarPais } from './mudarPais';

function deps(extra: Partial<DependenciasMudarPais> = {}) {
  const passos: string[] = [];
  const d: DependenciasMudarPais = {
    estaOnline: async () => true,
    pedirAoServidor: async (codigo) => { passos.push(`servidor:${codigo}`); },
    atualizarSessao: async () => { passos.push('sessao'); },
    aplicarNoTelemovel: async (codigo) => { passos.push(`telemovel:${codigo}`); },
    ...extra,
  };
  return { d, passos };
}

describe('mudar o país da conta', () => {
  test('primeiro o servidor, depois a sessão e só no fim o telemóvel', async () => {
    const { d, passos } = deps();
    expect(await criarMudarPais(d)(' mz ')).toEqual({ ok: true, pais: 'MZ' });
    expect(passos).toEqual(['servidor:MZ', 'sessao', 'telemovel:MZ']);
  });

  test('sem rede não pede nada e não muda o telemóvel', async () => {
    const { d, passos } = deps({ estaOnline: async () => false });
    expect(await criarMudarPais(d)('MZ')).toEqual({ ok: false, erro: SEM_REDE_PAIS });
    expect(passos).toEqual([]);
  });

  test('se o servidor recusar, o telemóvel fica como estava', async () => {
    const aplicar = jest.fn(async (_c: string) => undefined);
    const { d } = deps({
      pedirAoServidor: async () => { throw new Error('MUDAR_PAIS_PESSOAL: o pessoal com cargo pede a um administrador'); },
      aplicarNoTelemovel: aplicar,
    });
    const r = await criarMudarPais(d)('CV');
    expect(r).toEqual({ ok: false, erro: 'Tens um cargo na plataforma: para mudar de país, pede a um administrador.' });
    expect(aplicar).not.toHaveBeenCalled();
  });

  test('gravado no servidor: uma falha a renovar a sessão não estraga o resultado', async () => {
    const { d, passos } = deps({ atualizarSessao: async () => { throw new Error('offline'); } });
    expect(await criarMudarPais(d)('ST')).toEqual({ ok: true, pais: 'ST' });
    expect(passos).toEqual(['servidor:ST', 'telemovel:ST']);
  });

  test('mensagens simples para cada erro', () => {
    expect(mensagemErroMudarPais(new Error('MUDAR_PAIS_MOTORISTA: x'))).toMatch(/És motorista/);
    expect(mensagemErroMudarPais(new Error('MUDAR_PAIS_INVALIDO: x'))).toBe('Este país ainda não está disponível.');
    expect(mensagemErroMudarPais(new Error('MUDAR_PAIS_SEM_SESSAO: x'))).toMatch(/sessão terminou/);
    expect(mensagemErroMudarPais(new Error('TypeError: Network request failed'))).toBe(SEM_REDE_PAIS);
    expect(mensagemErroMudarPais(new Error('outra coisa'))).toBe('Não foi possível mudar o país (outra coisa). Tenta outra vez mais tarde.');
  });

  test('o aviso diz o que muda e o que fica', () => {
    expect(avisoMudarPais('GW')).toBe('O mapa, as pesquisas e as moradas novas passam a ser de Guiné-Bissau (Guiné-Bissau Localiza). As moradas que já guardaste não mudam.');
  });
});

describe('migração mudar_pais_da_conta', () => {
  const sql = readFileSync(join(__dirname, '../../../supabase/migrations/20261002090000_mudar_pais_da_conta.sql'), 'utf8');

  test('só para quem tem sessão, sobre a própria conta', () => {
    expect(sql).toMatch(/security definer\s+set search_path = ''/);
    expect(sql).toMatch(/v_user uuid := auth\.uid\(\)/);
    expect(sql).toMatch(/revoke all on function public\.mudar_pais_da_conta\(text\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.mudar_pais_da_conta\(text\) to authenticated;/);
    // Nunca recebe o id de outra pessoa.
    expect(sql).not.toMatch(/p_user/);
  });

  test('só países ativos; pessoal com cargo e motoristas não mudam sozinhos', () => {
    expect(sql).toMatch(/country_configs c where c\.country_code = v_codigo and c\.enabled/);
    expect(sql).toMatch(/MUDAR_PAIS_PESSOAL/);
    expect(sql).toMatch(/from public\.organization_members m where m\.user_id = v_user/);
    expect(sql).toMatch(/MUDAR_PAIS_MOTORISTA/);
    expect(sql).toMatch(/from public\.driver_profiles d where d\.user_id = v_user/);
  });

  test('grava na conta e na metadata, e regista na auditoria', () => {
    expect(sql).toMatch(/insert into public\.user_country_profiles/);
    expect(sql).toMatch(/jsonb_build_object\('country_code', v_codigo\)/);
    expect(sql).toMatch(/'account_country_changed'/);
  });
});
