import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { sair } from '@/api/auth';
import { useSessao } from '@/hooks/useSessao';
import { obterRepositoriosSync } from '@/sync/fila';

import { plural } from './nomes';
import { CORES, TAMANHOS } from './tema';
import { Botao, Caixa } from './ui';

/** Texto do aviso quando há trabalhos por enviar (null = não se conseguiu contar). */
export function avisoSair(pendentes: number | null): string {
  const quantos =
    pendentes === null ? 'Podes ter trabalhos por enviar' : `Tens ${plural(pendentes, 'trabalho', 'trabalhos')} por enviar`;
  return (
    `${quantos}. Se saíres, ficam guardados neste telemóvel e só são enviados ` +
    'quando voltares a entrar com esta conta. Antes de trocares de telemóvel, sincroniza tudo.'
  );
}

type Passo = { tipo: 'inicial' } | { tipo: 'a_verificar' } | { tipo: 'aviso'; pendentes: number | null } | { tipo: 'a_sair' };

/**
 * Botão "Sair". Se houver operações deste utilizador por enviar, avisa antes
 * (a fila NÃO é apagada: fica à espera que ele volte a entrar).
 */
export function BotaoSair() {
  const userId = useSessao().utilizador?.id ?? null;
  const [passo, setPasso] = useState<Passo>({ tipo: 'inicial' });
  const [erro, setErro] = useState<string | null>(null);

  async function terminar() {
    setPasso({ tipo: 'a_sair' });
    setErro(null);
    try {
      await sair();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível sair.');
      setPasso({ tipo: 'inicial' });
    }
  }

  async function carregar() {
    if (!userId) return terminar();
    setPasso({ tipo: 'a_verificar' });
    let pendentes: number | null;
    try {
      const { fila } = await obterRepositoriosSync();
      pendentes = await fila.contarPendentesDoUtilizador(userId);
    } catch {
      pendentes = null;
    }
    if (pendentes === 0) return terminar();
    setPasso({ tipo: 'aviso', pendentes });
  }

  if (passo.tipo === 'aviso') {
    return (
      <Caixa tipo="aviso">
        <Text style={estilos.titulo}>Atenção antes de saíres</Text>
        <Text style={estilos.texto}>{avisoSair(passo.pendentes)}</Text>
        <View style={estilos.botoes}>
          <Botao titulo="Ficar" onPress={() => setPasso({ tipo: 'inicial' })} />
          <Botao titulo="Sair na mesma" variante="perigo" onPress={() => void terminar()} />
        </View>
      </Caixa>
    );
  }

  return (
    <View style={estilos.botoes}>
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      <Botao
        titulo={passo.tipo === 'a_sair' ? 'A sair…' : 'Sair'}
        variante="perigo"
        aCarregar={passo.tipo === 'a_verificar' || passo.tipo === 'a_sair'}
        onPress={() => void carregar()}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  titulo: { fontSize: TAMANHOS.subtitulo, fontWeight: '700', color: CORES.avisoTexto },
  texto: { fontSize: TAMANHOS.texto, lineHeight: 26, color: CORES.avisoTexto },
  botoes: { gap: 12 },
});
