import { bytesToHex } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';

import type {
  FicheiroPendente,
  RepositorioFicheirosPendentes,
} from '@/database/repositories/ficheirosPendentes';
import {
  paraPedidoSync,
  type OperacaoFila,
  type RepositorioFilaSaida,
  type ResultadoSync,
} from '@/database/repositories/filaSaida';
import { relogioDoSistema, type Relogio } from '@/database/util';
import type { RepositorioProvasEvidencia } from '@/database/repositories/provasEvidencia';
import {
  dispositivoDaProva,
  provaAssinadaCom,
  provaEstaAssinada,
} from '@/services/crypto/assinarProva';
import type { EstadoChaves, ResultadoRegisto } from '@/services/crypto/chaveDispositivo';
import { criarLoja, type Loja } from '@/state/loja';

import { criarEmissor, type Emissor } from './eventos';
import { idsDosMarcadores, nomeNoStorage, trocarMarcadores, urlPublico } from './marcadores';

/** Sessão vista pelo motor. */
export interface SessaoSync {
  userId: string;
  accessToken: string;
  /** Quando o token expira (milissegundos desde 1970), se se souber. */
  expiraEm: number | null;
}

/** A sessão já não é aceite pelo servidor: é preciso entrar de novo. */
export class ErroSessaoInvalida extends Error {
  constructor(mensagem = 'Sessão inválida.') {
    super(mensagem);
    this.name = 'ErroSessaoInvalida';
  }
}

export interface DependenciasMotor {
  fila: Pick<
    RepositorioFilaSaida,
    | 'libertarPresasAEnviar'
    | 'listarProntas'
    | 'atualizarPayload'
    | 'registarFalhaOperacao'
    | 'marcarFalhouDefinitivo'
    | 'marcarAEnviar'
    | 'aplicarResultadosSync'
    | 'registarFalhaEnvio'
    | 'devolverAPendente'
    | 'obter'
    | 'limparConcluidasAntigas'
  >;
  ficheiros: Pick<
    RepositorioFicheirosPendentes,
    'obter' | 'marcarEnviado' | 'listarDeOperacoesConcluidas' | 'apagar'
  >;
  /** Sessão atual (sem pedir nada à rede), ou null se não houver. */
  obterSessao(): Promise<SessaoSync | null>;
  /** Renova o token. Lança ErroSessaoInvalida se o servidor recusar a sessão. */
  renovarSessao(): Promise<SessaoSync | null>;
  estaOnline(): Promise<boolean>;
  /** Chave de assinatura do aparelho (src/services/crypto). */
  chaveAssinatura: {
    /** Chave local e chave que o servidor tem para o utilizador (sem rede). */
    estado(userId: string): Promise<EstadoChaves>;
    /**
     * Regista a chave local no servidor, se ainda não estiver. Devolve "espera"
     * enquanto houver provas por enviar assinadas com a chave que o servidor tem.
     */
    garantirRegistada(sessao: SessaoSync): Promise<ResultadoRegisto>;
  };
  /** Onde se guarda a cópia das provas cuja assinatura não confere. */
  evidencias: Pick<RepositorioProvasEvidencia, 'guardar'>;
  /** Bytes do ficheiro local, ou null se não existir. */
  lerFicheiro(caminho: string): Promise<Uint8Array | null>;
  apagarFicheiro(caminho: string): Promise<void>;
  fetch: typeof fetch;
  config: { url: string; chaveAnon: string };
  eventos?: Emissor;
  /** Onde o motor publica o seu estado (por omissão, uma loja nova). */
  estado?: Loja<EstadoSync>;
  relogio?: Relogio;
  /** Operações por pedido (por omissão 20). */
  tamanhoLote?: number;
  /** Renova o token se faltar menos do que isto para expirar (por omissão 2 min). */
  margemRenovacaoMs?: number;
  /** Tempo máximo de cada pedido HTTP (por omissão 60 s). */
  tempoMaximoMs?: number;
}

export interface EstadoSync {
  aSincronizar: boolean;
  /** Fim da última volta em que se falou com o servidor sem erro (ISO). */
  ultimaSincronizacao: string | null;
  /** Mensagem simples para mostrar no ecrã, ou null. */
  ultimoErro: string | null;
  precisaEntrarDeNovo: boolean;
}

export function estadoSyncInicial(): EstadoSync {
  return { aSincronizar: false, ultimaSincronizacao: null, ultimoErro: null, precisaEntrarDeNovo: false };
}

export type MotivoFim =
  | 'ok'
  | 'sem_sessao'
  | 'sem_rede'
  | 'precisa_entrar'
  | 'erro_rede'
  | 'erro_servidor'
  | 'sessao_mudou';

export interface ResumoSync {
  motivo: MotivoFim;
  /** Operações enviadas no POST ao sync. */
  enviadas: number;
  concluidas: number;
  /** Operações que ficaram pendentes (FAILED, ausentes ou foto que falhou). */
  adiadas: number;
  /** Operações que falharam de vez (ex.: foto alterada ou danificada). */
  definitivas: number;
  /** Provas de entrega que esperam o registo da chave do aparelho (também contam em adiadas). */
  aguardamChave: number;
  /** Provas enviadas cuja assinatura não confere com a chave registada (ficou cópia local). */
  avisos: number;
}

export interface MotorSync {
  sincronizar(opcoes?: { forcar?: boolean }): Promise<ResumoSync>;
  estado: Loja<EstadoSync>;
  eventos: Emissor;
}

export const MENSAGENS = {
  semServidor: 'Não foi possível falar com o servidor. Os dados ficam guardados e vamos tentar de novo.',
  servidor: 'O servidor teve um problema. Os dados ficam guardados e vamos tentar de novo mais tarde.',
  sessao: 'A sua sessão terminou. Entre de novo para enviar os dados guardados.',
  foto: 'Não foi possível enviar uma foto. Vamos tentar de novo.',
  fotoAlterada: 'Uma foto foi alterada ou danificada depois de ser tirada e não pode ser enviada.',
  fotoEmFalta: 'Uma foto guardada no telemóvel já não existe e não pôde ser enviada.',
  recusadas: 'Alguns registos não foram aceites pelo servidor. Vamos tentar de novo.',
  chave: 'As provas de entrega esperam até este aparelho ficar registado no servidor. Vamos tentar de novo.',
} as const;

type RespostaHttp =
  | { tipo: 'ok'; estado: number; corpo: unknown }
  | { tipo: 'http'; estado: number; corpo: unknown }
  | { tipo: 'rede' };

/** Erro gravado na operação quando o sha256 da foto não bate certo. */
export const ERRO_FOTO_ALTERADA = 'A foto foi alterada ou danificada depois de ser tirada';

/**
 * Aviso guardado quando uma prova é enviada com uma assinatura que não confere
 * com a chave registada (o servidor marca-a crypto_verified = false).
 */
export const AVISO_ASSINATURA_NAO_CONFERE =
  'A assinatura desta prova não confere com a chave registada deste aparelho. ' +
  'Foi enviada na mesma (o servidor marca-a como não verificada) e ficou uma cópia no telemóvel.';

type ResultadoFotos =
  | { tipo: 'ok'; payload: unknown }
  | { tipo: 'falhou'; erro: string; mensagem: string; definitivo?: boolean }
  | { tipo: 'sessao' };

function lerJson(texto: string): unknown {
  try {
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

function campo(corpo: unknown, nome: string): string {
  const v = (corpo as Record<string, unknown> | null)?.[nome];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
}

/**
 * Cria o motor. Um só envio de cada vez: um pedido feito durante um envio
 * não corre em paralelo; faz-se mais uma volta quando o envio atual acabar.
 */
export function criarMotorSync(deps: DependenciasMotor): MotorSync {
  const agora = deps.relogio ?? relogioDoSistema;
  const eventos = deps.eventos ?? criarEmissor();
  const tamanhoLote = deps.tamanhoLote ?? 20;
  const margem = deps.margemRenovacaoMs ?? 2 * 60 * 1000;
  const tempoMaximo = deps.tempoMaximoMs ?? 60_000;
  const estado = deps.estado ?? criarLoja<EstadoSync>(estadoSyncInicial());

  let arrancou = false;
  let emCurso: Promise<ResumoSync> | null = null;
  let maisUmaVolta = false;
  let forcarNaProxima = false;
  /** Token recusado com 401: não se volta a tentar com ele. */
  let tokenRecusado: string | null = null;

  const mudar = (parcial: Partial<EstadoSync>) => estado.definir((a) => ({ ...a, ...parcial }));

  function sessaoRecusada(sessao: SessaoSync): void {
    tokenRecusado = sessao.accessToken;
    mudar({ precisaEntrarDeNovo: true, ultimoErro: MENSAGENS.sessao });
  }

  async function pedir(caminho: string, init: RequestInit, token: string): Promise<RespostaHttp> {
    const controlo = new AbortController();
    const temporizador = setTimeout(() => controlo.abort(), tempoMaximo);
    try {
      const resposta = await deps.fetch(`${deps.config.url}${caminho}`, {
        ...init,
        headers: {
          apikey: deps.config.chaveAnon,
          Authorization: `Bearer ${token}`,
          ...(init.headers as Record<string, string>),
        },
        signal: controlo.signal,
      });
      const corpo = lerJson(await resposta.text());
      return resposta.ok
        ? { tipo: 'ok', estado: resposta.status, corpo }
        : { tipo: 'http', estado: resposta.status, corpo };
    } catch {
      return { tipo: 'rede' };
    } finally {
      clearTimeout(temporizador);
    }
  }

  /** Devolve a sessão com um token que não está a expirar (renova se for preciso). */
  async function tokenValido(sessao: SessaoSync): Promise<SessaoSync> {
    if (sessao.expiraEm === null || sessao.expiraEm - agora().getTime() > margem) return sessao;
    const nova = await deps.renovarSessao();
    if (!nova) throw new ErroSessaoInvalida();
    return nova;
  }

  /** Envia um ficheiro para o Storage. O objeto já existir (409) conta como sucesso. */
  async function enviarFicheiro(
    ficheiro: FicheiroPendente,
    bytes: Uint8Array,
    sessao: SessaoSync,
  ): Promise<'ok' | 'sessao' | string> {
    const nome = nomeNoStorage(ficheiro);
    const r = await pedir(
      `/storage/v1/object/${ficheiro.bucket}/${nome}`,
      {
        method: 'POST',
        headers: { 'Content-Type': ficheiro.content_type, 'x-upsert': 'false' },
        body: bytes as unknown as BodyInit,
      },
      sessao.accessToken,
    );
    if (r.tipo === 'ok') return 'ok';
    if (r.tipo === 'rede') return 'sem ligação ao Storage';
    const codigo = campo(r.corpo, 'statusCode');
    const texto = `${campo(r.corpo, 'error')} ${campo(r.corpo, 'message')}`;
    // Algumas versões do Storage respondem 400 com statusCode "409" no corpo.
    if (r.estado === 409 || codigo === '409' || /duplicate|already exists/i.test(texto)) return 'ok';
    if (r.estado === 401 || ([400, 403].includes(r.estado) && /jwt/i.test(texto))) return 'sessao';
    return `Storage respondeu ${r.estado}${texto.trim() ? `: ${texto.trim()}` : ''}`;
  }

  /**
   * Troca cada marcador "offline:<id>" do payload pelo URL real, enviando o
   * ficheiro se ainda não foi. Grava logo o payload na fila (antes do POST).
   */
  async function prepararFotos(op: OperacaoFila, sessao: SessaoSync): Promise<ResultadoFotos> {
    const ids = idsDosMarcadores(op.payload);
    if (ids.length === 0) return { tipo: 'ok', payload: op.payload };

    const urls = new Map<string, string>();
    let falha: { erro: string; mensagem: string; definitivo?: boolean } | null = null;
    let sessaoInvalida = false;

    for (const id of ids) {
      const ficheiro = await deps.ficheiros.obter(id);
      if (!ficheiro) {
        falha = { erro: `Ficheiro ${id} não está registado.`, mensagem: MENSAGENS.fotoEmFalta };
        break;
      }
      if (ficheiro.estado === 'enviado' && ficheiro.url_remota) {
        urls.set(id, ficheiro.url_remota);
        continue;
      }
      const bytes = await deps.lerFicheiro(ficheiro.caminho_local).catch(() => null);
      if (!bytes) {
        falha = { erro: `Ficheiro local em falta: ${id}.`, mensagem: MENSAGENS.fotoEmFalta };
        break;
      }
      if (ficheiro.sha256 && bytesToHex(sha256(bytes)) !== ficheiro.sha256.toLowerCase()) {
        // Tentar de novo não resolve: a operação falha de vez e o ficheiro fica (é evidência).
        falha = { erro: ERRO_FOTO_ALTERADA, mensagem: MENSAGENS.fotoAlterada, definitivo: true };
        break;
      }
      const r = await enviarFicheiro(ficheiro, bytes, sessao);
      if (r === 'sessao') {
        sessaoInvalida = true;
        break;
      }
      if (r !== 'ok') {
        falha = { erro: `Foto ${id}: ${r}`, mensagem: MENSAGENS.foto };
        break;
      }
      const url = urlPublico(deps.config.url, ficheiro.bucket, nomeNoStorage(ficheiro));
      await deps.ficheiros.marcarEnviado(id, url);
      urls.set(id, url);
    }

    // O que já subiu fica gravado, mesmo que outra foto da operação tenha falhado.
    const payload = urls.size > 0 ? trocarMarcadores(op.payload, urls) : op.payload;
    if (urls.size > 0) await deps.fila.atualizarPayload(sessao.userId, op.operation_id, payload);
    if (sessaoInvalida) return { tipo: 'sessao' };
    if (falha) return { tipo: 'falhou', ...falha };
    return { tipo: 'ok', payload };
  }

  /** Apaga os ficheiros locais cujas operações já ficaram "concluida". */
  async function apagarFicheirosConcluidos(): Promise<void> {
    const lista = await deps.ficheiros.listarDeOperacoesConcluidas();
    for (const f of lista) {
      try {
        await deps.apagarFicheiro(f.caminho_local);
        await deps.ficheiros.apagar(f.id);
      } catch {
        // Fica para a próxima volta.
      }
    }
  }

  async function volta(forcar: boolean): Promise<ResumoSync> {
    const resumo: ResumoSync = {
      motivo: 'ok',
      enviadas: 0,
      concluidas: 0,
      adiadas: 0,
      definitivas: 0,
      aguardamChave: 0,
      avisos: 0,
    };
    if (!arrancou) {
      // Operações presas em "a_enviar" (a app fechou a meio de um envio).
      await deps.fila.libertarPresasAEnviar();
      arrancou = true;
    }

    let sessao = await deps.obterSessao();
    if (!sessao) return { ...resumo, motivo: 'sem_sessao' };
    if (!(await deps.estaOnline())) return { ...resumo, motivo: 'sem_rede' };
    if (tokenRecusado !== null) {
      if (sessao.accessToken === tokenRecusado) return { ...resumo, motivo: 'precisa_entrar' };
      // Sessão nova (entrou de novo ou o token foi renovado): tenta outra vez.
      tokenRecusado = null;
      mudar({ precisaEntrarDeNovo: false, ultimoErro: null });
    }

    const userId = sessao.userId;
    const vistas = new Set<string>();
    let mensagemAviso: string | null = null;
    /** Chaves (local e do servidor): lidas uma vez por volta, só se houver provas assinadas. */
    let chaves: EstadoChaves | null = null;
    /** Registo da chave local: pedido no máximo uma vez por volta. */
    let registo: ResultadoRegisto | null = null;
    /** Provas com a chave nova à espera de que as da chave antiga sejam enviadas. */
    let esperaPelaChaveAntiga = false;

    lotes: while (true) {
      const atual = await deps.obterSessao();
      if (!atual || atual.userId !== userId) {
        resumo.motivo = 'sessao_mudou';
        break;
      }
      try {
        sessao = await tokenValido(atual);
      } catch (erro) {
        if (erro instanceof ErroSessaoInvalida) {
          sessaoRecusada(atual);
          return { ...resumo, motivo: 'precisa_entrar' };
        }
        resumo.motivo = 'erro_rede';
        mensagemAviso = MENSAGENS.semServidor;
        break;
      }
      if (sessao.userId !== userId) {
        resumo.motivo = 'sessao_mudou';
        break;
      }

      // "vistas" evita voltar à mesma operação na mesma volta (com forcar, as
      // que acabaram de falhar voltariam a aparecer logo).
      const lote = (
        await deps.fila.listarProntas(userId, tamanhoLote + vistas.size, { ignorarEspera: forcar })
      )
        .filter((o) => !vistas.has(o.operation_id))
        .slice(0, tamanhoLote);
      if (lote.length === 0) break;
      lote.forEach((o) => vistas.add(o.operation_id));

      const prontas: OperacaoFila[] = [];
      for (const op of lote) {
        let aviso: string | null = null;
        if (op.operation_type === 'delivery_proof' && provaEstaAssinada(op.payload)) {
          if (!chaves) {
            try {
              chaves = await deps.chaveAssinatura.estado(userId);
            } catch {
              chaves = null;
            }
          }
          if (!chaves) {
            // Não é culpa da prova: fica pendente sem somar tentativas.
            resumo.adiadas++;
            resumo.aguardamChave++;
            mensagemAviso = mensagemAviso ?? MENSAGENS.chave;
            continue;
          }
          const { deviceId, local, noServidor }: EstadoChaves = chaves;
          // O servidor verifica com a chave de (utilizador, device_id da prova).
          const idDaProva = dispositivoDaProva(op.payload);
          const chaveDoServidor = idDaProva ? noServidor[idDaProva] : undefined;
          if (chaveDoServidor && provaAssinadaCom(op.payload, idDaProva!, chaveDoServidor)) {
            // Assinada com uma chave que o servidor tem: segue já (antes de qualquer registo novo).
          } else if (local && provaAssinadaCom(op.payload, deviceId, local)) {
            // Assinada com a chave local, que o servidor ainda não tem: registar primeiro.
            registo = registo ?? (await deps.chaveAssinatura.garantirRegistada(sessao));
            if (registo.tipo === 'sessao') {
              sessaoRecusada(sessao);
              return { ...resumo, motivo: 'precisa_entrar' };
            }
            if (registo.tipo !== 'ok') {
              // Sem rede, erro do servidor, ou ainda há provas da chave antiga por
              // enviar: fica pendente sem somar tentativas.
              if (registo.tipo === 'espera') esperaPelaChaveAntiga = true;
              resumo.adiadas++;
              resumo.aguardamChave++;
              mensagemAviso = mensagemAviso ?? MENSAGENS.chave;
              continue;
            }
            chaves = { ...chaves, noServidor: { ...noServidor, [deviceId]: local } };
          } else {
            // Não confere com nenhuma chave conhecida: envia-se na mesma com a
            // assinatura original (o servidor marca crypto_verified = false) e
            // guarda-se uma cópia local como evidência.
            aviso = AVISO_ASSINATURA_NAO_CONFERE;
          }
        }
        const r = await prepararFotos(op, sessao);
        if (r.tipo === 'sessao') {
          sessaoRecusada(sessao);
          return { ...resumo, motivo: 'precisa_entrar' };
        }
        if (r.tipo === 'falhou') {
          if (r.definitivo) {
            await deps.fila.marcarFalhouDefinitivo(userId, op.operation_id, r.erro);
            resumo.definitivas++;
          } else {
            await deps.fila.registarFalhaOperacao(userId, op.operation_id, r.erro);
            resumo.adiadas++;
          }
          mensagemAviso = r.mensagem;
          continue;
        }
        if (aviso) {
          await deps.evidencias.guardar({
            operation_id: op.operation_id,
            user_id: userId,
            device_id: op.device_id,
            payload: r.payload,
            motivo: aviso,
          });
          resumo.avisos++;
        }
        prontas.push({ ...op, payload: r.payload });
      }
      if (prontas.length === 0) continue;

      const ids = prontas.map((o) => o.operation_id);
      await deps.fila.marcarAEnviar(userId, ids);
      const r = await pedir(
        '/functions/v1/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paraPedidoSync(prontas)),
        },
        sessao.accessToken,
      );

      if (r.tipo === 'http' && r.estado === 401) {
        // Não é culpa das operações: voltam a pendente sem somar tentativas.
        await deps.fila.devolverAPendente(userId);
        sessaoRecusada(sessao);
        return { ...resumo, motivo: 'precisa_entrar' };
      }
      const results = (r.tipo === 'ok' ? (r.corpo as { results?: unknown })?.results : null) as
        | ResultadoSync[]
        | null;
      if (r.tipo !== 'ok' || !Array.isArray(results)) {
        const erro =
          r.tipo === 'rede'
            ? 'Sem ligação ao servidor.'
            : `O servidor respondeu ${r.tipo === 'http' ? r.estado : 'sem "results"'}.`;
        await deps.fila.registarFalhaEnvio(userId, erro);
        resumo.adiadas += prontas.length;
        resumo.motivo = r.tipo === 'rede' ? 'erro_rede' : 'erro_servidor';
        mensagemAviso = r.tipo === 'rede' ? MENSAGENS.semServidor : MENSAGENS.servidor;
        break;
      }

      await deps.fila.aplicarResultadosSync(
        userId,
        results.filter((x) => x && typeof x.operation_id === 'string' && typeof x.status === 'string'),
      );
      resumo.enviadas += prontas.length;
      for (const id of ids) {
        const op = await deps.fila.obter(id);
        if (op?.estado === 'concluida') resumo.concluidas++;
        else {
          resumo.adiadas++;
          mensagemAviso = mensagemAviso ?? MENSAGENS.recusadas;
        }
      }
    }

    // As provas da chave antiga foram enviadas nesta volta: mais uma volta para
    // registar a chave nova e enviar as provas que ficaram à espera dela.
    if (esperaPelaChaveAntiga && resumo.concluidas > 0) maisUmaVolta = true;

    // Só agora, com as operações "concluida", se apagam as provas locais.
    // Tem de ser antes de limparConcluidasAntigas (que desliga o ficheiro da operação).
    await apagarFicheirosConcluidos();
    await deps.fila.limparConcluidasAntigas();

    const falouComServidor = resumo.motivo === 'ok' || resumo.motivo === 'sessao_mudou';
    mudar({
      ultimoErro: mensagemAviso,
      ...(falouComServidor ? { ultimaSincronizacao: agora().toISOString() } : {}),
    });
    eventos.emitir('sincronizado');
    return resumo;
  }

  async function correr(forcar: boolean): Promise<ResumoSync> {
    mudar({ aSincronizar: true });
    try {
      let resumo: ResumoSync;
      let f = forcar;
      do {
        maisUmaVolta = false;
        try {
          resumo = await volta(f);
        } catch (erro) {
          // Erro inesperado (ex.: base de dados): não perde nada, só avisa.
          mudar({ ultimoErro: MENSAGENS.servidor });
          resumo = {
            motivo: 'erro_servidor',
            enviadas: 0,
            concluidas: 0,
            adiadas: 0,
            definitivas: 0,
            aguardamChave: 0,
            avisos: 0,
          };
          if (!maisUmaVolta) throw erro;
        }
        f = forcarNaProxima;
        forcarNaProxima = false;
      } while (maisUmaVolta);
      return resumo;
    } finally {
      mudar({ aSincronizar: false });
    }
  }

  return {
    estado,
    eventos,
    sincronizar({ forcar = false } = {}) {
      if (emCurso) {
        maisUmaVolta = true;
        forcarNaProxima = forcarNaProxima || forcar;
        return emCurso;
      }
      emCurso = correr(forcar).finally(() => {
        emCurso = null;
      });
      return emCurso;
    },
  };
}
