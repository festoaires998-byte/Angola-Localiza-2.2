import type { BaseDados } from '../tipos';

export interface Migracao {
  /** Número da versão a que a base fica depois desta migração (1, 2, 3, ...). */
  versao: number;
  /** Nome curto, só para mensagens de erro. */
  nome: string;
  /** Faz as alterações. Recebe a transação: usar sempre o `tx`. */
  aplicar(tx: BaseDados): Promise<void>;
}
