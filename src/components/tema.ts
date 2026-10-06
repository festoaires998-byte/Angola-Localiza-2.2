/**
 * Cores e tamanhos da app. Pensados para usar ao sol e com uma mão:
 * texto escuro sobre fundo claro (contraste alto), letra grande e botões
 * com pelo menos 56 px de altura.
 *
 * Paleta "Verde e sol" (escolhida pelo dono a 06/10/2026): verde escuro para
 * as ações e amarelo-sol para os destaques. Todo o texto tem contraste de
 * pelo menos 4,5:1 com o fundo onde aparece (testado em tema.test.ts).
 */
export const CORES = {
  /** Fundo dos cartões, campos e botões de contorno. */
  fundo: '#FFFFFF',
  /** Fundo do ecrã (levemente verde, para os cartões brancos se destacarem). */
  fundoEcra: '#F4F8F5',
  fundoSuave: '#EEF3EF',
  texto: '#111111',
  textoSuave: '#3D3D3D',
  /** Borda dos campos de texto (precisa de se ver bem). */
  borda: '#8A8F98',
  /** Borda dos cartões (só separa). */
  bordaCartao: '#D5E3DB',
  primaria: '#0B5D45',
  sobrePrimaria: '#FFFFFF',
  /** Amarelo-sol: destaques (nunca texto sobre branco). */
  destaque: '#F6B800',
  /** Fundo do separador ativo na barra de baixo. */
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
} as const;

/** Cores das "pastilhas" dos ícones das secções: [cor do ícone, fundo]. */
export const PASTILHAS = {
  verde: ['#0B5D45', '#E3F2EA'],
  ambar: ['#8A4B00', '#FFF3D6'],
  azul: ['#0B4F9C', '#E3EEFB'],
  roxo: ['#5B2C91', '#F1E9FB'],
  vermelho: ['#A30016', '#FDE7EA'],
} as const;

export type CorPastilha = keyof typeof PASTILHAS;

export const TAMANHOS = {
  texto: 18,
  textoPequeno: 16,
  titulo: 26,
  subtitulo: 20,
  alturaBotao: 56,
  margem: 20,
  raio: 12,
} as const;

/** Barra de cima dos ecrãs com "voltar": verde, letra branca (como a faixa dos títulos). */
export const CABECALHO = {
  headerStyle: { backgroundColor: CORES.primaria },
  headerTintColor: CORES.sobrePrimaria,
  headerTitleStyle: { color: CORES.sobrePrimaria, fontWeight: '800' },
  headerShadowVisible: false,
} as const;
