import { describe, expect, test } from '@jest/globals';

import { contactoValido } from '../../../supabase/functions/deliveries/regras';

import {
  entregaTerminada,
  faltaNoEnvio,
  lerEnvio,
  lerPin,
  mensagemErroEnvio,
  montarPedidoEnvio,
  nomeEstadoEntrega,
  normalizarTelefone,
  podeCancelar,
  type DadosEnvio,
} from './envio';

const MORADA = 'bbbbbbbb-0000-4000-8000-000000000001';
const completo: DadosEnvio = { moradaId: MORADA, destinatario: '  Maria   João ', telefone: '923456789', instrucoes: ' Portão verde ', urgente: true };

describe('envio: telefone', () => {
  test('aceita 9 algarismos começados por 9, com ou sem +244 e espaços; vazio é opcional', () => {
    expect(normalizarTelefone('923456789')).toBe('+244 923 456 789');
    expect(normalizarTelefone('+244 923 456 789')).toBe('+244 923 456 789');
    expect(normalizarTelefone('244923456789')).toBe('+244 923 456 789');
    expect(normalizarTelefone('  ')).toBeNull();
    for (const mau of ['92345678', '9234567890', '823456789', '+351 912 345 678']) expect(normalizarTelefone(mau)).toBeUndefined();
  });

  test('o que a app aceita, o servidor também aceita', () => {
    for (const t of ['923456789', '+244 923 456 789', '244923456789']) expect(contactoValido(normalizarTelefone(t))).toBe(true);
  });
});

describe('envio: o que falta', () => {
  test('tudo preenchido: nada falta', () => {
    expect(faltaNoEnvio(completo)).toEqual([]);
  });

  test('sem morada, sem nome, telefone errado e instruções compridas', () => {
    expect(faltaNoEnvio({ moradaId: null, destinatario: ' a ', telefone: '12', instrucoes: 'x'.repeat(301), urgente: false })).toEqual([
      'Escolher a morada de destino.',
      'Escrever o nome de quem vai receber.',
      'O telefone tem de ter 9 algarismos e começar por 9 (ex.: 923 456 789).',
      'As instruções têm no máximo 300 letras.',
    ]);
  });
});

describe('envio: pedido para o servidor', () => {
  test('limpa os espaços, normaliza o telefone e usa null no que ficou vazio', () => {
    expect(montarPedidoEnvio(completo)).toEqual({
      address_id: MORADA,
      recipient_name: 'Maria João',
      recipient_phone: '+244 923 456 789',
      instructions: 'Portão verde',
      is_urgent: true,
    });
    expect(montarPedidoEnvio({ ...completo, telefone: '', instrucoes: '  ', urgente: false })).toMatchObject({
      recipient_phone: null,
      instructions: null,
      is_urgent: false,
    });
  });

  test('não monta um pedido incompleto', () => {
    expect(() => montarPedidoEnvio({ ...completo, moradaId: null })).toThrow('Escolher a morada de destino.');
  });
});

describe('envio: respostas do servidor', () => {
  test('lê a entrega (da função create ou da tabela) com a morada', () => {
    expect(
      lerEnvio({
        id: 'e1',
        tracking_code: 'ABC123',
        status: 'ASSIGNED',
        recipient_name: 'Maria',
        recipient_phone: '+244 923 456 789',
        instructions: null,
        is_urgent: true,
        created_by: 'u1',
        updated_at: '2026-09-24T10:00:00Z',
        confirmation_pin: '1234',
        addresses: { postal_code: 'AO-HUA-23456789-42', plus_code: '6GXV+2C', reference: 'Casa azul' },
      }),
    ).toEqual({
      id: 'e1',
      codigo: 'ABC123',
      estado: 'ASSIGNED',
      destinatario: 'Maria',
      telefone: '+244 923 456 789',
      instrucoes: null,
      urgente: true,
      criadoPor: 'u1',
      estafeta: null,
      atualizadoEm: '2026-09-24T10:00:00Z',
      morada: { codigoPostal: 'AO-HUA-23456789-42', plusCode: '6GXV+2C', referencia: 'Casa azul', latitude: null, longitude: null },
    });
    expect(() => lerEnvio({ status: 'CREATED' })).toThrow('Resposta do servidor sem a entrega.');
  });

  test('o Envio nunca leva o PIN (para não ficar guardado no telemóvel)', () => {
    expect(JSON.stringify(lerEnvio({ id: 'e1', confirmation_pin: '1234' }))).not.toContain('1234');
  });

  test('lê o PIN de 4 algarismos', () => {
    expect(lerPin({ pin: '4821', expires_at: '2026-09-27T10:00:00Z', bloqueado: false })).toEqual({
      pin: '4821',
      expiraEm: '2026-09-27T10:00:00Z',
      bloqueado: false,
    });
    expect(() => lerPin({ pin: '12' })).toThrow('Resposta do servidor sem o PIN.');
  });
});

describe('envio: estados e mensagens', () => {
  test('nomes simples, e o código se for um estado novo', () => {
    expect(nomeEstadoEntrega('OUT_FOR_DELIVERY')).toBe('Saiu para entrega');
    expect(nomeEstadoEntrega('NOVO')).toBe('NOVO');
    expect(nomeEstadoEntrega(null)).toBe('—');
  });

  test('só se cancela antes de sair para entrega e enquanto não terminou (como no servidor)', () => {
    expect(['CREATED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'FAILED'].every(podeCancelar)).toBe(true);
    expect(['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].some(podeCancelar)).toBe(false);
    expect(entregaTerminada('DELIVERED')).toBe(true);
    expect(entregaTerminada('FAILED')).toBe(false);
  });

  test('erros do servidor em palavras simples', () => {
    expect(mensagemErroEnvio('CITIZEN_ID_NOT_VERIFIED: verifica')).toMatch(/identidade ainda não foi verificada/);
    expect(mensagemErroEnvio('CONTACTO_INVALID: x')).toMatch(/telefone/);
    expect(mensagemErroEnvio('Sem ligação ao servidor.')).toMatch(/Sem ligação/);
    expect(mensagemErroEnvio('transicao invalida: OUT_FOR_DELIVERY -> CANCELLED')).toMatch(/Já não é possível cancelar/);
    expect(mensagemErroEnvio('outra coisa')).toBe('outra coisa');
  });
});
