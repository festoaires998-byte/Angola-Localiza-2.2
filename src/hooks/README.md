# src/hooks

Ponte entre ecrãs e o resto (useGps, useFilaSync, useSessao, useCargos).

- `useSessao()` — estado completo da sessão (`src/state/sessao.ts`).
- `useCargos()` — cargos, estado KYC, separadores permitidos, `faltaMfa` e `passoMfa`.
- `useFilaSync()` — estado da sincronização para os ecrãs:
  - `pendentes` e `fotosPendentes` (do utilizador com sessão; atualizam-se sozinhos
    depois de cada envio e de cada operação nova);
  - `aSincronizar`, `ultimaSincronizacao` (ISO);
  - `ultimoErro` — frase simples para mostrar ao utilizador (ou `null`);
  - `precisaEntrarDeNovo` — o servidor recusou a sessão; mostrar "Entrar de novo";
  - `sincronizarAgora()` — botão "Sincronizar agora" (`forcar: true`, não espera a pausa entre tentativas).
