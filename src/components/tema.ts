/**
 * Cores, letra e tamanhos da app. Pensados para usar ao sol e com uma mão:
 * contraste alto, letra grande e botões com pelo menos 56 px de altura.
 *
 * Paleta "Verde e sol" (escolhida pelo dono a 06/10/2026), em versão clara e
 * escura. Todo o texto tem contraste de pelo menos 4,5:1 com o fundo onde
 * aparece, nos dois modos (testado em tema.test.ts).
 *
 * Os ecrãs não leem estas paletas diretamente: usam useCores() e
 * useEstilos() (em temaApp.tsx), que escolhem a paleta do modo atual.
 */

export interface Cores {
  /** Fundo dos cartões, campos e botões de contorno. */
  fundo: string;
  /** Fundo do ecrã (por trás dos cartões). */
  fundoEcra: string;
  fundoSuave: string;
  texto: string;
  textoSuave: string;
  /** Borda dos campos de texto (precisa de se ver bem). */
  borda: string;
  /** Borda dos cartões (só separa). */
  bordaCartao: string;
  primaria: string;
  sobrePrimaria: string;
  /** Faixa dos títulos e barra de cima: verde escuro nos dois modos. */
  faixa: string;
  sobreFaixa: string;
  /** Amarelo-sol: destaques (nunca texto sobre fundo claro). */
  destaque: string;
  sobreDestaque: string;
  /** Fundo do separador ativo na barra de baixo. */
  destaqueFundo: string;
  perigo: string;
  sucesso: string;
  avisoFundo: string;
  avisoBorda: string;
  avisoTexto: string;
  erroFundo: string;
  infoFundo: string;
  sucessoFundo: string;
  inativo: string;
  /** Cor da sombra dos cartões (no escuro quase não se vê; a borda separa). */
  sombra: string;
}

export const CORES_CLARO: Cores = {
  fundo: '#FFFFFF',
  fundoEcra: '#F4F8F5',
  fundoSuave: '#EEF3EF',
  texto: '#111111',
  textoSuave: '#3D3D3D',
  borda: '#8A8F98',
  bordaCartao: '#E1EBE5',
  primaria: '#0B5D45',
  sobrePrimaria: '#FFFFFF',
  faixa: '#0B5D45',
  sobreFaixa: '#FFFFFF',
  destaque: '#F6B800',
  sobreDestaque: '#111111',
  destaqueFundo: '#FFE9A8',
  perigo: '#A30016',
  sucesso: '#1B5E20',
  avisoFundo: '#FFF1C2',
  avisoBorda: '#8A6100',
  avisoTexto: '#3D2B00',
  erroFundo: '#FDE7EA',
  infoFundo: '#E3F2EA',
  sucessoFundo: '#E6F4EA',
  inativo: '#5F6368',
  sombra: '#0B281E',
};

export const CORES_ESCURO: Cores = {
  fundo: '#17211C',
  fundoEcra: '#0E1512',
  fundoSuave: '#1D2924',
  texto: '#ECF2EE',
  textoSuave: '#B4C2BA',
  borda: '#7D8A83',
  bordaCartao: '#26342D',
  primaria: '#63D3A8',
  sobrePrimaria: '#06231A',
  faixa: '#0B5D45',
  sobreFaixa: '#FFFFFF',
  destaque: '#F6B800',
  sobreDestaque: '#111111',
  destaqueFundo: '#3A2E0B',
  perigo: '#FF8A80',
  sucesso: '#7FD38A',
  avisoFundo: '#3A2E0B',
  avisoBorda: '#C99A2E',
  avisoTexto: '#FFE3A3',
  erroFundo: '#3A1418',
  infoFundo: '#13342A',
  sucessoFundo: '#163020',
  inativo: '#9AA6A0',
  sombra: '#000000',
};

/** Cores das "pastilhas" dos ícones das secções: [cor do ícone, fundo]. */
export type CorPastilha = 'verde' | 'ambar' | 'azul' | 'roxo' | 'vermelho';
export type Pastilhas = Record<CorPastilha, readonly [string, string]>;

export const PASTILHAS_CLARO: Pastilhas = {
  verde: ['#0B5D45', '#E3F2EA'],
  ambar: ['#8A4B00', '#FFF3D6'],
  azul: ['#0B4F9C', '#E3EEFB'],
  roxo: ['#5B2C91', '#F1E9FB'],
  vermelho: ['#A30016', '#FDE7EA'],
};

export const PASTILHAS_ESCURO: Pastilhas = {
  verde: ['#7FDDB8', '#16352A'],
  ambar: ['#FFC766', '#3A2A0B'],
  azul: ['#8CB8F5', '#14263D'],
  roxo: ['#C7A6F2', '#2A1B3D'],
  vermelho: ['#FF9A93', '#3D1517'],
};

export type Esquema = 'claro' | 'escuro';

export const PALETAS: Record<Esquema, { cores: Cores; pastilhas: Pastilhas }> = {
  claro: { cores: CORES_CLARO, pastilhas: PASTILHAS_CLARO },
  escuro: { cores: CORES_ESCURO, pastilhas: PASTILHAS_ESCURO },
};

/**
 * Letra da app (Plus Jakarta Sans, guardada dentro da app: funciona sem rede).
 * Cada peso é um ficheiro; o fontWeight dos estilos escolhe o ficheiro.
 */
export const FONTES = {
  normal: 'PlusJakartaSans_400Regular',
  media: 'PlusJakartaSans_500Medium',
  semi: 'PlusJakartaSans_600SemiBold',
  negrito: 'PlusJakartaSans_700Bold',
  extra: 'PlusJakartaSans_800ExtraBold',
} as const;

/** O ficheiro de letra para um fontWeight do React Native. */
export function fonteDoPeso(peso: string | number | undefined): string {
  switch (String(peso ?? '400')) {
    case '500': return FONTES.media;
    case '600': return FONTES.semi;
    case '700': case 'bold': return FONTES.negrito;
    case '800': case '900': return FONTES.extra;
    default: return FONTES.normal;
  }
}

export const TAMANHOS = {
  texto: 18,
  textoPequeno: 16,
  titulo: 26,
  subtitulo: 20,
  alturaBotao: 56,
  margem: 20,
  raio: 16,
  raioCartao: 20,
} as const;

/** Barra de cima dos ecrãs com "voltar": verde, letra branca (como a faixa dos títulos). */
export function cabecalho(cores: Cores) {
  return {
    headerStyle: { backgroundColor: cores.faixa },
    headerTintColor: cores.sobreFaixa,
    headerTitleStyle: { color: cores.sobreFaixa, fontFamily: FONTES.extra },
    headerShadowVisible: false,
  } as const;
}

/** Sombra suave dos cartões (Android usa elevation; iOS e web usam shadow*). */
export function sombraCartao(cores: Cores) {
  return {
    shadowColor: cores.sombra,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  } as const;
}
