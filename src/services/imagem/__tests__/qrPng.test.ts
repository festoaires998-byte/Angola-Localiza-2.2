import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockEscritas: { nome: string; conteudo: string; opcoes: unknown }[] = [];
const mockApagados: string[] = [];
const mockExistentes = new Set<string>();
jest.mock('expo-file-system', () => {
  class Directory {
    nome: string;
    constructor(_base: string, nome: string) {
      this.nome = nome;
    }
    create() {}
  }
  class File {
    uri: string;
    nome: string;
    constructor(pasta: { nome: string }, nome: string) {
      this.nome = nome;
      this.uri = `file:///cache/${pasta.nome}/${nome}`;
    }
    get exists() {
      return mockExistentes.has(this.nome);
    }
    delete() {
      mockApagados.push(this.nome);
    }
    create() {}
    write(conteudo: string, opcoes: unknown) {
      mockEscritas.push({ nome: this.nome, conteudo, opcoes });
    }
  }
  return { Directory, File, Paths: { cache: 'cache' } };
});

let mockDisponivel = true;
const mockPartilhar = jest.fn(async (_uri: string, _o: unknown) => undefined);
jest.mock('expo-sharing', () => ({
  isAvailableAsync: async () => mockDisponivel,
  shareAsync: (uri: string, o: unknown) => mockPartilhar(uri, o),
}));

const { partilharQrPng } = require('../qrPng') as typeof import('../qrPng');

beforeEach(() => {
  mockEscritas.length = 0;
  mockApagados.length = 0;
  mockExistentes.clear();
  mockDisponivel = true;
  mockPartilhar.mockClear();
});

describe('partilharQrPng', () => {
  test('grava o PNG (base64) na pasta temporária e abre a janela de partilha', async () => {
    await partilharQrPng('iVBORw0KGgo=', 'codigo.png');
    expect(mockEscritas).toEqual([{ nome: 'codigo.png', conteudo: 'iVBORw0KGgo=', opcoes: { encoding: 'base64' } }]);
    expect(mockPartilhar).toHaveBeenCalledWith('file:///cache/qr/codigo.png', {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle: 'Guardar o QR Code',
    });
  });

  test('substitui a imagem anterior com o mesmo nome', async () => {
    mockExistentes.add('codigo.png');
    await partilharQrPng('AAAA', 'codigo.png');
    expect(mockApagados).toEqual(['codigo.png']);
  });

  test('sem partilha no telemóvel: explica, sem gravar nada', async () => {
    mockDisponivel = false;
    await expect(partilharQrPng('AAAA', 'codigo.png')).rejects.toThrow('Este telemóvel não deixa guardar nem partilhar a imagem.');
    expect(mockEscritas).toEqual([]);
  });
});
