# src/services/crypto

Assinatura digital ECDSA P-256 deste aparelho, para as provas de entrega.
Compatível com o site e com as Edge Functions `signing-keys` e `deliveries` (Web Crypto).

| Ficheiro | Para que serve |
| --- | --- |
| `index.ts` | O que a app usa: `assinarProva()`, `garantirChaveRegistada()`, `paraCamposProva()`. Liga ao expo-secure-store, SQLite e Supabase. |
| `chaveDispositivo.ts` | Gera e guarda a chave; assina; regista a chave pública no servidor (dependências por parâmetro, para os testes). |
| `assinarProva.ts` | Monta a mensagem, assina, e `verificarAssinatura()` (a mesma verificação do servidor). |
| `jwk.ts` | Chave pública do `@noble/curves` ↔ JWK (`kty: EC`, `crv: P-256`, `x`, `y` em base64url de 32 bytes). |
| `base64.ts` | Base64 e base64url (sem depender de `atob`/`btoa`). |
| `aleatorio.ts` | Liga `crypto.getRandomValues` ao `expo-crypto` (o Hermes não o tem) antes de gerar a chave. |

## A chave

- É gerada **uma vez** com `@noble/curves` (`p256.keygen()`).
- A chave **privada** só fica no `expo-secure-store` (`angola_localiza.chave_assinatura`, formato
  `v1:<device_id>:<hex>`) com `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`: não vai para backups do
  iCloud/iTunes nem passa para outro telemóvel, e pode ser lida com o ecrã bloqueado depois
  do primeiro desbloqueio (sincronização em segundo plano). **Nunca** vai para o SQLite: o
  repositório `chaves_dispositivo` recusa JWK com `d`, e há um teste que procura a chave
  privada em todas as tabelas.
- A chave **pública** fica na tabela `chaves_dispositivo` em JWK, com `registada` e
  `registada_user_id`.
- **Chave privada desaparecida** (ex.: backup restaurado — o SQLite e o `device_id` voltam,
  a chave privada não): gera-se uma chave nova, que fica `registada = 0` até ser registada.
  Uma chave guardada com outro `device_id` também não é usada.
- **Leitura do cofre com erro:** no iOS quase sempre é o telemóvel ainda não desbloqueado
  depois de ligar — **não** se gera outra chave, só dá erro (tenta-se depois). No Android
  o erro quer dizer que o Keystore perdeu a chave: gera-se uma nova.

## Registo no servidor: `garantirChaveRegistada()`

`POST /functions/v1/signing-keys?action=register` com `{ device_id, public_key_jwk }` e o token
da sessão. Só usa a rede quando ainda não está registada **para o utilizador da sessão**
(o servidor guarda a chave por utilizador + aparelho; se outra pessoa entrar no mesmo
telemóvel, regista-se de novo para ela). Resultado: `ok`, `sessao` (401) ou `falhou`
(sem rede, sem sessão, cofre fechado ou erro do servidor). Se correr bem, `registada = 1`.

## Assinar: `assinarProva()`

```ts
const prova = await assinarProva({ delivery_id, lat, lng, plus_code, foto_sha256, assinatura_manuscrita_sha256 });
// { payload_assinado, assinatura, algoritmo: 'ECDSA-SHA256', device_id }
proof = { ...proof, ...paraCamposProva(prova) }; // crypto_payload, crypto_signature, crypto_algorithm, crypto_device_id
```

**Funciona sem rede** (a chave está no telemóvel). Só o registo precisa de rede.

- ECDSA P-256 com SHA-256 sobre os bytes UTF-8 da mensagem; assinatura de 64 bytes `r||s`
  (formato do Web Crypto) em **base64 normal** (o servidor lê-a com `atob`).
- Mensagem (versão 2), com os campos por esta ordem:

  ```json
  {"versao":2,"delivery_id":"…","lat":-8.83,"lng":13.23,"timestamp":"2026-09-23T10:15:00.000Z",
   "plus_code":"…","foto_sha256":"<hex>","assinatura_manuscrita_sha256":"<hex>|null"}
  ```

  O site assina `{ delivery_id, lat, lng, timestamp }`. A app pode acrescentar campos porque
  a Edge Function `deliveries` verifica a assinatura sobre o texto `crypto_payload` **tal
  como chega** (não refaz a mensagem) e do texto só lê o `delivery_id` (tem de ser o da entrega).
- `foto_sha256` é o SHA-256 do ficheiro final da foto, já com a marca de água
  (`src/services/imagem/hashFoto.ts`).

## O que o servidor faz (lido em produção, `signing-keys` v1 e `deliveries` v17)

- Prova com `crypto_*` e chave do (utilizador, aparelho) registada → verifica e grava
  `crypto_verified = true/false`.
- Chave **não registada** → a entrega muda de estado na mesma, mas a prova fica gravada com
  `crypto_verified = false` para sempre (não há nova verificação). Por isso o motor de sync
  só envia provas depois de `garantirChaveRegistada()` (ver `src/sync/README.md`).
- Registar outra chave com o mesmo `device_id` **substitui** a anterior (upsert). As provas
  já gravadas mantêm o `crypto_verified` que tinham.

## Testes

`__tests__/crypto.test.ts` (ambiente Node): assina com o `@noble` e verifica com o Web Crypto do
Node exatamente como a Edge Function faz (`importKey('jwk')` + `verify`, `atob`, `TextEncoder`),
e o inverso (assinatura do Web Crypto aceite pelo `@noble`, incluindo S "alto"); mensagem
alterada num caractere; JWK sem `d` e com x/y de 32 bytes; chave privada nunca no SQLite;
chave desaparecida → nova e não registada; iPhone bloqueado não gera outra chave; registo.
