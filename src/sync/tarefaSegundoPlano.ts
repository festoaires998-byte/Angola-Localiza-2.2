import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { sincronizar } from './motorSync';

/** Nome da tarefa no expo-task-manager. */
export const TAREFA_SYNC = 'angola-localiza-sync';

/**
 * Intervalo pedido ao sistema, em minutos. É só um mínimo: o Android e o iOS
 * decidem quando a tarefa corre de facto (nunca menos de ~15 minutos; no iOS
 * pode ser bem mais, muitas vezes à noite e com o telemóvel a carregar).
 */
export const INTERVALO_MINUTOS = 15;

/**
 * A definição da tarefa tem de ser feita quando este ficheiro é carregado
 * (fora de qualquer componente), para existir também quando o sistema acorda
 * a app em segundo plano sem abrir ecrãs.
 */
TaskManager.defineTask(TAREFA_SYNC, async () => {
  try {
    const r = await sincronizar();
    return r.motivo === 'erro_rede' || r.motivo === 'erro_servidor'
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Pede ao sistema para correr a sincronização de vez em quando. */
export async function registarTarefaSync(): Promise<boolean> {
  const estado = await BackgroundTask.getStatusAsync();
  if (estado !== BackgroundTask.BackgroundTaskStatus.Available) return false;
  if (!(await TaskManager.isTaskRegisteredAsync(TAREFA_SYNC))) {
    await BackgroundTask.registerTaskAsync(TAREFA_SYNC, { minimumInterval: INTERVALO_MINUTOS });
  }
  return true;
}

/** Deixa de pedir a sincronização em segundo plano. */
export async function anularTarefaSync(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(TAREFA_SYNC)) {
    await BackgroundTask.unregisterTaskAsync(TAREFA_SYNC);
  }
}
