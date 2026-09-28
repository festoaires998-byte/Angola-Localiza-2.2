const CENTRO_HUAMBO = { latitude: REGIAO_HUAMBO.centro[1], longitude: REGIAO_HUAMBO.centro[0] };

export default function Mapa() {
  const [configPais, setConfigPais] = useState(CONFIG_AO_OFFLINE_TESTE);
  const [codigoPais, setCodigoPais] = useState(paisAtual());
  useEffect(() => { let ativo = true; void obterConfigPais(codigoPais).then((config) => { if (ativo) setConfigPais(config); }).catch(() => undefined); return () => { ativo = false; }; }, [codigoPais]);
  const rotulos = useMemo(() => rotulosMapa(configPais), [configPais]);
  const router = useRouter();
  const sessao = useSessao();
  const userId = sessao.utilizador?.id ?? null;
  const temMoradas = sessao.acesso.separadores.includes('guardados');
  const online = useOnline();
  const gps = usePosicao();
  const estadoMapa = useMapaOffline(online, codigoPais);
  const gestorMapa = criarMapaDoPais(codigoPais);
  const nomePais = configPais.country_name || 'Angola';

  const aoVivo = gps.estado === 'ok' ? gps.posicao : null;
  // O ponto azul segue o GPS ao vivo; o código usa a posição medida (média de várias leituras).
  const medida = useCapturaGps(aoVivo);
  const captura = medida.captura;
  const posicao = captura ?? aoVivo ?? (gps.estado === 'a_procurar' ? gps.ultima : null);
  // Com mais de ±10 m o código fica provisório (não se pede a confirmação ao servidor).
  const info = useInfoLocal(captura, online, !captura?.fraca);
  const origem = origemDoMapa(gestorMapa, estadoMapa, online);
  const chaveOrigem = origem ? `${origem.tiles}|${origem.fontes}` : null;
  // O estilo só muda quando a origem muda (evita recarregar o mapa a cada posição).
  const estiloBase = useMemo(() => codigoPais === 'AO' ? (origem ? criarEstilo(origem) : null) : (online ? criarEstiloOnlineOSM() : null), [codigoPais, online, chaveOrigem]);
  const estiloSatelite = useMemo(() => criarEstiloSatelite(), []);
  const semPermissao = gps.estado === 'sem_permissao' || gps.estado === 'gps_desligado';