import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BotaoSair } from '@/components/BotaoSair';
import { dataHora, NOMES_CARGOS, NOMES_OPERACOES } from '@/components/nomes';
import { CORES, TAMANHOS } from '@/components/tema';
import { Botao, Caixa, Cartao, Ecra, Linha, Subtitulo, Texto, Titulo } from '@/components/ui';
import { KYC_VERIFICADO } from '@/domain/organizacao/cargos';
import { PAISES_PALOP, ouvirPais, paisAtual, selecionarPais } from '@/state/pais';
import { nomeDaMarcaPorCodigo } from '@/config/pais';
import { useCargos } from '@/hooks/useCargos';
import { useFilaSync, type OperacaoComProblema } from '@/hooks/useFilaSync';
import { useSessao } from '@/hooks/useSessao';

function versaoDaApp(): string {
  const versao = Constants.expoConfig?.version ?? '—';
  const build = Constants.nativeBuildVersion;
  return build ? `${versao} (${build})` : versao;
}

function Problema({ op, aoVer }: { op: OperacaoComProblema; aoVer(): void }) {
  const aviso = op.gravidade === 'aviso';
  return (
    <Caixa tipo={aviso ? 'aviso' : 'erro'}>
      <Text style={estilos.problemaTitulo}>
        {NOMES_OPERACOES[op.operation_type] ?? op.operation_type} —{' '}
        {aviso ? 'enviado com aviso' : 'não foi enviado'}
      </Text>
      <Text style={estilos.problemaTexto}>{op.erro}</Text>
      <Text style={estilos.problemaData}>{dataHora(op.criado_em)}</Text>
      {aviso ? (
        <Botao titulo="Já vi" variante="secundario" onPress={aoVer} />
      ) : (
        <Text style={estilos.problemaTexto}>Os ficheiros ficam guardados neste telemóvel.</Text>
      )}
    </Caixa>
  );
}

export default function Definicoes() {
  const router = useRouter();
  const { utilizador } = useSessao();
  const { cargos, estadoKyc, confirmadoAgora } = useCargos();
  const fila = useFilaSync();
  const [resultado, setResultado] = useState<string | null>(null);
  const [pais, setPais] = useState(paisAtual());
  const [aMudarPais, setAMudarPais] = useState(false);

  useEffect(() => ouvirPais(setPais), []);

  async function mudarPais(codigo: string) {
    setAMudarPais(true);
    try { await selecionarPais(codigo); setResultado(null); }
    catch (e) { setResultado(e instanceof Error ? e.message : 'Não foi possível mudar o país.'); }
    finally { setAMudarPais(false); }
  }

  async function sincronizar() {
    setResultado(null);
    try {
      const r = await fila.sincronizarAgora();
      if (r.motivo === 'sem_rede') setResultado('Sem internet. Os trabalhos ficam guardados e são enviados quando houver rede.');
      else if (r.motivo === 'ok') setResultado(r.concluidas > 0 ? `Enviados: ${r.concluidas}.` : 'Está tudo enviado.');
    } catch {
      setResultado('Não foi possível sincronizar agora.');
    }
  }

  return (
    <Ecra>
      <Titulo>Conta</Titulo>

      <Cartao>
        <Subtitulo>A tua conta</Subtitulo>
        <Linha nome="Email" valor={utilizador?.email ?? '—'} />
        <Linha
          nome={cargos.length > 1 ? 'Cargos' : 'Cargo'}
          valor={cargos.length === 0 ? 'Cidadão' : cargos.map((c) => NOMES_CARGOS[c]).join(', ')}
        />
        {cargos.length > 0 && !cargos.includes('super_admin') ? (
          <Linha
            nome="Identidade"
            valor={estadoKyc === KYC_VERIFICADO ? 'Verificada' : 'Ainda não verificada'}
          />
        ) : null}
        {!confirmadoAgora ? (
          <Texto suave>Sem ligação ao servidor: estes são os últimos dados guardados neste telemóvel.</Texto>
        ) : null}
      </Cartao>

      <Cartao>
        <Subtitulo>País ativo</Subtitulo>
        <Texto suave>{`Escolhe o país ativo. A identidade da plataforma será ${nomeDaMarcaPorCodigo(pais)}.`}</Texto>
        {PAISES_PALOP.map((codigo) => (
          <Botao
            key={codigo}
            titulo={pais === codigo ? `✓ ${codigo}` : codigo}
            variante={pais === codigo ? 'primario' : 'secundario'}
            aCarregar={aMudarPais}
            onPress={() => void mudarPais(codigo)}
          />
        ))}
      </Cartao>

      {cargos.length === 0 ? (
        <Cartao>
          <Subtitulo>Verificação simples</Subtitulo>
          <Texto suave>Obrigatória para registares moradas: fotos do BI e duas selfies. Funciona sem rede.</Texto>
          <Botao titulo="Verificação simples" variante="secundario" onPress={() => router.push('/definicoes/verificacao')} />
        </Cartao>
      ) : null}

      <Cartao>
        <Subtitulo>Notificações</Subtitulo>
        <Texto suave>Vê avisos de entregas, validações, Campo e outros eventos da tua conta.</Texto>
        <Botao titulo="Abrir notificações" variante="secundario" onPress={() => router.push('/notificacoes')} />
      </Cartao>

      <Cartao>
        <Subtitulo>Sincronização</Subtitulo>
        <Linha nome="Trabalhos por enviar" valor={String(fila.pendentes)} />
        <Linha nome="Fotos por enviar" valor={String(fila.fotosPendentes)} />
        <Linha nome="Última sincronização" valor={dataHora(fila.ultimaSincronizacao)} />
        {fila.precisaEntrarDeNovo ? (
          <Caixa tipo="erro">
            É preciso entrar de novo. A tua sessão terminou: sai e volta a entrar com esta conta para
            enviar os trabalhos guardados.
          </Caixa>
        ) : fila.ultimoErro ? (
          <Caixa tipo="aviso">{`Último erro: ${fila.ultimoErro}`}</Caixa>
        ) : null}
        {resultado ? <Texto>{resultado}</Texto> : null}
        <Botao
          titulo={fila.aSincronizar ? 'A sincronizar…' : 'Sincronizar agora'}
          aCarregar={fila.aSincronizar}
          onPress={() => void sincronizar()}
        />
      </Cartao>

      {fila.operacoesComProblema.length > 0 ? (
        <Cartao>
          <Subtitulo>Precisam da tua atenção</Subtitulo>
          {fila.operacoesComProblema.map((op) => (
            <Problema
              key={`${op.gravidade}-${op.operation_id}`}
              op={op}
              aoVer={() => void fila.marcarAvisoVisto(op.operation_id)}
            />
          ))}
        </Cartao>
      ) : null}

      <Cartao>
        <Subtitulo>Ajuda</Subtitulo>
        <Texto suave>Se o suporte pedir, abre o diagnóstico e mostra os resultados.</Texto>
        <Botao titulo="Diagnóstico" variante="secundario" onPress={() => router.push('/definicoes/diagnostico')} />
      </Cartao>

      <BotaoSair />

      <View style={estilos.versao}>
        <Texto suave>{`${nomeDaMarcaPorCodigo(pais)}, versão ${versaoDaApp()}`}</Texto>
      </View>
    </Ecra>
  );
}

const estilos = StyleSheet.create({
  problemaTitulo: { fontSize: TAMANHOS.texto, fontWeight: '700', color: CORES.texto },
  problemaTexto: { fontSize: TAMANHOS.textoPequeno, lineHeight: 22, color: CORES.texto },
  problemaData: { fontSize: 14, color: CORES.textoSuave },
  versao: { alignItems: 'center', gap: 4, paddingTop: 8 },
});