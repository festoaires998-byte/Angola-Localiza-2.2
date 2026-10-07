import { describe, expect, test } from '@jest/globals';

import { decidirAcesso } from '@/domain/organizacao/cargos';

import { estadoInicial } from '../criarSessao';
import { destinoDaSessao } from '../destino';

const cidadao = decidirAcesso({ perfil: { cargos: [], estadoKyc: null }, nivel: 'aal1', temFatorMfa: false });
const tecnicoSemCodigo = decidirAcesso({ perfil: { cargos: ['tecnico_campo'], estadoKyc: 'ID_VERIFIED' }, nivel: 'aal1', temFatorMfa: true });

describe('destino da sessão: nome completo obrigatório', () => {
  const base = { ...estadoInicial(), carregado: true, perfilLido: true };

  test('sem nome → /o-teu-nome; com nome → /mapa', () => {
    expect(destinoDaSessao({ ...base, utilizador: { id: 'u', email: 'a@b.ao', nome: null }, acesso: cidadao })).toBe('/o-teu-nome');
    expect(destinoDaSessao({ ...base, utilizador: { id: 'u', email: 'a@b.ao' }, acesso: cidadao })).toBe('/o-teu-nome');
    expect(destinoDaSessao({ ...base, utilizador: { id: 'u', email: 'a@b.ao', nome: 'Ana Silva' }, acesso: cidadao })).toBe('/inicio');
  });

  test('sem sessão, a carregar e MFA vêm antes do nome', () => {
    expect(destinoDaSessao({ ...base, utilizador: null, acesso: cidadao })).toBe('/entrar');
    expect(destinoDaSessao({ ...base, carregado: false, utilizador: null, acesso: cidadao })).toBe('carregar');
    expect(destinoDaSessao({ ...base, utilizador: { id: 'u', email: null, nome: null }, acesso: tecnicoSemCodigo })).toBe('/codigo-mfa');
  });
});
