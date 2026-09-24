import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..', '..');
const ler = (f: string) => readFileSync(join(raiz, f), 'utf8');

describe('APK de teste (eas.json)', () => {
  test('o perfil preview gera o APK só para arm64-v8a', () => {
    const eas = JSON.parse(ler('eas.json'));
    expect(eas.build.preview.env.ORG_GRADLE_PROJECT_reactNativeArchitectures).toBe('arm64-v8a');
  });
});
