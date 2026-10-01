import { describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockRegistar = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock('@/services/erros/relatorioApp', () => ({
  relatorioErros: { registar: (...a: unknown[]) => mockRegistar(...a) },
  instalarRelatorioErros: () => undefined,
}));
jest.mock('@/sync/tarefaSegundoPlano', () => ({ registarTarefaSync: async () => undefined }));
jest.mock('@/sync/gatilhos', () => ({ iniciarSync: () => undefined }));
jest.mock('@/state/sessao', () => ({ sessao: { iniciar: () => undefined } }));

const { ErrorBoundary } = require('@/app/_layout') as typeof import('@/app/_layout');

describe('ecrã "Algo correu mal"', () => {
  test('explica, guarda o erro para o relatório e deixa tentar outra vez', async () => {
    const retry = jest.fn(async () => undefined);
    const erro = new Error('falhou a desenhar');
    render(<ErrorBoundary error={erro} retry={retry} />);
    await act(async () => {});
    expect(screen.getByText('Algo correu mal')).toBeTruthy();
    expect(mockRegistar).toHaveBeenCalledWith(erro, { ecra: 'ErrorBoundary' });
    fireEvent.press(screen.getByRole('button', { name: 'Tentar outra vez' }));
    expect(retry).toHaveBeenCalled();
  });
});
