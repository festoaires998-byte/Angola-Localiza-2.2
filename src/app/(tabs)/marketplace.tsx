import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet } from 'react-native';

import { Caixa, Botao, Cartao, Ecra, Linha, Subtitulo, Texto, Titulo } from '@/components/ui';
import { nomeDaMarcaPorCodigo } from '@/config/pais';
import { useCargos } from '@/hooks/useCargos';
import { useOnline } from '@/hooks/useOnline';
import { paisAtual } from '@/state/pais';
import {
  marketplaceEntregas,
  type DispatchContext,
  type MarketplaceDelivery,
  type MarketplaceEstafeta,
} from '@/services/marketplace/entregasMarketplace';

type Confidence = { label: string; score: number | null };

function confiancaTerritorial(ponto: MarketplaceDelivery['addresses']): Confidence {
  const value = ponto ?? {};
  const scoreRaw = value.confidence_score == null ? null : Number(value.confidence_score);
  const status = String(value.status ?? '').toUpperCase();
  if (status === 'PROPOSED' || value.flagged_for_review) {
    return { label: 'Requer atenção', score: Number.isFinite(scoreRaw) ? Math.round(scoreRaw as number) : null };
  }
  if (Number.isFinite(scoreRaw)) {
    const score = Math.max(0, Math.min(100, Math.round(scoreRaw as number)));
    if (score >= 90) return { label: 'Alta', score };
    if (score >= 70) return { label: 'Moderada', score };
    return { label: 'Baixa', score };
  }
  if (['APPROVED', 'OFFICIAL', 'PUBLISHED'].includes(status)) return { label: 'Verificada', score: null };
  return { label: 'Ainda sem classificação', score: null };
}

function pontoDaEntrega(delivery: MarketplaceDelivery) {
  return delivery.addresses ?? delivery.destination ?? {};
}

function estatisticaEstafeta(contexto: DispatchContext | undefined, id: string) {
  const stats = contexto?.drivers?.[id];
  if (!stats) return null;
  const events = Number(stats.events ?? 0);
  const delivered = Number(stats.delivered ?? 0);
  const rate = events > 0 ? Math.round((delivered / events) * 100) : null;
  return { events, rate };
}

export default function Marketplace() {
  const { cargos } = useCargos();
  const online = useOnline();
  const [entregas, setEntregas] = useState<MarketplaceDelivery[]>([]);
  const [estafetas, setEstafetas] = useState<MarketplaceEstafeta[]>([]);
  const [contextos, setContextos] = useState<Record<string, DispatchContext>>({});
  const [selecionados, setSelecionados] = useState<Record<string, string>>({});
  const [modalEntrega, setModalEntrega] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [aAtribuir, setAAtribuir] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const podeGerir = cargos.some((c) =>
    ['super_admin', 'admin_nacional', 'admin_provincial', 'admin_municipal'].includes(c),
  );
  const eEstafeta = cargos.includes('estafeta');

  const pais = paisAtual();
  const marca = nomeDaMarcaPorCodigo(pais);
  const nomePais = marca.replace(/ Localiza$/, '');

  const carregar = useCallback(async () => {
    if (!podeGerir || !online) {
      setACarregar(false);
      return;
    }
    setACarregar(true);
    setErro(null);
    try {
      const [d, e] = await Promise.all([
        marketplaceEntregas.entregasDisponiveis(),
        marketplaceEntregas.estafetas(),
      ]);
      const rows = d.deliveries ?? [];
      setEntregas(rows);
      setEstafetas(e.estafetas ?? []);
      const entries = await Promise.all(
        rows.map(async (delivery) => {
          try {
            return [delivery.id, await marketplaceEntregas.contextoAtribuicao(delivery.id)] as const;
          } catch {
            return [delivery.id, {} as DispatchContext] as const;
          }
        }),
      );
      setContextos(Object.fromEntries(entries));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o Marketplace de entregas.');
    } finally {
      setACarregar(false);
    }
  }, [online, podeGerir]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function atribuir(deliveryId: string) {
    const driverId = selecionados[deliveryId];
    if (!driverId) {
      setErro('Escolhe primeiro o estafeta que vai receber esta entrega.');
      setModalEntrega(deliveryId);
      return;
    }
    setAAtribuir(deliveryId);
    setErro(null);
    setResultado(null);
    try {
      const response = await marketplaceEntregas.atribuir(deliveryId, driverId);
      if (response.error) throw new Error(response.error);
      setResultado('Entrega atribuída com sucesso.');
      setModalEntrega(null);
      setSelecionados((current) => {
        const next = { ...current };
        delete next[deliveryId];
        return next;
      });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível atribuir a entrega.');
    } finally {
      setAAtribuir(null);
    }
  }

  const tituloOperacao = useMemo(
    () => 'Operação de estafetas — ' + nomePais,
    [nomePais],
  );

  if (!podeGerir && eEstafeta) {
    return (
      <Ecra>
        <Titulo>Marketplace</Titulo>
        <Cartao>
          <Subtitulo>Área do estafeta</Subtitulo>
          <Texto>As entregas que te foram atribuídas aparecem no separador Entregas.</Texto>
          <Texto suave>O Marketplace não permite aceitar entregas de outros utilizadores diretamente.</Texto>
        </Cartao>
      </Ecra>
    );
  }

  if (!podeGerir) {
    return (
      <Ecra>
        <Titulo>Marketplace</Titulo>
        <Caixa tipo="aviso">Esta área está disponível apenas para funções autorizadas.</Caixa>
      </Ecra>
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <Titulo>Marketplace de entregas</Titulo>
      <Cartao>
        <Subtitulo>Marketplace de entregas</Subtitulo>
        <Texto>{tituloOperacao}</Texto>
        <Texto suave>
          Gestão de ofertas e estafetas. A atribuição continua protegida pelo backend existente.
        </Texto>
      </Cartao>

      {!online ? <Caixa tipo="aviso">Sem internet. O Marketplace de atribuição precisa de ligação ao servidor.</Caixa> : null}
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      {resultado ? <Caixa tipo="sucesso">{resultado}</Caixa> : null}

      <Subtitulo>Entregas disponíveis para atribuição</Subtitulo>
      {aCarregar ? <Texto suave>A carregar entregas e estafetas…</Texto> : null}
      {!aCarregar && entregas.length === 0 ? (
        <Cartao>
          <Texto>Não existem entregas por atribuir neste momento.</Texto>
        </Cartao>
      ) : null}

      {entregas.map((delivery) => {
        const ponto = pontoDaEntrega(delivery);
        const conf = confiancaTerritorial(ponto);
        const selected = estafetas.find((x) => x.id === selecionados[delivery.id]);
        const contexto = contextos[delivery.id];
        return (
          <Cartao key={delivery.id}>
            <Texto>{delivery.tracking_code ?? delivery.id}</Texto>
            <Texto suave>{delivery.recipient_name ?? 'Destinatário não indicado'}</Texto>
            <Caixa tipo={conf.label === 'Alta' || conf.label === 'Moderada' || conf.label === 'Verificada' ? 'info' : 'aviso'}>
              {'📍 Confiança territorial: ' + conf.label + (conf.score != null ? ' (' + conf.score + '/100)' : '')}
            </Caixa>

            <Linha nome="Estafeta" valor={selected?.email ?? 'Nenhum selecionado'} />
            {selected ? (
              <Texto suave>
                {(() => {
                  const stats = estatisticaEstafeta(contexto, selected.id);
                  return stats
                    ? stats.events + ' registos' + (stats.rate != null ? ' · ' + stats.rate + '% concluídas' : '')
                    : 'Sem histórico operacional disponível.';
                })()}
              </Texto>
            ) : null}

            <Botao
              titulo={selected ? '✓ ' + (selected.email ?? 'Estafeta selecionado') : 'Escolher estafeta'}
              variante="secundario"
              onPress={() => setModalEntrega(delivery.id)}
            />
            <Botao
              titulo={aAtribuir === delivery.id ? 'A atribuir…' : 'Atribuir estafeta'}
              aCarregar={aAtribuir === delivery.id}
              onPress={() => void atribuir(delivery.id)}
            />
          </Cartao>
        );
      })}

      <Subtitulo>Estafetas registados</Subtitulo>
      {estafetas.length === 0 ? (
        <Cartao><Texto>Ainda não existem estafetas registados.</Texto></Cartao>
      ) : (
        estafetas.map((estafeta) => (
          <Cartao key={estafeta.id}>
            <Texto>{'🧑‍✈️ ' + (estafeta.email ?? 'Estafeta')}</Texto>
            <Texto suave>Estado gerido pelo sistema de identidade e permissões.</Texto>
          </Cartao>
        ))
      )}

      <Botao titulo="Sincronizar agora" variante="secundario" aCarregar={aCarregar} onPress={() => void carregar()} />

      <Modal
        visible={modalEntrega !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setModalEntrega(null)}
      >
        <Pressable style={estilos.modalFundo} onPress={() => setModalEntrega(null)}>
          <Pressable style={estilos.modalCartao} onPress={() => undefined}>
            <Titulo>Escolher estafeta</Titulo>
            <Texto suave>Seleciona o estafeta para esta entrega.</Texto>
            <ScrollView style={estilos.listaModal}>
              {estafetas.map((estafeta) => {
                const ativo = modalEntrega ? selecionados[modalEntrega] === estafeta.id : false;
                const stats = modalEntrega ? estatisticaEstafeta(contextos[modalEntrega], estafeta.id) : null;
                return (
                  <Pressable
                    key={estafeta.id}
                    accessibilityRole="button"
                    onPress={() => {
                      if (!modalEntrega) return;
                      setSelecionados((current) => ({ ...current, [modalEntrega]: estafeta.id }));
                      setModalEntrega(null);
                    }}
                    style={[estilos.estafetaOpcao, ativo ? estilos.estafetaAtivo : null]}
                  >
                    <Texto>{ativo ? '✓ ' + (estafeta.email ?? 'Estafeta') : estafeta.email ?? 'Estafeta'}</Texto>
                    <Texto suave>
                      {stats
                        ? stats.events + ' registos' + (stats.rate != null ? ' · ' + stats.rate + '% concluídas' : '')
                        : 'Sem histórico operacional disponível'}
                    </Texto>
                  </Pressable>
                );
              })}
              {estafetas.length === 0 ? <Texto suave>Sem estafetas disponíveis.</Texto> : null}
            </ScrollView>
            <Botao titulo="Fechar" variante="secundario" onPress={() => setModalEntrega(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: 16, gap: 12, paddingBottom: 32 },
  modalFundo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCartao: {
    backgroundColor: '#FBF8F2',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    maxHeight: '78%',
    gap: 10,
  },
  listaModal: { maxHeight: 420 },
  estafetaOpcao: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#D8CDBB',
    borderRadius: 12,
    marginBottom: 8,
  },
  estafetaAtivo: {
    borderWidth: 2,
    borderColor: '#C85426',
  },
});
