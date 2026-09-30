/**
 * @jest-environment node
 */
// A Edge Function "chat" (v5): anexos privados, com links temporários.
import { describe, expect, jest, test } from '@jest/globals';

import { anexoParaGuardar, nomeNoBucketChat } from '../../supabase/functions/chat/regras';
import { carregarFuncao, criarSupabaseFalso, pedir, URL_SUPABASE_FALSO } from '@/testes/supabaseFalso';

jest.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}), { virtual: true });
jest.mock(
  'jsr:@supabase/supabase-js@2',
  () => ({ createClient: () => (globalThis as any).__supabaseFalso.cliente }),
  { virtual: true },
);

const handler = carregarFuncao(() => {
  jest.isolateModules(() => {
    require('../../supabase/functions/chat/index.ts');
  });
});

const REMETENTE = 'aaaaaaaa-0000-4000-8000-000000000001';
const ESTAFETA = 'aaaaaaaa-0000-4000-8000-000000000002';
const ENTREGA = 'cccccccc-0000-4000-8000-000000000001';

function cenario(mensagens: any[] = []) {
  const s = criarSupabaseFalso({
    sessoes: { remetente: REMETENTE, estafeta: ESTAFETA },
    tabelas: {
      organization_members: [],
      deliveries: [{ id: ENTREGA, created_by: REMETENTE, assigned_driver: ESTAFETA, tracking_code: 'ABC123' }],
      chat_messages: mensagens,
    },
  });
  (globalThis as any).__supabaseFalso = s;
  return s;
}

describe('chat: regras dos anexos', () => {
  test('só ficheiros do bucket chat-media deste projeto', () => {
    expect(nomeNoBucketChat(`chat-media/${REMETENTE}/f.jpg`, URL_SUPABASE_FALSO)).toBe(`${REMETENTE}/f.jpg`);
    expect(nomeNoBucketChat(`${URL_SUPABASE_FALSO}/storage/v1/object/public/chat-media/chat-1.jpg`, URL_SUPABASE_FALSO)).toBe('chat-1.jpg');
    expect(nomeNoBucketChat('https://mau.exemplo/x.jpg', URL_SUPABASE_FALSO)).toBeNull();
    expect(nomeNoBucketChat('chat-media/../kyc-artifacts/x.jpg', URL_SUPABASE_FALSO)).toBeNull();
    expect(nomeNoBucketChat('javascript:alert(1)', URL_SUPABASE_FALSO)).toBeNull();
  });

  test('ao enviar, o anexo tem de estar na pasta de quem envia', () => {
    expect(anexoParaGuardar(`chat-media/${REMETENTE}/f.jpg`, URL_SUPABASE_FALSO, REMETENTE)).toEqual({ ok: true, texto: `chat-media/${REMETENTE}/f.jpg` });
    expect(anexoParaGuardar(`chat-media/${ESTAFETA}/f.jpg`, URL_SUPABASE_FALSO, REMETENTE).ok).toBe(false);
    expect(anexoParaGuardar('chat-media/chat-1.jpg', URL_SUPABASE_FALSO, REMETENTE).ok).toBe(false);
  });
});

describe('chat: enviar e ler', () => {
  test('envia com anexo na própria pasta; recusa anexos de fora', async () => {
    const s = cenario();
    const base = { conversation_type: 'DELIVERY', conversation_key: ENTREGA, message_body: 'Olá' };
    expect((await pedir(handler, 'send', { ...base, media_url: 'https://mau.exemplo/x.jpg', media_type: 'image' }, 'remetente')).status).toBe(422);
    const ok = await pedir(handler, 'send', { ...base, media_url: `${URL_SUPABASE_FALSO}/storage/v1/object/chat-media/${REMETENTE}/f.jpg`, media_type: 'image' }, 'remetente');
    expect(ok.status).toBe(200);
    expect(s.tabelas().chat_messages[0]).toMatchObject({ media_url: `chat-media/${REMETENTE}/f.jpg`, media_type: 'image', sender_id: REMETENTE });
  });

  test('ao ler, cada anexo do chat vem com um link temporário; links de fora não aparecem', async () => {
    const s = cenario([
      { id: 'm1', conversation_type: 'DELIVERY', conversation_key: ENTREGA, sender_id: REMETENTE, body: null, media_url: `chat-media/${REMETENTE}/f.jpg`, media_type: 'image', created_at: '1' },
      { id: 'm2', conversation_type: 'DELIVERY', conversation_key: ENTREGA, sender_id: ESTAFETA, body: 'x', media_url: `${URL_SUPABASE_FALSO}/storage/v1/object/public/chat-media/chat-1.jpg`, media_type: 'image', created_at: '2' },
      { id: 'm3', conversation_type: 'DELIVERY', conversation_key: ENTREGA, sender_id: ESTAFETA, body: 'y', media_url: 'https://mau.exemplo/x.jpg', media_type: 'image', created_at: '3' },
    ]);
    const r = await pedir(handler, 'list', { conversation_type: 'DELIVERY', conversation_key: ENTREGA }, 'estafeta');
    expect(r.json.messages.map((m: any) => m.media_url)).toEqual([
      `https://assinado/chat-media/${REMETENTE}/f.jpg?s=3600`,
      'https://assinado/chat-media/chat-1.jpg?s=3600',
      null,
    ]);
    expect(r.json.messages[2].media_type).toBeNull();
    expect(s.linksPedidos).toHaveLength(2);
  });
});
