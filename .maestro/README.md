# .maestro — testes automáticos no emulador Android

Fluxos do [Maestro](https://maestro.mobile.dev) que o workflow
`.github/workflows/testes-emulador.yml` corre num emulador Android no GitHub
(nunca no telemóvel de ninguém). O script `.github/scripts/testes-emulador.sh`
liga-os pela ordem certa e trata do GPS falso e do modo avião.

| Fluxo | O que verifica |
| --- | --- |
| `01_app_abre.yaml` | A app abre e mostra o ecrã de entrada (corre sempre, mesmo sem conta de teste). |
| `02_entrar.yaml` | Entra com a conta de teste (segredos `TESTE_EMAIL` e `TESTE_PASSWORD`). |
| `03_mapa_com_rede.yaml` | GPS no Huambo, a 2 m do limite de uma célula: Plus Code, código postal confirmado, aviso de limite, província; descarrega o mapa offline; abre a Moradas. |
| `04_sem_rede.yaml` | Em modo avião, fecha e volta a abrir a app: mapa, Plus Code, código confirmado com a data, província e Moradas continuam a aparecer. |

O ponto de teste (`-12.7760877, 15.7391167`) foi escolhido a 2 m do limite
da célula `MNFQR6JW`: Plus Code `5FVQ6PFQ+HJ9`, código `AO-HUA-MNFQR6JW[-N]-90`.
Se mudar a grelha do código postal, estes valores mudam também.

As capturas de ecrã de cada passo ficam no artefacto `capturas-emulador` da
execução (JPEG pequenos).
