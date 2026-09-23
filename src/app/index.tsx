import { Redirect } from 'expo-router';

import { EcraCarregamento } from '@/components/ui';
import { useSessao } from '@/hooks/useSessao';
import { destinoDaSessao } from '@/state/destino';

/** Primeiro ecrã: espera pela sessão guardada e envia para o sítio certo. */
export default function Inicio() {
  const destino = destinoDaSessao(useSessao());
  if (destino === 'carregar') return <EcraCarregamento />;
  return <Redirect href={destino} />;
}
