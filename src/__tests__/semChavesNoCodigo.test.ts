/**
 * @jest-environment node
 */
// Regra do projeto (CLAUDE.md): nunca escrever chaves ou palavras-passe no código.
// As Edge Functions leem-nas do ambiente (Deno.env) e a app das variáveis EXPO_PUBLIC_*.
import { describe, expect, test } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const RAIZ = join(__dirname, '../..');

/** Chaves do Supabase (novas e antigas em JWT) e o pepper antigo do KYC. */
const PADROES = [/sb_publishable_[A-Za-z0-9_-]{8,}/, /sb_secret_[A-Za-z0-9_-]{8,}/, /eyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, /pepper-fixo/];

function ficheiros(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return nome === 'node_modules' || nome === '__tests__' ? [] : ficheiros(caminho);
    return /\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

describe('sem chaves no código', () => {
  test('nenhuma Edge Function nem ficheiro da app tem chaves escritas', () => {
    const encontrados = [...ficheiros(join(RAIZ, 'supabase/functions')), ...ficheiros(join(RAIZ, 'src'))]
      .filter((f) => PADROES.some((p) => p.test(readFileSync(f, 'utf8'))))
      .map((f) => relative(RAIZ, f));
    expect(encontrados).toEqual([]);
  });

  test('o próprio teste apanha uma chave (para não passar sempre)', () => {
    expect(PADROES.some((p) => p.test('const k = "sb_publishable_9RypatlYEYRmx8"'))).toBe(true);
  });
});
