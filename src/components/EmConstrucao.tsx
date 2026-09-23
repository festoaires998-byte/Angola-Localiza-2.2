import type { Separador } from '@/domain/organizacao/cargos';

import { Icone } from './Icone';
import { NOMES_SEPARADORES } from './nomes';
import { CORES } from './tema';
import { Ecra, Texto, Titulo } from './ui';

/** Separador que ainda não foi feito. */
export function EmConstrucao({ separador }: { separador: Separador }) {
  return (
    <Ecra centrado>
      <Icone nome={separador} cor={CORES.primaria} tamanho={64} />
      <Titulo>{NOMES_SEPARADORES[separador]}</Titulo>
      <Texto>Em construção.</Texto>
      <Texto suave>Esta parte da app ainda está a ser feita. Vai aparecer numa próxima versão.</Texto>
    </Ecra>
  );
}
