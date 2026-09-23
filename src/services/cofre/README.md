# src/services/cofre

Guarda segredos no telemóvel. Nada daqui vai para a base de dados SQLite em texto simples.

| Ficheiro | Para que serve |
| --- | --- |
| `armazenamentoSessao.ts` | Onde o supabase-js guarda a sessão (tokens). |
| `idDispositivo.ts` | Identificador fixo deste aparelho: `app-` + UUID. |

## Sessão

A sessão pode ter mais de 2 KB, o limite prático do `expo-secure-store`. Por isso:

1. Na primeira vez é gerada uma chave AES-256 aleatória (`expo-crypto`) e guardada
   no `expo-secure-store` (`angola_localiza.chave_sessao`) — Keychain no iOS, Keystore no Android.
2. A sessão é cifrada com AES-GCM (`@noble/ciphers`) e guardada no `expo-sqlite/kv-store`
   com o formato `v1:<nonce em hex><texto cifrado em hex>`. Cada gravação usa um nonce novo.
3. Se não for possível decifrar (chave perdida, dados estragados), o item é apagado e o
   utilizador tem de voltar a entrar. **Nunca** se grava nem devolve a sessão em texto simples.

## Identificador do aparelho

`obterIdDispositivo()` devolve sempre o mesmo `app-<uuid>`. É criado na primeira
chamada e fica no `expo-secure-store` (`angola_localiza.id_dispositivo`).
Vai no campo `device_id` de cada operação da fila.

## Testes

As duas funções `criar...` recebem o cofre e o armazém por parâmetro, por isso os
testes (`__tests__/cofre.test.ts`) usam versões em memória, sem telemóvel.
