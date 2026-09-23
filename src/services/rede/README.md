# src/services/rede

Deteção de ligação à internet, por cima do `@react-native-community/netinfo`.

| Função | O que faz |
| --- | --- |
| `estaOnline()` | Pergunta agora ao sistema se há rede. Devolve `true` ou `false` (nunca lança erro). |
| `subscrever(mudanca)` | Chama `mudanca(online)` quando a ligação muda (só nas passagens online ↔ offline). Devolve a função que deixa de ouvir. |
| `temRede(estado)` | A regra usada pelas duas: há ligação e a internet não foi dada como inalcançável. |

`isInternetReachable` pode vir `null` enquanto o sistema ainda está a verificar.
Nesse caso conta como online: tenta-se enviar e, se não houver internet, o envio
falha sem perder nada (a fila guarda tudo).

Quem usa: o motor de sincronização (`src/sync`) antes de cada envio e para
sincronizar quando a rede volta.
