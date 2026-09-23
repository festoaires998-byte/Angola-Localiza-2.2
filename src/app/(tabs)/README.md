# src/app/(tabs)

Ecrãs principais: mapa, guardados, entrega, minhas-entregas, campo, validar, admin, definicoes.

Quem vê cada separador é decidido em `src/domain/organizacao/cargos.ts`
(`separadoresPermitidos` / `decidirAcesso`). Os ecrãs usam o hook `useCargos()`
e só mostram os separadores de `separadores`.

| Separador | Quem vê |
| --- | --- |
| mapa, definicoes | Todos, sempre |
| guardados | Cidadão, tecnico_campo, supervisor |
| entrega | Cidadão |
| minhas-entregas | Cidadão, estafeta, operador_postal |
| campo | tecnico_campo |
| validar | supervisor, admin_municipal, admin_provincial, admin_nacional |
| admin | admin_municipal, admin_provincial, admin_nacional, auditor |

Os separadores que o utilizador não pode ver ficam dentro de `Tabs.Protected`: não
aparecem na barra e não abrem nem por link. Os que ainda não existem mostram
"Em construção" (`src/components/EmConstrucao.tsx`).

Staff com KYC por verificar vê, por cima de tudo, o aviso fixo: "A tua identidade
ainda não foi verificada. Até lá só tens acesso ao Mapa e às Definições."

`definicoes/` tem o ecrã das Definições (conta, sincronização, avisos, Sair, versão)
e `definicoes/diagnostico.tsx` (o antigo ecrã provisório de diagnóstico).

O super_admin vê todos. Staff (quem tem cargos) só vê mais do que mapa e
definicoes depois de ter o KYC em `ID_VERIFIED` **e** a sessão em AAL2 (código MFA).
