import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { Botao, Caixa, Campo, Cartao, Ecra, Linha, Marcar, Texto, Titulo } from '@/components/ui';
import { useOnline } from '@/hooks/useOnline';
import { CHECKLIST_KYC, kycPessoal, type PedidoKycPessoal } from '@/services/identidade/kycPessoal';

/**
 * Verificações de identidade do pessoal por rever (Super Admin, Admin Nacional
 * ou Auditor). Cada abertura de um ficheiro fica registada no servidor.
 */
export default function RevisaoIdentidadePessoal() {
  const online = useOnline();
  const [lista, setLista] = useState<PedidoKycPessoal[] | null>(null);
  const [marcados, setMarcados] = useState<Record<string, string[]>>({});
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (online === false) return;
    setErro(null);
    try { setLista(await kycPessoal.pendentes()); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); setLista([]); }
  }, [online]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function abrir(id: string, artefacto: 'id_photo' | 'back' | 'video') {
    setErro(null);
    try {
      const url = await kycPessoal.artefacto(id, artefacto);
      if (!url) { setErro('Este ficheiro não existe.'); return; }
      await Linking.openURL(url);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }

  function alternar(id: string, item: string, marcado: boolean) {
    setMarcados((m) => {
      const atuais = new Set(m[id] ?? []);
      if (marcado) atuais.add(item); else atuais.delete(item);
      return { ...m, [id]: [...atuais] };
    });
  }

  async function decidir(p: PedidoKycPessoal, decisao: 'approve' | 'reject') {
    const motivo = (motivos[p.id] ?? '').trim();
    if (decisao === 'reject' && motivo.length < 3) { setErro('Escreve o motivo da recusa.'); return; }
    setOcupado(p.id); setErro(null); setAviso(null);
    try {
      await kycPessoal.decidir(p.id, decisao, decisao === 'reject' ? motivo : undefined);
      setAviso(decisao === 'approve' ? `Identidade de ${p.email ?? 'utilizador'} aprovada.` : 'Pedido recusado.');
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setOcupado(null); }
  }

  if (online === false) {
    return <Ecra><Titulo>Identidade do pessoal</Titulo><Caixa tipo="aviso">Sem rede. A revisão precisa de rede (os ficheiros não ficam neste telemóvel).</Caixa></Ecra>;
  }

  return (
    <Ecra>
      <Titulo>Identidade do pessoal</Titulo>
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      {aviso ? <Caixa tipo="sucesso">{aviso}</Caixa> : null}
      {lista === null ? <Texto suave>A carregar…</Texto> : lista.length === 0 ? <Texto suave>Nada por rever.</Texto> : lista.map((p) => {
        const feitos = marcados[p.id] ?? [];
        const tudo = CHECKLIST_KYC.every(([k]) => feitos.includes(k));
        return (
          <Cartao key={p.id}>
            <Texto>{p.email ?? `Utilizador ${p.user_id.slice(0, 8)}`}</Texto>
            <Linha nome="Protocolo" valor={`#${p.protocol}`} />
            <Linha nome="BI" valor={`****${p.id_last4 ?? ''}`} />
            <Botao titulo="Ver frente do BI" variante="secundario" onPress={() => void abrir(p.id, 'id_photo')} />
            <Botao titulo="Ver verso do BI" variante="secundario" onPress={() => void abrir(p.id, 'back')} />
            <Botao titulo="Ver vídeo" variante="secundario" onPress={() => void abrir(p.id, 'video')} />
            {CHECKLIST_KYC.map(([k, texto]) => (
              <Marcar key={k} rotulo={texto} marcado={feitos.includes(k)} aoMudar={(v) => alternar(p.id, k, v)} />
            ))}
            <Botao titulo="Aprovar" desativado={!tudo} aCarregar={ocupado === p.id} onPress={() => void decidir(p, 'approve')} />
            {!tudo ? <Texto suave>Confirma todos os pontos antes de aprovar.</Texto> : null}
            <Campo rotulo="Motivo da recusa" value={motivos[p.id] ?? ''} onChangeText={(v) => setMotivos((m) => ({ ...m, [p.id]: v }))} placeholder="Ex.: verso do BI ilegível" />
            <Botao titulo="Recusar" variante="perigo" aCarregar={ocupado === p.id} onPress={() => void decidir(p, 'reject')} />
          </Cartao>
        );
      })}
      <Botao titulo="Atualizar" variante="secundario" onPress={() => void carregar()} />
    </Ecra>
  );
}
