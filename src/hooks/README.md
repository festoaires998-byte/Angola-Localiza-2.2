# src/hooks

Ponte entre ecrãs e o resto (useGps, useFilaSync, useSessao, useCargos).

- `useSessao()` — estado completo da sessão (`src/state/sessao.ts`).
- `useCargos()` — cargos, estado KYC, separadores permitidos, `faltaMfa` e `passoMfa`.
- `useFilaSync()` — estado da sincronização para os ecrãs:
  - `pendentes` e `fotosPendentes` (do utilizador com sessão; atualizam-se sozinhos
    depois de cada envio e de cada operação nova);
  - `operacoesComProblema` — o que precisa da atenção do utilizador, das mais recentes para as
    mais antigas, cada uma com `operation_id`, `operation_type`, `gravidade`, `erro` e `criado_em`:
    - `gravidade: 'falhou'` — não vai ser enviada (`falhou_definitivo`). Ex.: foto alterada ou
      danificada depois de ser tirada. Os ficheiros locais dessas operações ficam guardados;
    - `gravidade: 'aviso'` — prova de entrega enviada cuja assinatura não confere com a chave
      registada (o servidor marcou-a como não verificada). Não está falhada; ficou uma cópia
      local em `provas_evidencia`;
  - `aSincronizar`, `ultimaSincronizacao` (ISO);
  - `ultimoErro` — frase simples para mostrar ao utilizador (ou `null`);
  - `precisaEntrarDeNovo` — o servidor recusou a sessão; mostrar "Entrar de novo";
  - `sincronizarAgora()` — botão "Sincronizar agora" (`forcar: true`, não espera a pausa entre tentativas);
  - `marcarAvisoVisto(operationId)` — botão "Já vi" de um aviso: grava `visto_em` em
    `provas_evidencia` e o aviso deixa de aparecer. A prova **nunca** é apagada.
- `useLinkAuth()` — estado do último link do email (recuperação / confirmação).
- `usePosicao()` — GPS enquanto o ecrã está aberto: permissão, GPS desligado, posição e precisão.
- `useOnline()` — há rede agora?
- `useInfoLocal(posicao, online)` — Plus Code, Código Postal Digital e província/município (`src/services/location`).
- `useMapaOffline(online)` — estado do mapa do Huambo no telemóvel (`src/services/mapas`).
