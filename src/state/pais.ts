import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { CodigoPais } from '@/config/pais';
import { limparCacheConfigPais, obterConfigPais, PAIS_PADRAO } from '@/config/pais';

export const PAISES_PALOP: readonly CodigoPais[] = ['AO', 'MZ', 'CV', 'GW', 'ST'];
const CHAVE = 'angola-localiza.pais-atual';
let atual: CodigoPais = PAIS_PADRAO;
const ouvintes = new Set<(pais: CodigoPais) => void>();

async function ler(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return typeof localStorage !== 'undefined' ? localStorage.getItem(CHAVE) : null;
    return await SecureStore.getItemAsync(CHAVE);
  } catch { return null; }
}

async function guardar(pais: CodigoPais): Promise<void> {
  try {
    if (Platform.OS === 'web') { if (typeof localStorage !== 'undefined') localStorage.setItem(CHAVE, pais); return; }
    await SecureStore.setItemAsync(CHAVE, pais);
  } catch { /* o país continua válido nesta sessão */ }
}

export async function carregarPaisAtual(): Promise<CodigoPais> {
  const guardado = (await ler())?.trim().toUpperCase();
  const pais = guardado && PAISES_PALOP.includes(guardado) ? guardado : PAIS_PADRAO;
  await selecionarPais(pais, false);
  return pais;
}

export async function selecionarPais(pais: CodigoPais, persistir = true): Promise<void> {
  const codigo = pais.trim().toUpperCase();
  if (!PAISES_PALOP.includes(codigo)) throw new Error('País não suportado.');
  limparCacheConfigPais();
  await obterConfigPais(codigo);
  atual = codigo;
  if (persistir) await guardar(codigo);
  ouvintes.forEach((ouvinte) => ouvinte(codigo));
}

export function paisAtual(): CodigoPais { return atual; }
export function ouvirPais(ouvinte: (pais: CodigoPais) => void): () => void { ouvintes.add(ouvinte); return () => ouvintes.delete(ouvinte); }
