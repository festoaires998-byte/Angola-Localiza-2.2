import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AUDIT_LABELS,
  ROLE_LABELS,
  chamarAdmin,
  chamarAdminGet,
  chamarEndpoint,
  chamarFuncao,
  restGet,
  type AdminTab,
} from '@/api/adminGestao';
import { listarPedidosKyc } from '@/api/revisaoKyc';
import { CORES, TAMANHOS } from '@/components/tema';
import { Botao, Caixa, Campo, Cartao, Ecra, Subtitulo, Texto, Titulo } from '@/components/ui';
import { useSessao } from '@/hooks/useSessao';

const TABS: { id: AdminTab; label: string; icon: string }[] = [
  { id: 'operacao', label: 'Operação', icon: '⚙️' },
  { id: 'pessoas', label: 'Pessoas', icon: '👥' },
  { id: 'dados', label: 'Dados', icon: '🗂️' },
  { id: 'financeiro', label: 'Financeiro', icon: '💰' },
  { id: 'programadores', label: 'Programadores', icon: '💻' },
  { id: 'auditoria', label: 'Auditoria', icon: '🧾' },
];

function permitido(tab: AdminTab, cargos: string[]) {
  const superAdmin = cargos.includes('super_admin');
  const nacional = cargos.includes('admin_nacional');
  const dev = ['super_admin', 'admin_nacional', 'admin_provincial', 'admin_municipal', 'operador_postal', 'empresa'].some((x) => cargos.includes(x));
  if (tab === 'financeiro') return superAdmin || nacional;
  if (tab === 'programadores') return dev;
  if (tab === 'auditoria') return true;
  // Auditores ficam limitados à área de auditoria; as exceções acima já trataram
  // de auditoria e das restantes áreas administrativas autorizadas.
  if (cargos.includes('auditor') && !superAdmin && !nacional) return false;
  return true;
}

function numero(v: unknown) {
  return typeof v === 'number' ? v.toLocaleString('pt-PT') : String(v ?? '—');
}

export default function GestaoAdmin() {
  const { perfil } = useSessao();
  const cargos = perfil?.cargos ?? [];
  const tabs = useMemo(() => TABS.filter((t) => permitido(t.id, cargos)), [cargos]);
  const [tab, setTab] = useState<AdminTab>(tabs[0]?.id ?? 'operacao');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!tabs.some((x) => x.id === tab)) setTab(tabs[0]?.id ?? 'operacao');
  }, [tabs, tab]);

  return (
    <Ecra>
      <Titulo>Gestão</Titulo>
      <Subtitulo>Administrador · Angola Localiza</Subtitulo>

      <View style={estilos.abas}>
        {tabs.map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.id }}
            onPress={() => { setErro(null); setTab(t.id); }}
            style={[estilos.aba, tab === t.id && estilos.abaAtiva]}
          >
            <Text style={[estilos.abaTexto, tab === t.id && estilos.abaTextoAtiva]}>{t.icon} {t.label}</Text>
          </Pressable>
        ))}
      </View>

      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}

      {tab === 'operacao' ? <Operacao onError={setErro} /> : null}
      {tab === 'pessoas' ? <Pessoas onError={setErro} /> : null}
      {tab === 'dados' ? <Dados onError={setErro} /> : null}
      {tab === 'financeiro' ? <Financeiro onError={setErro} /> : null}
      {tab === 'programadores' ? <Programadores onError={setErro} /> : null}
      {tab === 'auditoria' ? <Auditoria cargos={cargos} onError={setErro} /> : null}
    </Ecra>
  );
}

function Operacao({ onError }: { onError: (v: string | null) => void }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [territory, setTerritory] = useState<any[]>([]);
  const [territoryOpen, setTerritoryOpen] = useState(false);
  const [kyc, setKyc] = useState<any[]>([]);
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true); onError(null);
    try {
      const [s, p, d, e] = await Promise.all([
        chamarAdminGet('statistics'),
        restGet<any[]>('addresses?status=eq.PROPOSED&select=id,postal_code,plus_code,latitude,longitude,reference,created_at,source&order=created_at.desc&limit=20'),
        chamarAdmin('list_unassigned_deliveries'),
        chamarAdmin('list_estafetas'),
        listarPedidosKyc(),
      ]);
      setStats(s); setPending(Array.isArray(p) ? p : []); setDeliveries(d.deliveries ?? []); setDrivers(e.estafetas ?? []); setKyc(k ?? []);
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [onError]);

  useEffect(() => { void load(); }, [load]);

  const assign = async (deliveryId: string, driverId: string) => {
    try { await chamarFuncao('deliveries', 'assign_driver', { delivery_id: deliveryId, driver_id: driverId }); await load(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  };

  const reviewAddress = async (id: string, action: 'approve_address' | 'reject_address') => {
    try { await chamarAdmin(action, { address_id: id }); await load(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  };

  const territorial = async () => {
    setTerritoryOpen(true);
    try { const r = await chamarAdmin('territorial_stats'); setTerritory(r.territorial_stats ?? []); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  };

  return <>
    <Cartao>
      <Text style={estilos.cabecalhoCard}>📊 Confiança Territorial</Text>
      <Texto suave>Histórico operacional por quadra — informativo, não é ranking.</Texto>
      <Botao titulo={territoryOpen ? 'Atualizar consulta territorial' : 'Consultar'} variante="secundario" onPress={() => void territorial()} />
      {territoryOpen ? (territory.length ? territory.slice(0, 12).map((x, i) => (
        <View key={String(x.quadra_id ?? i)} style={estilos.item}>
          <Texto>{`Quadra ${x.quadra_id ?? '—'}`}</Texto>
          <Texto suave>{`${x.total_events ?? 0} eventos · ${x.delivered ?? 0} concluídas · ${x.failed ?? 0} falhadas`}</Texto>
        </View>
      )) : <Texto suave>Ainda não há histórico territorial suficiente.</Texto>) : null}
    </Cartao>

    <View style={estilos.grid}>
      <Cartao><Text style={estilos.statLabel}>Moradas</Text><Text style={estilos.stat}>{numero(stats?.addresses_total ?? stats?.total_addresses)}</Text></Cartao>
      <Cartao><Text style={estilos.statLabel}>Entregas</Text><Text style={estilos.stat}>{numero(stats?.deliveries_total ?? stats?.total_deliveries)}</Text></Cartao>
      <Cartao><Text style={estilos.statLabel}>Por aprovar</Text><Text style={estilos.stat}>{numero(stats?.addresses_by_status?.PROPOSED ?? pending.length)}</Text></Cartao>
      <Cartao><Text style={estilos.statLabel}>Capturas</Text><Text style={estilos.stat}>{numero(stats?.field_records_pending ?? stats?.field_pending ?? stats?.field_pending_count ?? '—')}</Text></Cartao>
    </View>

    <Text style={estilos.secao}>Verificações por rever</Text>
    {kyc.length === 0 ? <Texto suave>Não há verificações por rever.</Texto> : kyc.map((p: any) => {
      const title = p.nome || p.email || `Cidadão ${String(p.userId || '').slice(0, 8)}`;
      return <Cartao key={p.userId}>
        <Texto>{title}</Texto>
        {p.email ? <Texto suave>{`Email: ${p.email}`}</Texto> : null}
        {p.telefone ? <Texto suave>{`Telefone: ${p.telefone}`}</Texto> : null}
        <Botao titulo={`Rever ${title}`} variante="secundario" onPress={() => router.push({ pathname: '/admin/[id]', params: { id: p.userId } })} />
      </Cartao>;
    })}

    <Text style={estilos.secao}>Moradas por aprovar</Text>
    {pending.length === 0 ? <Texto suave>Nada por aprovar de momento.</Texto> : pending.map((a) => (
      <Cartao key={a.id}>
        <Texto>{a.postal_code || a.plus_code || 'Sem código'}</Texto>
        <Texto suave>{a.latitude?.toFixed?.(4)}, {a.longitude?.toFixed?.(4)} · fonte: {a.source || 'app'}</Texto>
        <View style={estilos.linhaBotoes}>
          <View style={estilos.meia}><Botao titulo="Aprovar" onPress={() => void reviewAddress(a.id, 'approve_address')} /></View>
          <View style={estilos.meia}><Botao titulo="Rejeitar" variante="perigo" onPress={() => void reviewAddress(a.id, 'reject_address')} /></View>
        </View>
      </Cartao>
    ))}

    <Text style={estilos.secao}>Entregas por atribuir</Text>
    {deliveries.length === 0 ? <Texto suave>Nada por atribuir de momento.</Texto> : deliveries.map((d) => (
      <Cartao key={d.id}>
        <Texto>{d.tracking_code || 'Sem tracking'}</Texto>
        <Texto suave>{d.recipient_name || 'Destinatário sem nome'}</Texto>
        {drivers.length ? drivers.map((driver) => (
          <Botao key={driver.id} titulo={`Atribuir a ${driver.email || driver.nome || 'estafeta'}`} variante="secundario" onPress={() => void assign(d.id, driver.id)} />
        )) : <Texto suave>Sem estafetas registados.</Texto>}
      </Cartao>
    ))}
    <Botao titulo="Atualizar Gestão" variante="secundario" onPress={() => void load()} aCarregar={loading} />
  </>;
}

function Pessoas({ onError }: { onError: (v: string | null) => void }) {
  const { perfil } = useSessao();
  const cargos = perfil?.cargos ?? [];
  const best = cargos.includes('super_admin') ? 'super_admin' : cargos.includes('admin_nacional') ? 'admin_nacional' : cargos.includes('admin_provincial') ? 'admin_provincial' : cargos.includes('admin_municipal') ? 'admin_municipal' : cargos.includes('supervisor') ? 'supervisor' : null;
  const allowedByRole: Record<string, string[]> = {
    super_admin: ['super_admin','admin_nacional','admin_provincial','admin_municipal','auditor','operador_postal','supervisor','tecnico_campo','estafeta'],
    admin_nacional: ['admin_provincial','admin_municipal','auditor','operador_postal','supervisor','tecnico_campo','estafeta'],
    admin_provincial: ['admin_municipal','auditor','operador_postal','supervisor','tecnico_campo','estafeta'],
    admin_municipal: ['auditor','operador_postal','supervisor','tecnico_campo','estafeta'],
    supervisor: ['tecnico_campo','estafeta'],
  };
  const inviteRoles = allowedByRole[best ?? ''] ?? [];
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(inviteRoles[0] ?? 'tecnico_campo');
  const [orgs, setOrgs] = useState<any[]>([]);
  const [provinces, setProvinces] = useState<any[]>([]);
  const [municipalities, setMunicipalities] = useState<any[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [provinceId, setProvinceId] = useState('');
  const [municipalityId, setMunicipalityId] = useState('');
  const [staff, setStaff] = useState<any[]>([]);
  const [kyc, setKyc] = useState<any[]>([]);
  const router = useRouter();
  const [links, setLinks] = useState<any[]>([]);
  const [linkRole, setLinkRole] = useState('tecnico_campo');
  const [maxUses, setMaxUses] = useState('10');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, l, p, k] = await Promise.all([
        chamarAdmin('list_staff'),
        chamarFuncao('join-link', 'list'),
        restGet<any[]>('provinces?select=id,name&order=name.asc'),
        listarPedidosKyc(),
      ]);
      setStaff(s.staff ?? []); setLinks(l.links ?? []); setProvinces(p ?? []);
      if (best === 'super_admin') setOrgs(await restGet<any[]>('organizations?select=id,name,type&order=name.asc'));
      if (role === 'admin_municipal') setMunicipalities(await restGet<any[]>('municipalities?select=id,name,province_id&order=name.asc'));
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }, [best, onError, role]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!inviteRoles.includes(role)) setRole(inviteRoles[0] ?? 'tecnico_campo');
  }, [inviteRoles.join('|')]);

  const invite = async () => {
    if (!email.trim()) { setMsg('Introduz o email.'); return; }
    if (role === 'admin_provincial' && !provinceId) { setMsg('Seleciona a província do âmbito.'); return; }
    if (role === 'admin_municipal' && !municipalityId) { setMsg('Seleciona o município do âmbito.'); return; }
    if (best === 'super_admin' && !organizationId) { setMsg('Seleciona o setor/instituição.'); return; }
    setMsg('A processar…');
    try {
      const r = await chamarEndpoint('invite-user', {
        email: email.trim(), role, organization_id: organizationId || null,
        province_id: provinceId || null, municipality_id: municipalityId || null, confirm: false,
      });
      setMsg(r.needs_confirmation ? 'O servidor pediu confirmação adicional para este convite. Faz a confirmação pelo fluxo web.' : (r.promoted ? 'Conta promovida.' : r.assigned_to_existing_account ? 'Cargo atribuído à conta existente.' : 'Convite enviado.'));
      setEmail(''); await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const createLink = async () => {
    try {
      const r = await chamarFuncao('join-link', 'create', { role: linkRole, max_uses: Math.max(1, Number(maxUses) || 10), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() });
      setMsg(`Link criado: ?join=${r.token}`); await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  return <>
    <Cartao>
      <Text style={estilos.cabecalhoCard}>✉️ Convidar por email</Text>
      <Campo rotulo="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="nome@exemplo.com" />
      <Text style={estilos.rotulo}>Cargo</Text>
      <View style={estilos.opcoes}>{inviteRoles.map((r) => <Pressable key={r} onPress={() => setRole(r)} style={[estilos.opcao, role === r && estilos.opcaoAtiva]}><Text style={estilos.opcaoTexto}>{ROLE_LABELS[r]}</Text></Pressable>)}</View>
      {best === 'super_admin' ? <>
        <Text style={estilos.rotulo}>Setor / instituição</Text>
        <View style={estilos.opcoes}>{orgs.map((o) => <Pressable key={o.id} onPress={() => setOrganizationId(o.id)} style={[estilos.opcao, organizationId === o.id && estilos.opcaoAtiva]}><Text style={estilos.opcaoTexto}>{o.name}</Text></Pressable>)}</View>
      </> : null}
      {role === 'admin_provincial' ? <>
        <Text style={estilos.rotulo}>Província (âmbito)</Text>
        <View style={estilos.opcoes}>{provinces.map((p) => <Pressable key={p.id} onPress={() => setProvinceId(p.id)} style={[estilos.opcao, provinceId === p.id && estilos.opcaoAtiva]}><Text style={estilos.opcaoTexto}>{p.name}</Text></Pressable>)}</View>
      </> : null}
      {role === 'admin_municipal' ? <>
        <Text style={estilos.rotulo}>Município (âmbito)</Text>
        <View style={estilos.opcoes}>{municipalities.map((m) => <Pressable key={m.id} onPress={() => setMunicipalityId(m.id)} style={[estilos.opcao, municipalityId === m.id && estilos.opcaoAtiva]}><Text style={estilos.opcaoTexto}>{m.name}</Text></Pressable>)}</View>
      </> : null}
      <Botao titulo="✉️ Convidar" onPress={() => void invite()} />
      {msg ? <Texto suave>{msg}</Texto> : null}
    </Cartao>
    <Cartao>
      <Text style={estilos.cabecalhoCard}>🔗 Link de convite · operação em massa</Text>
      <Text style={estilos.rotulo}>Cargo</Text>
      <View style={estilos.opcoes}>{['tecnico_campo','estafeta'].map((r) => <Pressable key={r} onPress={() => setLinkRole(r)} style={[estilos.opcao, linkRole === r && estilos.opcaoAtiva]}><Text style={estilos.opcaoTexto}>{ROLE_LABELS[r]}</Text></Pressable>)}</View>
      <Campo rotulo="Máximo de usos" value={maxUses} onChangeText={setMaxUses} keyboardType="number-pad" />
      <Botao titulo="🔗 Gerar link" variante="secundario" onPress={() => void createLink()} />
      {links.slice(0, 10).map((l, i) => <Texto key={String(l.id ?? i)} suave>{l.role || '—'} · {l.used_count ?? 0}/{l.max_uses ?? '—'} · {l.expires_at ? new Date(l.expires_at).toLocaleDateString('pt-PT') : '—'}</Texto>)}
    </Cartao>

    <Cartao>
      <Text style={estilos.cabecalhoCard}>🪪 Identidades por validar (Staff KYC)</Text>
      {kyc.length === 0 ? <Texto suave>Não há identidades por rever.</Texto> : kyc.map((p: any) => (
        <View key={p.userId} style={estilos.item}>
          <Texto>{p.nome || p.email || p.userId}</Texto>
          <Texto suave>{p.email || '—'} · {p.telefone || 'sem telefone'}</Texto>
          <Botao titulo="Rever identidade" variante="secundario" onPress={() => router.push({ pathname: '/admin/[id]', params: { id: p.userId } })} />
        </View>
      ))}
    </Cartao>

    <Cartao>
      <Text style={estilos.cabecalhoCard}>👥 Utilizadores e cargos</Text>
      {staff.length === 0 ? <Texto suave>Sem utilizadores.</Texto> : staff.map((s, i) => <View key={String(s.id ?? i)} style={estilos.item}><Texto>{s.email || '—'}</Texto><Texto suave>{ROLE_LABELS[s.role] || s.role || '—'} · {s.sector || '—'}</Texto><Texto suave>{s.identity_status || '—'} · entrou via {s.onboarded_via || '—'}</Texto></View>)}
      <Botao titulo="Atualizar pessoas" variante="secundario" onPress={() => void load()} />
    </Cartao>
  </>;
}
function Dados({ onError }: { onError: (v: string | null) => void }) {
  const [resumo, setResumo] = useState<any>(null);
  const [codigo, setCodigo] = useState('');
  const [historico, setHistorico] = useState<any>(null);
  const [csv, setCsv] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try { setResumo(await chamarAdmin('dados_resumo')); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);

  const consultar = async () => {
    if (!codigo.trim()) return;
    try { setHistorico(await chamarEndpoint('address-history', { postal_code: codigo.trim() })); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  };

  const importar = async () => {
    if (!csv.trim()) { setMsg('Cola o CSV no campo acima.'); return; }
    try {
      const r = await chamarFuncao('imports', 'process_csv', { csv_text: csv });
      setMsg(`Concluído: ${r.valid ?? 0} válidas · ${r.invalid ?? 0} inválidas · ${r.duplicates ?? 0} duplicadas.`);
      setCsv('');
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const exportar = async (format: 'csv' | 'geojson') => {
    try {
      const r = await chamarEndpoint('exports', { format });
      setMsg(`${r.row_count ?? 0} moradas exportadas. A resposta está pronta para partilha.`);
      // Mantemos o conteúdo na app para não criar um ficheiro sem autorização explícita.
      Alert.alert(`Exportação ${format.toUpperCase()}`, String(r.content ?? '').slice(0, 4000));
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  };

  return <>
    <Cartao>
      <Text style={estilos.cabecalhoCard}>📊 Resumo do registo</Text>
      <Texto>{numero(resumo?.total)} moradas no total</Texto>
      <Texto suave>{Object.entries(resumo?.by_status ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'Sem dados de estado.'}</Texto>
      <Texto suave>{Object.entries(resumo?.by_province ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'Sem dados por província.'}</Texto>
    </Cartao>
    <Cartao>
      <Text style={estilos.cabecalhoCard}>🔎 Histórico de uma morada</Text>
      <Campo rotulo="Código postal" value={codigo} onChangeText={setCodigo} autoCapitalize="characters" placeholder="AO-HUA-..." />
      <Botao titulo="Consultar" variante="secundario" onPress={() => void consultar()} />
      {historico ? <Texto suave>{JSON.stringify(historico, null, 2)}</Texto> : null}
    </Cartao>
    <Cartao>
      <Text style={estilos.cabecalhoCard}>📥 Importar moradas (CSV)</Text>
      <Texto suave>O CSV deve conter latitude,longitude,house_number,reference. No Android, esta versão permite colar o conteúdo para evitar depender de um seletor de ficheiros.</Texto>
      <Campo rotulo="Conteúdo CSV" value={csv} onChangeText={setCsv} multiline numberOfLines={7} textAlignVertical="top" />
      <Botao titulo="📥 Processar CSV" variante="secundario" onPress={() => void importar()} />
      {msg ? <Texto suave>{msg}</Texto> : null}
    </Cartao>
    <Cartao>
      <Text style={estilos.cabecalhoCard}>📤 Exportar moradas</Text>
      <Botao titulo="Exportar CSV" variante="secundario" onPress={() => void exportar('csv')} />
      <Botao titulo="Exportar GeoJSON" variante="secundario" onPress={() => void exportar('geojson')} />
    </Cartao>
  </>;
}

function Financeiro({ onError }: { onError: (v: string | null) => void }) {
  const [zones, setZones] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const load = useCallback(async () => {
    try {
      const [z, l] = await Promise.all([
        restGet<any[]>('pricing_zones?select=*&order=zone_code.asc'),
        restGet<any[]>('usage_events?select=amount_total,amount_driver,amount_platform,is_free_pilot,event_type'),
      ]);
      setZones(z ?? []); setLedger(l ?? []);
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);

  const guardar = async (z: any) => {
    try {
      await chamarFuncao('pricing', 'admin_update_zone', { zone_code: z.zone_code, base_fee: Number(z.base_fee), routing_fee: Number(z.routing_fee), proof_fee: Number(z.proof_fee) });
      await load();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  };

  const real = ledger.filter((x) => !x.is_free_pilot);
  const total = real.reduce((s, x) => s + Number(x.amount_total || 0), 0);
  return <>
    <Cartao>
      <Text style={estilos.cabecalhoCard}>💰 Bandas de preço</Text>
      {zones.length === 0 ? <Texto suave>Sem zonas.</Texto> : zones.map((z, i) => (
        <View key={String(z.zone_code ?? i)} style={estilos.item}>
          <Texto>Zona {z.zone_code} — {z.name}</Texto>
          <Campo rotulo="Frete (Kz)" value={String(z.base_fee ?? '')} onChangeText={(v) => setZones((xs) => xs.map((x) => x.zone_code === z.zone_code ? { ...x, base_fee: v } : x))} keyboardType="decimal-pad" />
          <Campo rotulo="Roteamento (Kz)" value={String(z.routing_fee ?? '')} onChangeText={(v) => setZones((xs) => xs.map((x) => x.zone_code === z.zone_code ? { ...x, routing_fee: v } : x))} keyboardType="decimal-pad" />
          <Campo rotulo="Prova (Kz)" value={String(z.proof_fee ?? '')} onChangeText={(v) => setZones((xs) => xs.map((x) => x.zone_code === z.zone_code ? { ...x, proof_fee: v } : x))} keyboardType="decimal-pad" />
          <Botao titulo="Guardar zona" variante="secundario" onPress={() => void guardar(z)} />
        </View>
      ))}
    </Cartao>
    <Cartao>
      <Text style={estilos.cabecalhoCard}>📒 Livro-razão · usage_events</Text>
      <Texto>{ledger.length} eventos · {real.length} faturáveis · {total.toFixed(0)} Kz faturáveis</Texto>
      <Botao titulo="Atualizar financeiro" variante="secundario" onPress={() => void load()} />
    </Cartao>
  </>;
}

function Programadores({ onError }: { onError: (v: string | null) => void }) {
  const [keys, setKeys] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState('');

  const load = useCallback(async () => {
    try { const r = await chamarFuncao('api-keys', 'list'); setKeys(r.keys ?? []); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    try { const r = await chamarFuncao('api-keys', 'create', { name: name.trim() }); setNewKey(r.api_key ?? ''); setName(''); await load(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  };
  const revoke = (id: string) => Alert.alert('Revogar chave?', 'A chave deixa de funcionar imediatamente.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Revogar', style: 'destructive', onPress: async () => { try { await chamarFuncao('api-keys', 'revoke', { key_id: id }); await load(); } catch (e) { onError(e instanceof Error ? e.message : String(e)); } } },
  ]);

  return <>
    <Cartao>
      <Text style={estilos.cabecalhoCard}>💻 API para empresas</Text>
      <Texto suave>Base: https://qntbknegicaghnbnghyw.supabase.co/functions/v1/public-api</Texto>
      <Texto suave>POST /v1/address/verify · POST /v1/address/reverse · POST /v1/address/search · POST /v1/address/normalize</Texto>
      <Texto suave>POST /v1/territory/lookup · GET /v1/address/{'{codigo_postal}'} · POST /v1/delivery/create · GET /v1/delivery/{'{tracking_code}'}</Texto>
      <Texto suave>POST /v1/location/share</Texto>
      <Caixa tipo="info">Criação/aprovação de moradas continua fora da API pública e exige o fluxo de campo com revisão humana.</Caixa>
    </Cartao>
    <Cartao>
      <Text style={estilos.cabecalhoCard}>🔑 As tuas chaves de API</Text>
      <Campo rotulo="Nome da chave" value={name} onChangeText={setName} placeholder="Loja Online XPTO" />
      <Botao titulo="➕ Gerar nova chave" onPress={() => void create()} />
      {newKey ? <Caixa tipo="sucesso">Chave criada. Copia agora: {newKey}</Caixa> : null}
      {keys.map((k, i) => <View key={String(k.id ?? i)} style={estilos.item}>
        <Texto>{k.name} {k.revoked ? '(revogada)' : ''}</Texto>
        <Texto suave>{k.key_prefix} · {k.rate_limit_per_minute} pedidos/min</Texto>
        {!k.revoked ? <Botao titulo="Revogar" variante="perigo" onPress={() => revoke(k.id)} /> : null}
      </View>)}
    </Cartao>
  </>;
}

function Auditoria({ cargos, onError }: { cargos: string[]; onError: (v: string | null) => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const load = useCallback(async () => {
    try { const r = await chamarAdmin('audit'); setLogs(r.logs ?? []); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);
  const actions = useMemo(() => Array.from(new Set(logs.map((x) => x.action).filter(Boolean))), [logs]);
  const shown = filter ? logs.filter((x) => x.action === filter) : logs;

  const clearAll = () => Alert.alert('Eliminar toda a auditoria?', 'Esta operação é permanente.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar tudo', style: 'destructive', onPress: async () => {
      try { await chamarAdmin('clear_audit_logs', { confirm: 'ELIMINAR TUDO' }); await load(); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    }},
  ]);

  const removeOne = (id: string) => Alert.alert('Eliminar registo?', 'O registo será removido.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: async () => {
      try { await chamarAdmin('delete_audit_log', { log_id: id }); await load(); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    }},
  ]);

  return <>
    {cargos.includes('super_admin') ? <Botao titulo="🗑️ Eliminar toda a auditoria" variante="perigo" onPress={clearAll} /> : null}
    <Cartao>
      <Text style={estilos.cabecalhoCard}>Filtrar ação</Text>
      <View style={estilos.opcoes}>
        <Pressable onPress={() => setFilter('')} style={[estilos.opcao, !filter && estilos.opcaoAtiva]}><Text style={estilos.opcaoTexto}>Todas</Text></Pressable>
        {actions.map((a) => <Pressable key={a} onPress={() => setFilter(a)} style={[estilos.opcao, filter === a && estilos.opcaoAtiva]}><Text style={estilos.opcaoTexto}>{AUDIT_LABELS[a] || a}</Text></Pressable>)}
      </View>
    </Cartao>
    {shown.length === 0 ? <Texto suave>Sem registos de auditoria.</Texto> : shown.slice(0, 50).map((log, i) => (
      <Cartao key={String(log.id ?? i)}>
        <Texto>{AUDIT_LABELS[log.action] || log.action || '—'}</Texto>
        <Texto suave>{log.entity_type || '—'} · {log.created_at ? new Date(log.created_at).toLocaleString('pt-PT') : '—'}</Texto>
        {cargos.includes('super_admin') ? <Botao titulo="🗑️ Eliminar registo" variante="perigo" onPress={() => removeOne(log.id)} /> : null}
      </Cartao>
    ))}
    <Botao titulo="Atualizar auditoria" variante="secundario" onPress={() => void load()} />
  </>;
}

const estilos = StyleSheet.create({
  abas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  aba: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: CORES.borda, backgroundColor: CORES.fundoSuave },
  abaAtiva: { backgroundColor: CORES.primaria, borderColor: CORES.primaria },
  abaTexto: { color: CORES.texto, fontWeight: '700', fontSize: 13 },
  abaTextoAtiva: { color: CORES.sobrePrimaria },
  cabecalhoCard: { fontSize: TAMANHOS.subtitulo, fontWeight: '800', color: CORES.texto },
  secao: { fontSize: 21, fontWeight: '800', color: CORES.texto, marginTop: 8 },
  grid: { gap: 10 },
  statLabel: { fontSize: 15, fontWeight: '700', color: CORES.textoSuave },
  stat: { fontSize: 28, fontWeight: '800', color: CORES.texto },
  item: { borderTopWidth: 1, borderTopColor: CORES.borda, paddingTop: 10, gap: 5 },
  linhaBotoes: { flexDirection: 'row', gap: 8 },
  meia: { flex: 1 },
  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opcao: { borderWidth: 1, borderColor: CORES.borda, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: CORES.fundo },
  opcaoAtiva: { backgroundColor: CORES.infoFundo, borderColor: CORES.primaria },
  opcaoTexto: { color: CORES.texto, fontWeight: '700', fontSize: 13 },
  rotulo: { fontSize: 16, fontWeight: '700', color: CORES.texto, marginBottom: 6 },
});
