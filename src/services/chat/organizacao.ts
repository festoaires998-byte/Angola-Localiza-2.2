import { chamarFuncao } from '@/api/edge/chamarFuncao';

export type CanalOrganizacao = {
  conversation_type: string;
  conversation_key: string;
  titulo: string;
};

export type MensagemChat = {
  id: string;
  body: string | null;
  created_at: string;
  sender_email: string | null;
  sou_eu: boolean;
  is_announcement?: boolean;
};

export async function listarCanaisOrganizacao(): Promise<CanalOrganizacao[]> {
  const r = await chamarFuncao<{ canais?: CanalOrganizacao[] }>('chat', 'list_my_channels');
  return Array.isArray(r?.canais) ? r.canais : [];
}

export async function listarMensagensChat(conversation_type: string, conversation_key: string): Promise<{ messages: MensagemChat[]; pode_escrever: boolean; pode_comunicado: boolean }> {
  const r = await chamarFuncao<{ messages?: MensagemChat[]; pode_escrever?: boolean; pode_comunicado?: boolean }>('chat', 'list', {
    body: { conversation_type, conversation_key },
  });
  return {
    messages: Array.isArray(r?.messages) ? r.messages : [],
    pode_escrever: r?.pode_escrever !== false,
    pode_comunicado: r?.pode_comunicado === true,
  };
}

export async function enviarMensagemChat(conversation_type: string, conversation_key: string, message_body: string, is_announcement = false): Promise<void> {
  await chamarFuncao('chat', 'send', {
    body: { conversation_type, conversation_key, message_body, is_announcement, media_url: null, media_type: null },
  });
}
