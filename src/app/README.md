# src/app

Ecrãs (expo-router). Só interface: a lógica está em `src/api`, `src/state`, `src/sync` e `src/hooks`.

| Ficheiro | O que faz |
| --- | --- |
| `_layout.tsx` | Arranque: `sessao.iniciar()`, `iniciarSync()`, `registarTarefaSync()`, importa `tarefaSegundoPlano.ts` e trata os links do email. |
| `index.tsx` | Mostra "A abrir…" enquanto a sessão é lida e depois envia para Entrar, MFA ou Mapa (`destinoDaSessao`). |
| `adesao.tsx` | Link de adesão `angolalocaliza://adesao?token=…`. |
| `(auth)/` | Entrar, criar conta, palavra-passe e MFA. |
| `(tabs)/` | Os 8 separadores (só os permitidos aparecem). |

Com sessão guardada e sem rede, a app abre na mesma com o último perfil confirmado
(`perfil_local`). Só entrar pela primeira vez precisa de internet.

Os componentes partilhados (botões grandes, caixas, cores) estão em `src/components`.
Os testes dos ecrãs estão em `src/__tests__/ecras.test.tsx` (fora de `src/app`,
senão o expo-router tratava-os como ecrãs).
