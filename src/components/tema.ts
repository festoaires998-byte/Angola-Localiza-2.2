/**
 * Cores e tamanhos da app. Pensados para usar ao sol e com uma mão:
 * texto escuro sobre fundo branco (contraste alto), letra grande e botões
 * com pelo menos 56 px de altura.
 */
export const CORES = {
  fundo: '#FFFFFF',
  fundoSuave: '#F2F4F7',
  texto: '#111111',
  textoSuave: '#3D3D3D',
  borda: '#8A8F98',
  primaria: '#0B4F9C',
  sobrePrimaria: '#FFFFFF',
  perigo: '#A30016',
  sucesso: '#1B5E20',
  avisoFundo: '#FFF1C2',
  avisoBorda: '#8A6100',
  avisoTexto: '#3D2B00',
  erroFundo: '#FDE7EA',
  infoFundo: '#E3EEFB',
  inativo: '#5F6368',
} as const;

export const TAMANHOS = {
  texto: 18,
  textoPequeno: 16,
  titulo: 26,
  subtitulo: 20,
  alturaBotao: 56,
  margem: 20,
  raio: 12,
} as const;
