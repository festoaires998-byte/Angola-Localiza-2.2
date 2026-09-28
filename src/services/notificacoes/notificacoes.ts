import { supabase } from '@/api/supabase';

export interface Notificacao {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export async function listarNotificacoes(limit = 50): Promise<Notificacao[]> {
  const { data: sessaoAtual, error: erroSessao } = await supabase.auth.getSession();
  if (erroSessao) throw erroSessao;
  const userId = sessaoAtual.session?.user.id;
  if (!userId) return [];
  const { data, error } = await supabase.from('notifications')
    .select('id,user_id,title,body,entity_type,entity_id,read_at,created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as Notificacao[];
}

export async function marcarNotificacaoComoLida(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function marcarTodasNotificacoesComoLidas(): Promise<void> {
  const { data: sessaoAtual, error: erroSessao } = await supabase.auth.getSession();
  if (erroSessao) throw erroSessao;
  const userId = sessaoAtual.session?.user.id;
  if (!userId) return;
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('user_id', userId).is('read_at', null);
  if (error) throw error;
}
