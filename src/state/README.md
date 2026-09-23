# src/state

Estado global: sessão, cargos, rede. Sem bibliotecas de estado: uma loja simples
(`loja.ts`) lida pelo React com `useSyncExternalStore`.

| Ficheiro | Para que serve |
| --- | --- |
| `loja.ts` | `criarLoja()`: obter, definir, subscrever. |
| `criarSessao.ts` | A lógica da sessão, com as dependências por parâmetro (testável). |
| `sessao.ts` | A sessão da app, ligada ao Supabase (`sessao.iniciar()`, `sessao.recarregar()`). |
| `destino.ts` | `destinoDaSessao()`: para onde a app vai (Entrar, código MFA, ativar MFA ou Mapa). |

## Estado da sessão

- `carregado` — já se leu a sessão guardada.
- `utilizador` — `{ id, email }` ou null.
- `perfil` — último perfil confirmado (cargos + KYC) deste utilizador.
- `perfilLido` — já se sabe que perfil usar: o guardado neste telemóvel, o do servidor, ou já
  se esperou 5 s pelo servidor sem haver nenhum guardado. Até lá os ecrãs mostram "A abrir…".
- `perfilConfirmadoAgora` — false quando é o guardado (sem rede ou erro).
- `nivel` — AAL atual e próximo.
- `acesso` — `separadores`, `faltaMfa`, `passoMfa`, `restricao` (de `decidirAcesso`).

Quando a sessão muda: primeiro mostra o que já se sabe sem rede (incluindo o último
perfil guardado em `perfil_local`, por isso a app abre sem rede) e depois pede
cargos/KYC ao servidor. Resultados atrasados de uma sessão anterior são ignorados,
e o perfil de um utilizador nunca passa para outro.

Nos ecrãs usar os hooks `useSessao()` e `useCargos()` (em `src/hooks`).
`sessao.iniciar()` é chamado uma vez no arranque, em `src/app/_layout.tsx`.
