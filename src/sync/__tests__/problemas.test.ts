import { describe, expect, test } from '@jest/globals';

import { juntarProblemas } from '../problemas';

describe('operacoesComProblema', () => {
  test('junta as falhadas e os avisos de provas, das mais recentes para as mais antigas', () => {
    const lista = juntarProblemas(
      [
        {
          operation_id: 'op-1',
          operation_type: 'field_submit',
          ultimo_erro: 'A foto foi alterada ou danificada depois de ser tirada',
          criado_em: '2026-09-23T10:00:00.000Z',
        },
        { operation_id: 'op-2', operation_type: 'create_address', ultimo_erro: null, criado_em: '2026-09-23T08:00:00.000Z' },
      ],
      [{ operation_id: 'op-3', motivo: 'A assinatura desta prova não confere', criada_em: '2026-09-23T09:00:00.000Z' }],
    );

    expect(lista).toEqual([
      {
        operation_id: 'op-1',
        operation_type: 'field_submit',
        gravidade: 'falhou',
        erro: 'A foto foi alterada ou danificada depois de ser tirada',
        criado_em: '2026-09-23T10:00:00.000Z',
      },
      {
        operation_id: 'op-3',
        operation_type: 'delivery_proof',
        gravidade: 'aviso',
        erro: 'A assinatura desta prova não confere',
        criado_em: '2026-09-23T09:00:00.000Z',
      },
      {
        operation_id: 'op-2',
        operation_type: 'create_address',
        gravidade: 'falhou',
        erro: 'Não foi possível enviar.',
        criado_em: '2026-09-23T08:00:00.000Z',
      },
    ]);
  });
});
