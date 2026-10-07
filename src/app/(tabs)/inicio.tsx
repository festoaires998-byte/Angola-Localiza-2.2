import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconeSeccao, type NomeSeccao } from '@/components/IconeSeccao';
import { nomeDaMarcaPorCodigo, paisComBandeira } from '@/config/pais';
import { sombraCartao, TAMANHOS, type CorPastilha, type Cores } from '@/components/tema';
import { useCores, useEstilos, useTema } from '@/components/temaApp';
import { vibrarToque } from '@/components/ui';
import { entregaTerminada, nomeEstadoEntrega, type Envio } from '@/domain/entregas/envio';
import { type Separador } from '@/domain/organizacao/cargos';
import { useMoradas } from '@/hooks/useMoradas';
import { useOnline } from '@/hooks/useOnline';
import { useSessao } from '@/hooks/useSessao';
import { servicoEnvios } from '@/services/entregas/enviosApp';
import { tituloMorada } from '@/services/moradas/moradas';
import { lojaEnvios, useEnvios } from '@/state/envios';
import { ouvirPais, paisAtual } from '@/state/pais';

/** "Bom dia" até ao meio-dia, "Boa tarde" até às 19h, depois "Boa noite". */
export function saudacao(hora: number): string {
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 19) return 'Boa tarde';
  return 'Boa noite';
}

/** Só o primeiro nome (o ecrã é pequeno). */
export function primeiroNome(nome: string | null | undefined): string | null {
  const p = (nome ?? '').trim().split(/\s+/)[0];
  return p ? p : null;
}

/** Os passos que a pessoa vê na barra de progresso de um envio. */
export const PASSOS_ENVIO = ['Criada', 'Recolhida', 'A caminho', 'Entregue'] as const;

/** Em que passo está (0 a 3) e quanto da barra fica cheia (0 a 1). */
export function progressoEnvio(estado: string | null): { passo: number; fracao: number } {
  switch (estado) {
    case 'DELIVERED': return { passo: 3, fracao: 1 };
    case 'IN_TRANSIT': case 'OUT_FOR_DELIVERY': return { passo: 2, fracao: 0.7 };
    case 'PICKED_UP': return { passo: 1, fracao: 0.45 };
    case 'ASSIGNED': return { passo: 0, fracao: 0.2 };
    default: return { passo: 0, fracao: 0.08 };
  }
}

/** O envio a mostrar no Início: o mais recente que ainda não acabou. */
export function envioEmCurso(envios: readonly Envio[] | null): Envio | null {
  return (envios ?? []).find((e) => !entregaTerminada(e.estado)) ?? null;
}

interface Atalho { nome: string; icone: NomeSeccao; cor: CorPastilha; destino: Href }

/** Os atalhos que esta pessoa pode usar (os separadores dela), no máximo 4. */
export function atalhosPara(separadores: readonly Separador[]): Atalho[] {
  const tem = (s: Separador) => separadores.includes(s);
  const lista: (Atalho | false)[] = [
    { nome: 'Onde estou', icone: 'origem', cor: 'verde', destino: '/mapa' },
    tem('guardados') && { nome: 'Guardar local', icone: 'estrela', cor: 'ambar', destino: '/guardados/registar' },
    tem('entrega') && { nome: 'Enviar', icone: 'carga', cor: 'azul', destino: '/entrega/novo' },
    tem('campo') && { nome: 'Campo', icone: 'nota', cor: 'azul', destino: '/campo' },
    tem('validar') && { nome: 'Validar', icone: 'verificacao', cor: 'verde', destino: '/validar' },
    tem('minhas-entregas') && { nome: 'Entregas', icone: 'motorista', cor: 'roxo', destino: '/minhas-entregas' },
    tem('guardados') && { nome: 'Moradas', icone: 'mapa', cor: 'roxo', destino: '/guardados' },
    tem('admin') && { nome: 'Gestão', icone: 'identidade', cor: 'vermelho', destino: '/admin' },
  ];
  return lista.filter((a): a is Atalho => !!a).slice(0, 4);
}

export default function Inicio() {
  const estilos = useEstilos(fabricaEstilos);
  const cores = useCores();
  const { pastilhas } = useTema();
  const router = useRouter();
  const sessao = useSessao();
  const online = useOnline();
  const separadores = sessao.acesso.separadores;
  const temMoradas = separadores.includes('guardados');
  const temEnvios = separadores.includes('entrega');
  const moradas = useMoradas(online, { atualizarAoAbrir: false });
  const envios = useEnvios();
  const [pais, setPais] = useState(paisAtual());
  const [aAtualizar, setAAtualizar] = useState(false);
  useEffect(() => ouvirPais(setPais), []);

  const userId = sessao.utilizador?.id ?? null;
  const lerEnvios = useCallback(async () => {
    if (!userId || !temEnvios) return;
    setAAtualizar(true);
    try {
      const lista = await servicoEnvios.listar(userId, online === true);
      lojaEnvios.definir((e) => ({ ...e, envios: lista.envios, doServidor: lista.doServidor, erro: lista.erro }));
    } catch {
      /* fica o que já havia: o Início nunca falha por causa disto */
    } finally {
      setAAtualizar(false);
    }
  }, [userId, temEnvios, online]);
  useEffect(() => { void lerEnvios(); }, [lerEnvios]);

  const nome = primeiroNome(sessao.utilizador?.nome);
  const atalhos = atalhosPara(separadores);
  const emCurso = temEnvios ? envioEmCurso(envios.envios) : null;
  const progresso = progressoEnvio(emCurso?.estado ?? null);
  const listaMoradas = temMoradas ? (moradas.itens ?? []).slice(0, 8) : [];
  const ir = (destino: Href) => { vibrarToque(); router.push(destino); };

  return (
    <SafeAreaView style={estilos.ecra} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={estilos.conteudo}
        refreshControl={<RefreshControl refreshing={aAtualizar} onRefresh={() => void lerEnvios()} />}
      >
        <SafeAreaView edges={['top']} style={estilos.topo}>
          <Svg width={190} height={190} style={estilos.sol} accessibilityElementsHidden>
            <Circle cx={95} cy={95} r={72} stroke={cores.destaque} strokeOpacity={0.22} strokeWidth={24} fill="none" />
          </Svg>
          <Text style={estilos.ola}>{`${saudacao(new Date().getHours())},`}</Text>
          <Text accessibilityRole="header" style={estilos.nome} numberOfLines={1}>{nome ?? 'bem-vindo'}</Text>
          <View style={estilos.chip}>
            <View style={estilos.chipPonto} />
            <Text style={estilos.chipTexto}>{`${paisComBandeira(pais)} · ${nomeDaMarcaPorCodigo(pais)}`}</Text>
          </View>
        </SafeAreaView>

        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Procurar uma rua, um código postal ou um Plus Code"
          onPress={() => ir('/mapa')}
          style={({ pressed }) => [estilos.pesquisa, pressed && estilos.premido]}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Circle cx={11} cy={11} r={7} stroke={cores.textoSuave} strokeWidth={2.4} fill="none" />
            <Path d="M20 20l-3.5-3.5" stroke={cores.textoSuave} strokeWidth={2.4} strokeLinecap="round" />
          </Svg>
          <Text style={estilos.pesquisaTexto}>Rua, código ou Plus Code</Text>
        </Pressable>

        <View style={estilos.corpo}>
          <View style={estilos.atalhos}>
            {atalhos.map((a) => {
              const [corIcone, fundo] = pastilhas[a.cor];
              return (
                <Pressable
                  key={a.nome}
                  accessibilityRole="button"
                  accessibilityLabel={a.nome}
                  onPress={() => ir(a.destino)}
                  style={({ pressed }) => [estilos.atalho, pressed && estilos.premido]}
                >
                  <View style={[estilos.atalhoIcone, { backgroundColor: fundo }]}>
                    <IconeSeccao nome={a.icone} cor={corIcone} tamanho={28} />
                  </View>
                  <Text style={estilos.atalhoNome} numberOfLines={2}>{a.nome}</Text>
                </Pressable>
              );
            })}
          </View>

          {emCurso ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Envio ${emCurso.codigo ?? ''} para ${emCurso.destinatario}. ${nomeEstadoEntrega(emCurso.estado)}`}
              onPress={() => ir({ pathname: '/entrega/[id]', params: { id: emCurso.id } })}
              style={({ pressed }) => [estilos.cartao, pressed && estilos.premido]}
            >
              <View style={estilos.linha}>
                <Text style={estilos.cartaoTitulo}>Envio a decorrer</Text>
                <Text style={estilos.selo}>{nomeEstadoEntrega(emCurso.estado)}</Text>
              </View>
              <Text style={estilos.suave} numberOfLines={1}>
                {[emCurso.codigo, `para ${emCurso.destinatario}`].filter(Boolean).join(' · ')}
              </Text>
              <View style={estilos.barra}>
                <View testID="progresso-envio" style={[estilos.barraCheia, { width: `${Math.round(progresso.fracao * 100)}%` }]} />
              </View>
              <View style={estilos.linha}>
                {PASSOS_ENVIO.map((p, i) => (
                  <Text key={p} style={[estilos.passo, i <= progresso.passo && estilos.passoFeito]}>{p}</Text>
                ))}
              </View>
            </Pressable>
          ) : null}

          {temMoradas ? (
            <View style={estilos.bloco}>
              <View style={estilos.linha}>
                <Text accessibilityRole="header" style={estilos.cartaoTitulo}>As minhas moradas</Text>
                <Pressable accessibilityRole="link" hitSlop={10} onPress={() => ir('/guardados')}>
                  <Text style={estilos.ligacao}>Ver todas</Text>
                </Pressable>
              </View>
              {listaMoradas.length === 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => ir('/guardados/registar')}
                  style={({ pressed }) => [estilos.cartao, pressed && estilos.premido]}
                >
                  <Text style={estilos.cartaoTitulo}>Ainda sem moradas</Text>
                  <Text style={estilos.suave}>Toca aqui para registar a tua casa ou outro local.</Text>
                </Pressable>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.moradas}>
                  {listaMoradas.map((item) => (
                    <Pressable
                      key={item.favorito.id}
                      accessibilityRole="button"
                      accessibilityLabel={tituloMorada(item)}
                      onPress={() => ir({ pathname: '/guardados/[id]', params: { id: item.favorito.id } })}
                      style={({ pressed }) => [estilos.morada, pressed && estilos.premido]}
                    >
                      <Text style={estilos.moradaNome} numberOfLines={1}>{tituloMorada(item)}</Text>
                      {item.morada?.codigo_postal ? <Text style={estilos.moradaCodigo}>{item.morada.codigo_postal}</Text> : null}
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const fabricaEstilos = (CORES: Cores) => StyleSheet.create({
  ecra: { flex: 1, backgroundColor: CORES.fundoEcra },
  conteudo: { paddingBottom: 48 },
  topo: {
    backgroundColor: CORES.faixa,
    paddingHorizontal: TAMANHOS.margem + 4,
    paddingBottom: 56,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
    gap: 2,
  },
  sol: { position: 'absolute', right: -60, top: -40 },
  ola: { fontSize: 16, fontWeight: '600', color: CORES.sobreFaixa, opacity: 0.88, marginTop: 18 },
  nome: { fontSize: 30, fontWeight: '800', color: CORES.sobreFaixa, letterSpacing: -0.5 },
  chip: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipPonto: { width: 9, height: 9, borderRadius: 5, backgroundColor: CORES.destaque },
  chipTexto: { fontSize: 14, fontWeight: '700', color: CORES.sobreFaixa },
  pesquisa: {
    marginTop: -32,
    marginHorizontal: TAMANHOS.margem,
    minHeight: 60,
    borderRadius: 20,
    backgroundColor: CORES.fundo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    ...sombraCartao(CORES),
    shadowOpacity: 0.16,
    elevation: 6,
  },
  pesquisaTexto: { fontSize: 17, fontWeight: '600', color: CORES.textoSuave },
  corpo: { padding: TAMANHOS.margem, gap: 18 },
  atalhos: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  atalho: { flex: 1, alignItems: 'center', gap: 8, minHeight: 96 },
  atalhoIcone: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  atalhoNome: { fontSize: 14, fontWeight: '700', color: CORES.texto, textAlign: 'center' },
  cartao: {
    backgroundColor: CORES.fundo,
    borderRadius: TAMANHOS.raioCartao,
    padding: 18,
    gap: 10,
    borderWidth: CORES.fundo === '#FFFFFF' ? 0 : 1,
    borderColor: CORES.bordaCartao,
    ...sombraCartao(CORES),
  },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cartaoTitulo: { fontSize: 18, fontWeight: '800', color: CORES.texto },
  selo: {
    fontSize: 13,
    fontWeight: '800',
    color: CORES.avisoTexto,
    backgroundColor: CORES.avisoFundo,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  suave: { fontSize: 15, fontWeight: '600', color: CORES.textoSuave },
  barra: { height: 10, borderRadius: 99, backgroundColor: CORES.fundoSuave, overflow: 'hidden' },
  barraCheia: { height: '100%', borderRadius: 99, backgroundColor: CORES.primaria },
  passo: { fontSize: 12, fontWeight: '700', color: CORES.inativo },
  passoFeito: { color: CORES.primaria },
  bloco: { gap: 10 },
  ligacao: { fontSize: 15, fontWeight: '800', color: CORES.primaria },
  moradas: { gap: 10, paddingRight: 8, paddingBottom: 6 },
  morada: {
    backgroundColor: CORES.fundo,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minWidth: 140,
    gap: 4,
    borderWidth: CORES.fundo === '#FFFFFF' ? 0 : 1,
    borderColor: CORES.bordaCartao,
    ...sombraCartao(CORES),
  },
  moradaNome: { fontSize: 16, fontWeight: '800', color: CORES.texto, maxWidth: 200 },
  moradaCodigo: { fontSize: 14, fontWeight: '800', color: CORES.primaria },
  premido: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
