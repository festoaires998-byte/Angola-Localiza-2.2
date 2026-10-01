-- Revogação das chaves de assinatura dos aparelhos.
--
-- A função deliveries (desde 27/09) lê signing_keys.revoked_at para recusar
-- provas assinadas por uma chave revogada, mas a coluna nunca foi criada: o
-- pedido falhava e TODAS as provas assinadas ficavam crypto_verified = false
-- com o motivo "aparelho sem chave registada".
--
-- revoked_at null = chave em uso. Só o servidor (service role) revoga.
alter table public.signing_keys
  add column if not exists revoked_at timestamptz;

comment on column public.signing_keys.revoked_at is
  'Quando a chave foi revogada (null = em uso). Provas assinadas com uma chave revogada ficam crypto_verified = false; o aparelho não regista outra chave sozinho.';
