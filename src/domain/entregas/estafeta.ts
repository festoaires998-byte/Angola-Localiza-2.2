/**
 * Separador Entregas (estafeta): etapas, prova de entrega (POD) e falha.
 * Regras puras (sem rede nem base de dados). O servidor (deliveries v19)
 * volta a validar tudo: etapas, PIN (5 tentativas), foto e assinatura desenhada.
 */

/** O passo seguinte de cada estado, para o botão grande do estafeta. */
export interface Passo {
  novo: 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY';
  titulo: string;
  /** A recolha exige uma foto (com marca de água). */
  precisaFoto: boolean;
}

const PASSOS: Record<string, Passo> = {
  ASSIGNED: { novo: 'PICKED_UP', titulo: 'Recolhi a encomenda', precisaFoto: true },
  PICKED_UP: { novo: 'IN_TRANSIT', titulo: 'Estou a caminho', precisaFoto: false },
  IN_TRANSIT: { novo: 'OUT_FOR_DELIVERY', titulo: 'Cheguei à zona de entrega', precisaFoto: false },
};

/** Passo simples seguinte (null quando o que falta é a prova de entrega ou já acabou). */
export function proximoPasso(estado: string | null): Passo | null {
  return PASSOS[estado ?? ''] ?? null;
}

/** Só em "Saiu para entrega" se pode entregar (com a prova) ou dizer que não foi possível. */
export function podeFechar(estado: string | null): boolean {
  return estado === 'OUT_FOR_DELIVERY';
}

/** Motivos de falha aceites pelo servidor, em palavras simples. */
export const MOTIVOS_FALHA = [
  { valor: 'destinatario_ausente', nome: 'Ninguém para receber' },
  { valor: 'morada_nao_encontrada', nome: 'Não encontrei a morada' },
  { valor: 'recusa', nome: 'Recusaram a encomenda' },
  { valor: 'codigo_incorreto', nome: 'O PIN não estava certo' },
  { valor: 'outro', nome: 'Outro motivo' },
] as const;
export type MotivoFalha = (typeof MOTIVOS_FALHA)[number]['valor'];

/** Ficheiro já guardado no telemóvel (marcador "offline:<id>" para a fila). */
export interface FicheiroProva {
  marcador: string;
  sha256: string;
  uri: string;
}

/** Posição do GPS no momento da prova. */
export interface LocalProva {
  latitude: number;
  longitude: number;
  plusCode: string;
}

/** O que o estafeta recolhe para fechar a entrega (decisão C: PIN, foto e assinatura). */
export interface DadosPod {
  pin: string;
  foto: FicheiroProva | null;
  assinatura: FicheiroProva | null;
  local: LocalProva | null;
  observacao: string;
  volumoso: boolean;
  esperaLonga: boolean;
}

/** O que falta para poder confirmar a entrega. Vazio = pode confirmar. */
export function faltaNaPod(d: DadosPod): string[] {
  const falta: string[] = [];
  if (!d.local) falta.push('Esperar pela posição do GPS.');
  if (!d.foto) falta.push('Tirar a foto da entrega.');
  if (!d.assinatura) falta.push('Pedir a quem recebe para assinar com o dedo.');
  if (!/^\d{4}$/.test(d.pin.trim())) falta.push('Escrever o PIN de 4 algarismos que quem recebe te dá.');
  return falta;
}

/** Campos da assinatura criptográfica do aparelho (ver paraCamposProva). */
export interface CamposCripto {
  crypto_payload: string;
  crypto_signature: string;
  crypto_algorithm: string;
  crypto_device_id: string;
}

/**
 * Payload da operação "delivery_proof" (→ deliveries?action=update_status) para fechar a entrega.
 * As fotos vão como marcadores "offline:<id>": o motor troca-os pelos URLs no envio.
 * A latitude e a longitude são as mesmas da mensagem assinada (o servidor compara).
 */
export function payloadPod(deliveryId: string, d: DadosPod, cripto: CamposCripto | null) {
  const falta = faltaNaPod(d);
  if (falta.length > 0) throw new Error(falta[0]);
  const observacao = d.observacao.trim();
  return {
    delivery_id: deliveryId,
    new_status: 'DELIVERED' as const,
    pin: d.pin.trim(),
    is_volumoso: d.volumoso,
    is_espera_longa: d.esperaLonga,
    proof: {
      photo_url: d.foto!.marcador,
      signature_url: d.assinatura!.marcador,
      latitude: d.local!.latitude,
      longitude: d.local!.longitude,
      ...(observacao ? { observation: observacao } : {}),
      ...(cripto ?? {}),
    },
  };
}

/** Payload de um passo simples (a recolha leva a foto). */
export function payloadPasso(deliveryId: string, passo: Passo, foto: FicheiroProva | null, local: LocalProva | null) {
  if (passo.precisaFoto && !foto) throw new Error('Tira a foto da encomenda recolhida.');
  return {
    delivery_id: deliveryId,
    new_status: passo.novo,
    ...(foto
      ? {
          proof: {
            photo_url: foto.marcador,
            ...(local ? { latitude: local.latitude, longitude: local.longitude } : {}),
          },
        }
      : {}),
  };
}

/** Payload de "não foi possível entregar" (motivo obrigatório; foto opcional). */
export function payloadFalha(deliveryId: string, motivo: MotivoFalha, observacao: string, foto: FicheiroProva | null, local: LocalProva | null) {
  const obs = observacao.trim();
  return {
    delivery_id: deliveryId,
    new_status: 'FAILED' as const,
    reason: motivo,
    proof: {
      ...(foto ? { photo_url: foto.marcador } : {}),
      ...(local ? { latitude: local.latitude, longitude: local.longitude } : {}),
      ...(obs ? { observation: obs } : {}),
    },
  };
}

/** Uma operação da fila para uma entrega: o que o estafeta já fez e ainda não foi confirmado. */
export interface AcaoPendente {
  deliveryId: string;
  novo: string;
  /** Recusada pelo servidor (ex.: PIN errado); null enquanto espera rede. */
  erro: string | null;
}

/**
 * Estado a mostrar ao estafeta: o do servidor, ou o da última ação ainda à
 * espera de rede (assim pode fazer as etapas todas sem rede, pela ordem).
 * Ações recusadas não contam.
 */
export function estadoEfetivo(estadoServidor: string, pendentes: readonly AcaoPendente[]): string {
  const aEspera = pendentes.filter((p) => p.erro === null);
  return aEspera.length > 0 ? aEspera[aEspera.length - 1].novo : estadoServidor;
}

/** Erro do servidor numa ação do estafeta, em palavras simples. */
export function mensagemErroEstafeta(erro: string): string {
  if (/PIN de confirmacao incorreto/.test(erro)) {
    const restam = erro.match(/restam (\d+)/)?.[1];
    return `O PIN estava errado${restam ? ` (restam ${restam} tentativas)` : ''}. Confirma o PIN com quem recebe e faz a prova de novo.`;
  }
  if (/^PIN_LOCKED/.test(erro)) return 'O PIN foi errado 5 vezes e a entrega ficou bloqueada. Quem enviou tem de gerar um PIN novo.';
  if (/^PIN_EXPIRED/.test(erro)) return 'O PIN expirou. Quem enviou tem de gerar um PIN novo.';
  if (/^POD_INCOMPLETA/.test(erro)) return 'A prova estava incompleta (foto e assinatura são obrigatórias). Faz a prova de novo.';
  if (/transicao invalida/.test(erro)) return 'Esta etapa já não é possível (a entrega mudou). Atualiza a lista.';
  if (/foto como prova de recolha/.test(erro)) return 'A recolha precisa de uma foto.';
  return erro;
}
