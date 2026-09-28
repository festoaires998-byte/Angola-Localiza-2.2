/** Web: tarefas de background nativas não são registadas no navegador. */
export const TAREFA_SYNC = 'angola-localiza-sync';
export const INTERVALO_MINUTOS = 15;
export async function registarTarefaSync(): Promise<boolean> { return false; }
export async function anularTarefaSync(): Promise<void> {}
