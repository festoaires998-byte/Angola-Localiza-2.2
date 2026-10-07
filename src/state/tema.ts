import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/** Escolha da pessoa em Conta → Aparência. "auto" segue o telemóvel. */
export type PreferenciaTema = 'auto' | 'claro' | 'escuro';

const CHAVE = 'angola-localiza.tema';
const VALIDAS: readonly PreferenciaTema[] = ['auto', 'claro', 'escuro'];
let atual: PreferenciaTema = 'auto';
const ouvintes = new Set<(p: PreferenciaTema) => void>();

async function ler(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return typeof localStorage !== 'undefined' ? localStorage.getItem(CHAVE) : null;
    return await SecureStore.getItemAsync(CHAVE);
  } catch { return null; }
}

async function guardar(p: PreferenciaTema): Promise<void> {
  try {
    if (Platform.OS === 'web') { if (typeof localStorage !== 'undefined') localStorage.setItem(CHAVE, p); return; }
    await SecureStore.setItemAsync(CHAVE, p);
  } catch { /* fica só nesta sessão */ }
}

function avisar(p: PreferenciaTema): void { ouvintes.forEach((o) => o(p)); }

/** Lê a escolha guardada (no arranque). */
export async function carregarPreferenciaTema(): Promise<PreferenciaTema> {
  const guardada = (await ler()) as PreferenciaTema | null;
  atual = guardada && VALIDAS.includes(guardada) ? guardada : 'auto';
  avisar(atual);
  return atual;
}

export async function escolherTema(p: PreferenciaTema): Promise<void> {
  if (!VALIDAS.includes(p)) return;
  atual = p;
  avisar(p);
  await guardar(p);
}

export function preferenciaTema(): PreferenciaTema { return atual; }
export function ouvirPreferenciaTema(o: (p: PreferenciaTema) => void): () => void {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}
