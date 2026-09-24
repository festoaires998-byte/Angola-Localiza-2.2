import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { Opcoes, type Opcao } from '@/components/Opcoes';
import { Botao, Caixa, Campo, Ecra, EcraCarregamento, Subtitulo, Texto } from '@/components/ui';
import { faltaNoEnvio, MAX_INSTRUCOES, mensagemErroEnvio, type DadosEnvio } from '@/domain/entregas/envio';
import { useMoradas } from '@/hooks/useMoradas';
import { useOnline } from '@/hooks/useOnline';
import { useSessao } from '@/hooks/useSessao';
import { servicoEnvios } from '@/services/entregas/enviosApp';
import { tituloMorada } from '@/services/moradas/moradas';
import { podeRegistar, type Verificacao } from '@/services/moradas/registo';
import { servicoRegisto } from '@/services/moradas/registoApp';
import { AVISO_NA_FILA, definirAvisoEnvios, guardarEnvio } from '@/state/envios';

const PRIORIDADES: readonly Opcao<'normal' | 'urgente'>[] = [
  { valor: 'normal', nome: 'Normal' },
  { valor: 'urgente', nome: 'Urgente' },
];

/** Novo pedido de entrega: morada de destino (das guardadas), quem recebe e instruções. */
export default function NovoEnvio() {
  const online = useOnline();
  const userId = useSessao().utilizador?.id ?? null;
  const router = useRouter();
  const moradas = useMoradas(online);
  const [verificacao, setVerificacao] = useState<Verificacao | null>(null);
  const [dados, setDados] = useState<DadosEnvio>({ moradaId: null, destinatario: '', telefone: '', instrucoes: '', urgente: false });
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let ativo = true;
    servicoRegisto
      .verificacao(userId, online === true)
      .then((v) => ativo && setVerificacao(v))
      .catch(() => ativo && setVerificacao('desconhecido'));
    return () => {
      ativo = false;
    };
  }, [userId, online]);

  // Só moradas que já existem no servidor (têm id lá).
  const destinos = useMemo<Opcao<string>[]>(
    () =>
      (moradas.itens ?? [])
        .filter((i) => i.morada && i.morada.origem !== 'local' && i.favorito.pendente !== 'remover')
        .map((i) => ({
          valor: i.morada!.id,
          nome: tituloMorada(i),
          detalhe: i.morada!.codigo_postal ?? i.morada!.plus_code ?? undefined,
        })),
    [moradas.itens],
  );

  if (verificacao === null || moradas.itens === null) return <EcraCarregamento texto="A preparar o envio…" />;

  if (!podeRegistar(verificacao)) {
    return (
      <Ecra>
        <Caixa tipo="aviso">
          {verificacao === 'em_revisao' || verificacao === 'pendente'
            ? 'A tua verificação da identidade está à espera de um administrador. Só depois de aprovada podes enviar.'
            : 'Para enviar, primeiro tens de verificar a tua identidade.'}
        </Caixa>
        <Botao titulo="Verificar a minha identidade" onPress={() => router.push('/definicoes/verificacao')} />
      </Ecra>
    );
  }

  const falta = faltaNoEnvio(dados);
  const mudar = (m: Partial<DadosEnvio>) => setDados((d) => ({ ...d, ...m }));

  async function enviar() {
    if (!userId) return;
    setErro(null);
    setAEnviar(true);
    try {
      const r = await servicoEnvios.enviar(userId, dados, online === true);
      if (r.tipo === 'enviado') {
        guardarEnvio(r.envio, r.pin, { tipo: 'sucesso', texto: 'Pedido enviado. Dá o PIN só a quem vai receber a encomenda.' });
        router.replace({ pathname: '/entrega/[id]', params: { id: r.envio.id } });
      } else {
        definirAvisoEnvios({ tipo: 'info', texto: AVISO_NA_FILA });
        router.back();
      }
    } catch (e) {
      setErro(mensagemErroEnvio(e instanceof Error ? e.message : String(e)));
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <Ecra>
      {verificacao === 'desconhecido' ? (
        <Caixa tipo="info">Sem rede não foi possível confirmar a tua verificação. O servidor confirma ao receber.</Caixa>
      ) : null}

      <Subtitulo>Para onde?</Subtitulo>
      {destinos.length > 0 ? (
        <Opcoes grupo="Morada de destino" empilhadas opcoes={destinos} valor={dados.moradaId} aoEscolher={(v) => mudar({ moradaId: v })} />
      ) : (
        <>
          <Caixa tipo="info">
            Ainda não tens moradas guardadas. Primeiro guarda a morada de destino no separador Moradas.
          </Caixa>
          <Botao titulo="Abrir as Moradas" variante="secundario" onPress={() => router.push('/guardados')} />
        </>
      )}

      <Subtitulo>Quem vai receber?</Subtitulo>
      <Campo
        rotulo="Nome de quem recebe"
        value={dados.destinatario}
        onChangeText={(t) => mudar({ destinatario: t })}
        autoCapitalize="words"
        placeholder="Ex.: Maria João"
      />
      <Campo
        rotulo="Telefone de quem recebe (opcional)"
        value={dados.telefone}
        onChangeText={(t) => mudar({ telefone: t })}
        keyboardType="phone-pad"
        placeholder="Ex.: 923 456 789"
      />
      <Campo
        rotulo={`Instruções para o estafeta (opcional, até ${MAX_INSTRUCOES} letras)`}
        value={dados.instrucoes}
        onChangeText={(t) => mudar({ instrucoes: t })}
        multiline
        placeholder="Ex.: Portão verde, tocar à campainha."
      />

      <Subtitulo>Prioridade</Subtitulo>
      <Opcoes grupo="Prioridade" opcoes={PRIORIDADES} valor={dados.urgente ? 'urgente' : 'normal'} aoEscolher={(v) => mudar({ urgente: v === 'urgente' })} />

      {falta.length > 0 ? (
        <Caixa tipo="aviso">{`Falta:\n${falta.map((f) => `• ${f}`).join('\n')}`}</Caixa>
      ) : null}
      {online === false ? (
        <Texto suave>Sem rede: o pedido fica guardado neste telemóvel e é enviado quando a rede voltar.</Texto>
      ) : null}
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      <Botao titulo="Enviar pedido" onPress={() => void enviar()} desativado={falta.length > 0} aCarregar={aEnviar} />
    </Ecra>
  );
}
