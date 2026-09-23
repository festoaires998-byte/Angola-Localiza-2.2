# src/services/cofre

Guarda segredos no telemóvel. Nada daqui vai para a base de dados SQLite em texto simples.

| Ficheiro | Para que serve |
| --- | --- |
| `armazenamentoSessao.ts` | Onde o supabase-js guarda a sessão (tokens). |
| `idDispositivo.ts` | Identificador fixo deste aparelho: `app-` + UUID. |
| `cofreApp.ts` | Acesso ao `expo-secure-store` com `AFTER_FIRST_UNLOCK` e a migração dos itens antigos. |
| `nomes.ts` | Nomes dos itens guardados no cofre. |

## Sessão

A sessão pode ter mais de 2 KB, o limite prático do `expo-secure-store`. Por isso:

1. Na primeira vez é gerada uma chave AES-256 aleatória (`expo-crypto`) e guardada
   no `expo-secure-store` (`angola_localiza.chave_sessao`) — Keychain no iOS, Keystore no Android.
2. A sessão é cifrada com AES-GCM (`@noble/ciphers`) e guardada no `expo-sqlite/kv-store`
   com o formato `v1:<nonce em hex><texto cifrado em hex>`. Cada gravação usa um nonce novo.
3. Se não for possível decifrar (chave perdida, dados estragados), o item é apagado e o
   utilizador tem de voltar a entrar. **Nunca** se grava nem devolve a sessão em texto simples.

Se a chave não puder ser lida **agora** (ex.: iPhone ainda não desbloqueado depois
de ligar), o erro sobe e a sessão **não** é apagada: volta a funcionar depois de desbloquear.

## Acesso com o ecrã bloqueado (AFTER_FIRST_UNLOCK)

Todos os acessos ao `expo-secure-store` passam por `cofreApp` com
`keychainAccessible: AFTER_FIRST_UNLOCK`. No iOS isto deixa ler a chave com o ecrã
bloqueado, desde que o telemóvel tenha sido desbloqueado uma vez depois de ligar —
é o que permite a sincronização em segundo plano. No Android a opção não se aplica.

Até esta versão os itens eram gravados sem opção (`WHEN_UNLOCKED` no iOS). No iOS,
gravar por cima de um item só muda o valor, não a opção de acesso, por isso há uma
migração (só no iOS, uma vez, antes do primeiro acesso):

1. para cada item (chave da sessão, identificador do aparelho): grava uma cópia
   `<nome>.copia` já com a opção nova e confirma que ficou certa;
2. apaga o item e grava-o de novo com a opção nova; confirma;
3. apaga a cópia. No fim grava `angola_localiza.cofre_acesso = after_first_unlock`.

Se a app fechar ou falhar a meio, nada se perde: a leitura usa a cópia e a migração
seguinte termina o trabalho. Se a migração falhar (ex.: telemóvel bloqueado), a app
continua a funcionar e tenta migrar no acesso seguinte.

## Identificador do aparelho

`obterIdDispositivo()` devolve sempre o mesmo `app-<uuid>`. É criado na primeira
chamada e fica no `expo-secure-store` (`angola_localiza.id_dispositivo`).
Vai no campo `device_id` de cada operação da fila.

## Testes

As duas funções `criar...` recebem o cofre e o armazém por parâmetro, por isso os
testes (`__tests__/cofre.test.ts`) usam versões em memória, sem telemóvel.
