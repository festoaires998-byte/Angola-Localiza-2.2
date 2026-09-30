import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { Botao, Caixa, Campo, Cartao, Ecra, Linha, Texto, Titulo } from '@/components/ui';
import { useOnline } from '@/hooks/useOnline';
import {
  NOMES_DOCUMENTOS,
  driverKyc,
  mensagemMotorista,
  type CandidaturaPendente,
  type DocumentosCandidatura,
} from '@/services/motorista/driverKyc';

/**
 * Candidaturas de motorista por rever (só administradores). Sem uma candidatura
 * aprovada, o estafeta não pode aceitar nem avançar entregas (deliveries v19+).
 */
export default function CandidaturasMotorista() {
  const online = useOnline();
  const [lista, setLista] = useState<CandidaturaPendente[] | null>(null);
  const [documentos, setDocumentos] = useState<Record<string, DocumentosCandidatura>>({});
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (online === false) return;
    setErro(null);
    try { setLista(await driverKyc.listarPendentes()); }
    catch (e) { setErro(mensagemMotorista(e instanceof Error ? e.message : String(e))); setLista([]); }
  }, [online]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function verDocumentos(userId: string) {
    setOcupado(userId); setErro(null);
    try { const links = await driverKyc.documentos(userId); setDocumentos((d) => ({ ...d, [userId]: links })); }
    catch (e) { setErro(mensagemMotorista(e instanceof Error ? e.message : String(e))); }
    finally { setOcupado(null); }
  }

  async function decidir(c: CandidaturaPendente, decisao: 'approve' | 'reject') {
    const motivo = (motivos[c.user_id] ?? '').trim();
    if (decisao === 'reject' && motivo.length < 5) { setErro('Escreve o motivo da recusa (pelo menos 5 letras).'); return; }
    setOcupado(c.user_id); setErro(null); setAviso(null);
    try {
      await driverKyc.rever(c.user_id, decisao, decisao === 'reject' ? motivo : undefined);
      setAviso(decisao === 'approve' ? `Candidatura de ${c.full_name || c.email || 'motorista'} aprovada.` : 'Candidatura recusada.');
      await carregar();
    } catch (e) { setErro(mensagemMotorista(e instanceof Error ? e.message : String(e))); }
    finally { setOcupado(null); }
  }

  if (online === false) {
    return <Ecra><Titulo>Motoristas</Titulo><Caixa tipo="aviso">Sem rede. A revisão das candidaturas precisa de rede.</Caixa></Ecra>;
  }

  return (
    <Ecra>
      <Titulo>Candidaturas de motorista</Titulo>
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      {aviso ? <Caixa tipo="sucesso">{aviso}</Caixa> : null}
      {lista === null ? <Texto suave>A carregar…</Texto> : lista.length === 0 ? <Texto suave>Não há candidaturas por rever.</Texto> : lista.map((c) => {
        const docs = documentos[c.user_id];
        return (
          <Cartao key={c.user_id}>
            <Texto>{c.full_name || c.email || `Candidato ${c.user_id.slice(0, 8)}`}</Texto>
            {c.email ? <Linha nome="Email" valor={c.email} /> : null}
            <Linha nome="Veículo" valor={`${c.vehicle_type ?? '—'} · ${c.vehicle_plate ?? '—'}`} />
            <Linha nome="Capacidade" valor={c.vehicle_capacity_kg != null ? `${c.vehicle_capacity_kg} kg` : 'não indicada'} />
            <Linha nome="Carta" valor={`${c.license_number ?? '—'}${c.license_expiry ? ` · válida até ${c.license_expiry}` : ''}`} />
            <Linha nome="País" valor={c.country_code} />
            {docs ? NOMES_DOCUMENTOS.map(([k, nome]) => (
              <Botao key={k} titulo={`Abrir: ${nome}`} variante="secundario" desativado={!docs[k]} onPress={() => { if (docs[k]) void Linking.openURL(docs[k]!); }} />
            )) : <Botao titulo="Ver documentos" variante="secundario" aCarregar={ocupado === c.user_id} onPress={() => void verDocumentos(c.user_id)} />}
            <Botao titulo="Aprovar" desativado={!docs} aCarregar={ocupado === c.user_id} onPress={() => void decidir(c, 'approve')} />
            {!docs ? <Texto suave>Abre os documentos antes de aprovar.</Texto> : null}
            <Campo rotulo="Motivo da recusa" value={motivos[c.user_id] ?? ''} onChangeText={(v) => setMotivos((m) => ({ ...m, [c.user_id]: v }))} placeholder="Ex.: carta de condução ilegível" />
            <Botao titulo="Recusar" variante="perigo" aCarregar={ocupado === c.user_id} onPress={() => void decidir(c, 'reject')} />
          </Cartao>
        );
      })}
      <Botao titulo="Atualizar" variante="secundario" onPress={() => void carregar()} />
    </Ecra>
  );
}
