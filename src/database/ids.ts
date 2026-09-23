import { randomUUID } from 'expo-crypto';

/** Função que gera identificadores únicos (pode ser trocada nos testes). */
export type GeradorId = () => string;

/** UUID v4 gerado pelo expo-crypto. */
export const gerarUuid: GeradorId = () => {
  const id = randomUUID();
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Não foi possível gerar um UUID.');
  }
  return id;
};
