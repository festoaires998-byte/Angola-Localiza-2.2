import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { BotaoSair } from '@/components/BotaoSair';
import { dataHora, NOMES_CARGOS, NOMES_OPERACOES } from '@/components/nomes';
import { TAMANHOS, type Cores } from '@/components/tema';
import { useEstilos } from '@/components/temaApp';
import { Botao, CabecalhoCartao, Caixa, Cartao, Ecra, Linha, Texto, Titulo } from '@/components/ui';
import { KYC_VERIFICADO } from '@/domain/organizacao/cargos';
import { PAISES_PALOP, ouvirPais, paisAtual } from '@/state/pais';
import { escolherTema, ouvirPreferenciaTema, preferenciaTema, type PreferenciaTema } from '@/state/tema';
import { avisoMudarPais } from '@/services/conta/mudarPais';
import { mudarPaisDaConta } from '@/services/conta/mudarPaisApp';
import { URL_POLITICA_PRIVACIDADE } from '@/config/links';
import { nomeDaMarcaPorCodigo, nomeDoPais, paisComBandeira } from '@/config/pais';
import { useCargos } from '@/hooks/useCargos';
import { useFilaSync, type OperacaoComProblema } from '@/hooks/useFilaSync';
import { useSessao } from '@/hooks/useSessao';

const OPCOES_TEMA: [PreferenciaTema, string][] = [['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']];

function versaoDaApp(): string {
  const versao = Constants.expoConfig?.version ?? '—';
  const build = Constants.nativeBuildVersion;
  return build ? `${versao} (${build})` : versao;
}

function Problema({ op, aoVer }: { op: OperacaoComProblema; aoVer(): void }) {
  const estilos = useEstilos(fabricaEstilos);
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
  const estilos = useEstilos(fabricaEstilos);
  const router = useRouter();
  const { utilizador } = useSessao();
  const { cargos, estadoKyc, confirmadoAgora } = useCargos();
  const fila = useFilaSync();
  const [resultado, setResultado] = useState<string | null>(null);
  const [pais, setPais] = useState(paisAtual());
  const [preferencia, setPreferencia] = useState(preferenciaTema());
  useEffect(() => ouvirPreferenciaTema(setPreferencia), []);
  const [escolherPais, setEscolherPais] = useState(false);
  const [paraConfirmar, setParaConfirmar] = useState<string | null>(null);
  const [aMudarPais, setAMudarPais] = useState(false);
  const [avisoPais, setAvisoPais] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  useEffect(() => ouvirPais(setPais), []);

  async function confirmarPais(codigo: string) {
    setAMudarPais(true);
    try {
      const r = await mudarPaisDaConta(codigo);
      if (r.ok) {
        setPais(r.pais);
        setAvisoPais({ tipo: 'sucesso', texto: `País da conta mudado para ${nomeDoPais(r.pais)}.` });
        setEscolherPais(false);
      } else {
        setAvisoPais({ tipo: 'erro', texto: r.erro });
      }
      setParaConfirmar(null);
    } finally {
      setAMudarPais(false);
    }
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
        <CabecalhoCartao titulo="A tua conta" icone="conta" cor="verde" />
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
        <CabecalhoCartao titulo="País da conta" icone="pais" cor="ambar" />
        <Linha nome="País" valor={paisComBandeira(pais)} />
        {cargos.length > 0 ? (
          <Texto suave>Tens um cargo na plataforma: para mudar de país, pede a um administrador.</Texto>
        ) : paraConfirmar ? (
          <Caixa tipo="aviso">
            <Text style={estilos.problemaTitulo}>{`Mudar para ${paisComBandeira(paraConfirmar)}?`}</Text>
            <Text style={estilos.problemaTexto}>{avisoMudarPais(paraConfirmar)}</Text>
            <Botao titulo={`Sim, mudar para ${nomeDoPais(paraConfirmar)}`} aCarregar={aMudarPais} onPress={() => void confirmarPais(paraConfirmar)} />
            <Botao titulo="Cancelar" variante="secundario" onPress={() => setParaConfirmar(null)} />
          </Caixa>
        ) : escolherPais ? (
          <>
            <Texto suave>Escolhe o país onde vais usar o Localiza.</Texto>
            {PAISES_PALOP.filter((codigo) => codigo !== pais).map((codigo) => (
              <Botao key={codigo} titulo={paisComBandeira(codigo)} variante="secundario" onPress={() => { setAvisoPais(null); setParaConfirmar(codigo); }} />
            ))}
            <Botao titulo="Cancelar" variante="secundario" onPress={() => setEscolherPais(false)} />
          </>
        ) : (
          <Botao titulo="Mudar de país" variante="secundario" onPress={() => { setAvisoPais(null); setEscolherPais(true); }} />
        )}
        {avisoPais ? <Caixa tipo={avisoPais.tipo}>{avisoPais.texto}</Caixa> : null}
      </Cartao>

      <Cartao>
        <CabecalhoCartao titulo="Aparência" icone="aparencia" cor="roxo" />
        <Texto suave>O modo escuro cansa menos a vista à noite. "Automático" segue o telemóvel.</Texto>
        {OPCOES_TEMA.map(([valor, nome]) => (
          <Botao
            key={valor}
            titulo={preferencia === valor ? `✓ ${nome}` : nome}
            variante={preferencia === valor ? 'primario' : 'secundario'}
            onPress={() => void escolherTema(valor)}
          />
        ))}
      </Cartao>

      <Cartao>
        <CabecalhoCartao titulo="Motorista" icone="motorista" cor="azul" />
        <Texto suave>Candidata-te para trabalhar como motorista. A documentação é revista antes de ativares o perfil.</Texto>
        <Botao titulo="Motorista / KYC" variante="secundario" onPress={() => router.push('/definicoes/motorista')} />
      </Cartao>

      {cargos.length > 0 && !cargos.includes('super_admin') ? (
        <Cartao>
          <CabecalhoCartao titulo="Verificação de identidade" icone="identidade" cor="roxo" />
          <Texto suave>Obrigatória para o pessoal (técnicos, estafetas, supervisores…): fotos do BI e um vídeo curto, revistos por uma pessoa.</Texto>
          <Botao titulo="Verificação de identidade" variante="secundario" onPress={() => router.push('/definicoes/identidade')} />
        </Cartao>
      ) : null}

      {cargos.length === 0 ? (
        <Cartao>
          <CabecalhoCartao titulo="Verificação simples" icone="verificacao" cor="verde" />
          <Texto suave>Obrigatória para registares moradas: fotos do BI e duas selfies. Funciona sem rede.</Texto>
          <Botao titulo="Verificação simples" variante="secundario" onPress={() => router.push('/definicoes/verificacao')} />
        </Cartao>
      ) : null}

      <Cartao>
        <CabecalhoCartao titulo="Notificações" icone="notificacoes" cor="ambar" />
        <Texto suave>Vê avisos de entregas, validações, Campo e outros eventos da tua conta.</Texto>
        <Botao titulo="Abrir notificações" variante="secundario" onPress={() => router.push('/notificacoes')} />
      </Cartao>

      <Cartao>
        <CabecalhoCartao titulo="Sincronização" icone="sincronizacao" cor="azul" />
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
          <CabecalhoCartao titulo="Precisam da tua atenção" icone="atencao" cor="vermelho" />
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
        <CabecalhoCartao titulo="Ajuda" icone="ajuda" cor="roxo" />
        <Texto suave>Se o suporte pedir, abre o diagnóstico e mostra os resultados.</Texto>
        <Botao titulo="Diagnóstico" variante="secundario" onPress={() => router.push('/definicoes/diagnostico')} />
        <Botao titulo="Política de privacidade" variante="secundario" onPress={() => void Linking.openURL(URL_POLITICA_PRIVACIDADE)} />
      </Cartao>

      <BotaoSair />
      <Botao titulo="Apagar a minha conta" variante="perigo" onPress={() => router.push('/definicoes/apagar-conta')} />

      <View style={estilos.versao}>
        <Texto suave>{`${nomeDaMarcaPorCodigo(pais)}, versão ${versaoDaApp()}`}</Texto>
      </View>
    </Ecra>
  );
}

const fabricaEstilos = (CORES: Cores) => StyleSheet.create({
  problemaTitulo: { fontSize: TAMANHOS.texto, fontWeight: '700', color: CORES.texto },
  problemaTexto: { fontSize: TAMANHOS.textoPequeno, lineHeight: 22, color: CORES.texto },
  problemaData: { fontSize: 14, color: CORES.textoSuave },
  versao: { alignItems: 'center', gap: 4, paddingTop: 8 },
});