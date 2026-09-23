# src/domain/organizacao

Domínio 5: cargos (RBAC) e hierarquia de convites.

`cargos.ts` tem só regras puras (sem rede, sem base de dados), testadas em `cargos.test.ts`.

## Cargos

`super_admin`, `admin_nacional`, `admin_provincial`, `admin_municipal`, `tecnico_campo`,
`supervisor`, `operador_postal`, `auditor`, `empresa`, `estafeta`.

## `separadoresPermitidos(cargos, estadoKyc)` — as mesmas regras do site

- super_admin → todos.
- Sempre: mapa e definicoes.
- Sem cargos (cidadão) → mais guardados, entrega e minhas-entregas. Nunca bloqueado por KYC.
- tecnico_campo → campo e guardados.
- estafeta ou operador_postal → minhas-entregas.
- supervisor → validar e guardados.
- admin_municipal, admin_provincial ou admin_nacional → validar e admin.
- auditor → admin.
- Staff (tem cargos e não é super_admin) com KYC diferente de `ID_VERIFIED` → só mapa e definicoes.

## `exigeMfa(cargos)`

Verdadeiro para qualquer utilizador com cargos.

## `decidirAcesso({ perfil, nivel, temFatorMfa })` — "falhar fechado" (diferente do site)

- `perfil` é o **último perfil confirmado** pelo servidor. Se agora não foi possível
  confirmar (sem rede ou erro), usa-se o guardado; se nunca houve → só mapa e definicoes.
- Cargos que esta versão da app não conhece são ignorados; os conhecidos aplicam-se
  normalmente. Se **só** tiver cargos desconhecidos → só mapa e definicoes
  (nunca é tratado como cidadão).
- Se exigir MFA e a sessão não for AAL2 (ou não se souber) → só mapa e definicoes,
  com `faltaMfa: true` e `passoMfa` = `verificar` (tem fator) ou `inscrever` (não tem).
- Nunca abre mais do que `separadoresPermitidos` do último perfil confirmado.
