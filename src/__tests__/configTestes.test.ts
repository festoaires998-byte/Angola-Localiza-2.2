import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import { codigoPostalProvisorio, distanciaAoLimiteCelula } from '@/domain/enderecamento/codigoPostal';
import { encode } from '@/domain/enderecamento/plusCode';

const raiz = join(__dirname, '..', '..');
const ler = (f: string) => readFileSync(join(raiz, f), 'utf8');

describe('APK de teste (eas.json)', () => {
  test('o perfil preview gera o APK só para arm64-v8a', () => {
    const eas = JSON.parse(ler('eas.json'));
    expect(eas.build.preview.env.ORG_GRADLE_PROJECT_reactNativeArchitectures).toBe('arm64-v8a');
  });
});

describe('testes no emulador: o ponto do GPS falso bate com as contas da app', () => {
  const script = ler('.github/scripts/testes-emulador.sh');
  const lat = Number(script.match(/^LAT="([^"]+)"/m)![1]);
  const lng = Number(script.match(/^LNG="([^"]+)"/m)![1]);
  const fluxos = ['.maestro/03_mapa_com_rede.yaml', '.maestro/04_sem_rede.yaml'].map(ler).join('\n');

  test('fica a menos de 5 m do limite da célula (o aviso tem de aparecer)', () => {
    expect(distanciaAoLimiteCelula(lat, lng)).toBeLessThan(5);
    expect(distanciaAoLimiteCelula(lat, lng)).toBeGreaterThan(1);
  });

  test('o Plus Code e o código postal esperados pelos fluxos são os que a app calcula', () => {
    const plus = encode(lat, lng);
    expect(fluxos).toContain(plus.replace('+', '\\\\+'));
    const [, grelha, controlo] = codigoPostalProvisorio(lat, lng, 'Huambo').codigo.match(/^AO-HUA-(\w{8})-(\d{2})$/)!;
    expect(fluxos).toContain(`AO-HUA-${grelha}(-[0-9]+)?-${controlo}`);
  });
});
