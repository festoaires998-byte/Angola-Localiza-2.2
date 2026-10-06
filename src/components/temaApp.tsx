import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { ouvirPreferenciaTema, preferenciaTema, type PreferenciaTema } from '@/state/tema';

import { fonteDoPeso, PALETAS, type Cores, type Esquema, type Pastilhas } from './tema';

export interface Tema {
  esquema: Esquema;
  cores: Cores;
  pastilhas: Pastilhas;
}

const Contexto = createContext<Tema>({ esquema: 'claro', ...PALETAS.claro });

/** O modo em uso: a escolha da pessoa, ou o do telemóvel quando é "Automático". */
export function esquemaEfetivo(pref: PreferenciaTema, sistema: string | null | undefined): Esquema {
  if (pref === 'claro' || pref === 'escuro') return pref;
  return sistema === 'dark' ? 'escuro' : 'claro';
}

/** Dá a paleta certa (clara ou escura) a toda a app e muda-a na hora. */
export function ProvedorTema({ children }: { children: ReactNode }) {
  const sistema = useColorScheme();
  const [pref, setPref] = useState(preferenciaTema());
  useEffect(() => ouvirPreferenciaTema(setPref), []);
  const esquema = esquemaEfetivo(pref, sistema);
  const valor = useMemo<Tema>(() => ({ esquema, ...PALETAS[esquema] }), [esquema]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTema(): Tema { return useContext(Contexto); }
export function useCores(): Cores { return useContext(Contexto).cores; }

type Estilo = Record<string, unknown>;

/**
 * Põe a letra da app: um estilo com fontWeight (ou só fontSize) passa a usar o
 * ficheiro de letra desse peso. Os estilos que já escolhem a letra ficam.
 */
export function comLetra<T>(estilos: T): T {
  const saida: Record<string, unknown> = {};
  for (const [nome, valor] of Object.entries(estilos as Record<string, unknown>)) {
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
      const e = valor as Estilo;
      if (!('fontFamily' in e) && ('fontWeight' in e || 'fontSize' in e)) {
        const { fontWeight, ...resto } = e;
        saida[nome] = { ...resto, fontFamily: fonteDoPeso(fontWeight as string | number | undefined) };
        continue;
      }
    }
    saida[nome] = valor;
  }
  return saida as T;
}

const cache = new WeakMap<object, Partial<Record<Esquema, unknown>>>();

/** Estilos feitos com a paleta indicada (guardados: só se fazem uma vez por modo). */
export function estilosPara<T>(fabrica: (cores: Cores) => T, esquema: Esquema): T {
  let porModo = cache.get(fabrica);
  if (!porModo) { porModo = {}; cache.set(fabrica, porModo); }
  if (!(esquema in porModo)) porModo[esquema] = comLetra(fabrica(PALETAS[esquema].cores));
  return porModo[esquema] as T;
}

/** Os estilos do ecrã, na paleta do modo atual. */
export function useEstilos<T>(fabrica: (cores: Cores) => T): T {
  return estilosPara(fabrica, useContext(Contexto).esquema);
}
