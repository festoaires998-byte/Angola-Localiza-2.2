# Backlog e dívida técnica

## Dívida técnica

### Site antigo mostra "Verificado!" depois de enviar a verificação simples

- **Desde:** 24/09/2026 (citizen-verify v3, PR #27).
- **O quê:** desde a v3, o envio da verificação simples já não aprova. Fica
  "Por rever" (`citizen_id_status = PENDING_REVIEW`) até um administrador
  decidir. O site antigo (repositório Huambo-Localiza-) ainda mostra
  "Verificado!" depois de enviar e, ao voltar a abrir, "Por verificar".
- **Impacto:** só na mensagem. O servidor continua a recusar registos de
  moradas até à aprovação.
- **Correção (hotfix no site):** ler `citizen-verify?action=status` e mostrar
  os 4 estados (por verificar / em revisão / verificado / recusado com o motivo),
  como a app faz.
- **Prioridade:** a seguir ao painel de revisão na app.

## Decidido, por fazer

### Retenção das fotos da verificação simples: 90 dias

As fotos do BI (frente e verso) e as selfies no bucket `kyc-artifacts` são
destruídas 90 dias depois da decisão (aprovação ou recusa). Fica só o
registo da decisão (`user_identity`, `audit_logs`) e das consultas
(`identity_artifact_views`).
- **Proposta:** uma tarefa diária no servidor (pg_cron ou função agendada)
  que apaga os ficheiros com `citizen_id_reviewed_at` com mais de 90 dias.

### Infraestrutura (depois de ver o que o site antigo ainda usa)

- Tirar o acesso sem sessão às funções SECURITY DEFINER (`is_admin`,
  `is_id_verified`, `can_validate_field`, `nearby_addresses`…).
- Bucket `kyc-artifacts`: aceitar só JPEG até 5 MB, cada utilizador só na
  sua pasta (`<id>/…`), com hotfix do site.

### Depois de validar o APK no terreno

- Publicar as Edge Functions por um workflow manual (sem a service role key).
- Guardar a estrutura completa da base de dados no repositório (migração inicial).
- Testes das Edge Functions a correr de verdade, com uma base de dados falsa.
- Relatório de erros da app, leve, para gastar poucos dados.

### Site antigo: pedir o nome completo no registo

- **Desde:** a app passou a exigir o nome completo (user_metadata.full_name).
- **O quê:** quem cria conta no site ainda fica sem nome. A app pede-o no
  primeiro acesso ("Como te chamas?"), mas o site devia pedi-lo no registo,
  com o mesmo campo (`options.data.full_name`).
