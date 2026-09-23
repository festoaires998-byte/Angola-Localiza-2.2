import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { consumirAdesaoPendente, guardarTokenAdesaoPendente, type ResultadoConsumo } from '@/api/auth';
import { NOMES_CARGOS } from '@/components/nomes';
import { Botao, Caixa, Ecra, EcraCarregamento, Texto, Titulo } from '@/components/ui';
import { useSessao } from '@/hooks/useSessao';
import { eCargo } from '@/domain/organizacao/cargos';
import { sessao } from '@/state/sessao';

type Passo =
  | { tipo: 'a_guardar' }
  | { tipo: 'sem_token' }
  | { tipo: 'guardado' }
  | { tipo: 'resultado'; r: ResultadoConsumo }
  | { tipo: 'erro'; mensagem: string };

function nomeCargo(cargo: string): string {
  return eCargo(cargo) ? NOMES_CARGOS[cargo] : cargo;
}

/**
 * Link de adesão: angolalocaliza://adesao?token=…
 * Guarda o token no cofre. Com sessão, aceita-o logo; sem sessão, é aceite
 * depois de entrar (entrar() e criarConta() chamam consumirAdesaoPendente()).
 */
export default function Adesao() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { carregado, utilizador } = useSessao();
  const [passo, setPasso] = useState<Passo>({ tipo: 'a_guardar' });

  useEffect(() => {
    if (!carregado) return;
    let ativo = true;
    (async () => {
      if (!token?.trim()) return setPasso({ tipo: 'sem_token' });
      await guardarTokenAdesaoPendente(token);
      if (!utilizador) {
        if (ativo) setPasso({ tipo: 'guardado' });
        return;
      }
      const r = await consumirAdesaoPendente();
      if (r.estado === 'aderiu') await sessao.recarregar();
      if (ativo) setPasso({ tipo: 'resultado', r });
    })().catch((e: unknown) => {
      if (ativo) setPasso({ tipo: 'erro', mensagem: e instanceof Error ? e.message : 'Não foi possível abrir o convite.' });
    });
    return () => {
      ativo = false;
    };
    // Só na primeira vez que se sabe se há sessão (não repetir ao mudar de utilizador).
  }, [carregado, token]);

  if (passo.tipo === 'a_guardar') return <EcraCarregamento texto="A abrir o convite…" />;

  if (passo.tipo === 'guardado') {
    return (
      <Ecra centrado>
        <Titulo>Convite recebido</Titulo>
        <Texto>Guardámos o teu convite. Entra (ou cria conta) para o aceitar.</Texto>
        <Botao titulo="Entrar" onPress={() => router.replace('/entrar')} />
        <Botao titulo="Criar conta" variante="secundario" onPress={() => router.replace('/criar-conta')} />
      </Ecra>
    );
  }

  let caixa;
  if (passo.tipo === 'sem_token') {
    caixa = <Caixa tipo="erro">Este link de convite está incompleto. Pede um link novo a quem te convidou.</Caixa>;
  } else if (passo.tipo === 'erro') {
    caixa = <Caixa tipo="erro">{passo.mensagem}</Caixa>;
  } else if (passo.r.estado === 'aderiu') {
    caixa = <Caixa tipo="sucesso">{`Convite aceite. O teu cargo: ${nomeCargo(passo.r.cargo)}.`}</Caixa>;
  } else if (passo.r.estado === 'link_invalido') {
    caixa = <Caixa tipo="erro">{`Este convite já não é válido: ${passo.r.mensagem}`}</Caixa>;
  } else if (passo.r.estado === 'tentar_mais_tarde') {
    caixa = (
      <Caixa tipo="aviso">
        Não foi possível aceitar o convite agora (sem ligação?). Fica guardado e tentamos de novo da próxima vez
        que entrares.
      </Caixa>
    );
  } else {
    caixa = <Caixa tipo="info">Não há nenhum convite por aceitar.</Caixa>;
  }

  return (
    <Ecra centrado>
      <Titulo>Convite</Titulo>
      {caixa}
      <Botao titulo="Continuar" onPress={() => router.replace('/')} />
    </Ecra>
  );
}
