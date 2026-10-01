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

describe('Publicação na Google Play (eas.json)', () => {
  const eas = JSON.parse(ler('eas.json'));

  test('os perfis que geram uma app para instalar têm o Supabase (sem ele a app não liga ao servidor)', () => {
    for (const perfil of ['preview', 'production']) {
      const env = eas.build[perfil].env ?? {};
      expect(env.EXPO_PUBLIC_SUPABASE_URL).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/);
      expect(env.EXPO_PUBLIC_SUPABASE_ANON_KEY).toBeTruthy();
    }
    expect(eas.build.production.env).toEqual({
      EXPO_PUBLIC_SUPABASE_URL: eas.build.preview.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: eas.build.preview.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    });
  });

  test('production gera o pacote da loja (AAB) para todos os telemóveis, com o número da versão a subir sozinho', () => {
    expect(eas.build.production.android.buildType).toBe('app-bundle');
    expect(eas.build.production.env.ORG_GRADLE_PROJECT_reactNativeArchitectures).toBeUndefined();
    expect(eas.build.production.autoIncrement).toBe(true);
  });
});

describe('Permissões (app.json)', () => {
  const app = JSON.parse(ler('app.json')).expo;

  test('sem localização em segundo plano: a app só lê a posição com o ecrã aberto (a Google Play exige justificar e um vídeo)', () => {
    expect(app.android.permissions).not.toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
    expect(app.android.blockedPermissions).toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
    const [, local] = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-location');
    expect(local).toMatchObject({
      isAndroidBackgroundLocationEnabled: false,
      isIosBackgroundLocationEnabled: false,
      isAndroidForegroundServiceEnabled: false,
    });
    expect(local.locationAlwaysPermission).toBeUndefined();
    expect(local.locationAlwaysAndWhenInUsePermission).toBeUndefined();
    expect(local.locationWhenInUsePermission).toMatch(/localização/);
  });

  test('nenhum ficheiro da app pede a localização em segundo plano', () => {
    const { execSync } = require('child_process') as typeof import('child_process');
    const usos = execSync(
      "grep -rlE 'requestBackgroundPermissionsAsync|startLocationUpdatesAsync' src --include=*.ts --include=*.tsx --exclude-dir=__tests__ --exclude='*.test.*' || true",
      { cwd: raiz, encoding: 'utf8' },
    ).trim();
    expect(usos).toBe('');
  });
});
