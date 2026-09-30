// Fotos do Campo (field-service v22): bucket privado, pasta de quem submete.
import { describe, expect, test } from '@jest/globals';

import { fotoParaGuardar, nomeNoBucketFotos } from '../../supabase/functions/field-service/fotos';

const URL = 'https://projeto.supabase.co';
const EU = 'aaaaaaaa-0000-4000-8000-000000000001';
const OUTRO = 'aaaaaaaa-0000-4000-8000-000000000002';

describe('field-service v22: fotos', () => {
  test('lê o caminho ou um URL do Storage deste projeto', () => {
    expect(nomeNoBucketFotos(`field-photos/${EU}/a.jpg`, URL)).toBe(`${EU}/a.jpg`);
    expect(nomeNoBucketFotos(`${URL}/storage/v1/object/public/field-photos/${EU}/a.jpg`, URL)).toBe(`${EU}/a.jpg`);
    expect(nomeNoBucketFotos(`${URL}/storage/v1/object/sign/field-photos/${EU}/a.jpg?token=x`, URL)).toBe(`${EU}/a.jpg`);
    expect(nomeNoBucketFotos('https://outro.site/field-photos/a.jpg', URL)).toBeNull();
    expect(nomeNoBucketFotos('field-photos/../kyc-artifacts/a.jpg', URL)).toBeNull();
    expect(nomeNoBucketFotos(null, URL)).toBeNull();
  });

  test('ao submeter: só fotos na pasta de quem submete; guarda o caminho', () => {
    expect(fotoParaGuardar(`${URL}/storage/v1/object/field-photos/${EU}/a.jpg`, URL, EU)).toBe(`field-photos/${EU}/a.jpg`);
    expect(fotoParaGuardar(`field-photos/${OUTRO}/a.jpg`, URL, EU)).toBeNull();
    expect(fotoParaGuardar('field-photos/registo-cidadao-1.jpg', URL, EU)).toBeNull();
    expect(fotoParaGuardar(`field-photos/users/${EU}/a.jpg`, URL, EU)).toBeNull();
  });
});
