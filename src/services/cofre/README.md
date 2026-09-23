# src/services/cofre

Guarda segredos no telemóvel. Nada daqui vai para a base de dados SQLite em texto simples.

| Ficheiro | Para que serve |
| --- | --- |
| `armazenamentoSessao.ts` | Onde o supabase-js guarda a sessão (tokens). |
| `idDispositivo.ts` | Identificador fixo deste aparelho: `app-` + UUID. |
| `cofreApp.ts` | Acesso ao `expo-secure-store`, sempre com `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. |
| `nomes.ts` | Nomes dos itens guardados no cofre (sessão, identificador do aparelho, chave de assinatura). |

Também passam pelo `cofreApp` a chave **privada** de assinatura das provas (`src/services/crypto`)
e o token do link de adesão à espera do login (`src/api/auth.ts`).

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

## Acesso: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY

Todos os acessos ao `expo-secure-store` (ler, gravar, apagar) passam por `cofreApp` com
`keychainAccessible: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. No iOS isto quer dizer:

- o item pode ser lido com o ecrã bloqueado, desde que o telemóvel tenha sido desbloqueado
  uma vez depois de ligar — é o que permite a sincronização em segundo plano;
- o item **nunca sai deste telemóvel**: não vai para backups do iCloud/iTunes e não passa
  para um telemóvel novo. Num telemóvel restaurado de um backup, a app começa sem sessão,
  com um identificador de aparelho novo e uma chave de assinatura nova.

No Android a opção não se aplica (o Keystore já funciona com o ecrã bloqueado). Para os
dados do `expo-secure-store` não irem para o backup automático do Android (nem para a
transferência entre telemóveis), o plugin do `expo-secure-store` no `app.json` tem
`configureAndroidBackup: true`: junta ao `AndroidManifest.xml` as regras
`@xml/secure_store_backup_rules` (Android 11 e anteriores) e
`@xml/secure_store_data_extraction_rules` (Android 12+), que excluem as preferências
`SecureStore`. Estas regras só incluem as preferências partilhadas; as bases de dados e
os ficheiros da app também ficam fora do backup do Android. Se um dia a app precisar de
outras regras de backup, elas têm de continuar a excluir `SecureStore` (ver a documentação
do `expo-secure-store`).

A app ainda não foi instalada em nenhum telemóvel, por isso não há itens antigos a migrar
(a migração que existia para `AFTER_FIRST_UNLOCK` foi retirada).

## Identificador do aparelho

`obterIdDispositivo()` devolve sempre o mesmo `app-<uuid>`. É criado na primeira
chamada e fica no `expo-secure-store` (`angola_localiza.id_dispositivo`).
Vai no campo `device_id` de cada operação da fila.

## Testes

As funções `criar...` recebem o cofre e o armazém por parâmetro, por isso os
testes (`__tests__/cofre.test.ts`, `__tests__/cofreApp.test.ts`) usam versões em memória,
sem telemóvel. `cofreApp.test.ts` confirma que cada acesso leva `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`.
