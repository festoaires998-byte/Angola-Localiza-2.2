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

O super_admin vê todos. Staff (quem tem cargos) só vê mais do que mapa e
definicoes depois de ter o KYC em `ID_VERIFIED` **e** a sessão em AAL2 (código MFA).
