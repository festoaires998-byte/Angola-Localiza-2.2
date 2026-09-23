# src/database/repositories

Funções para ler e gravar em cada tabela. Um ficheiro por tabela.
Cada repositório recebe a `BaseDados` (ver `../tipos.ts`), por isso funciona
tanto no telemóvel como nos testes.

```ts
const fila = criarRepositorioFilaSaida(db, { deviceId });
```

| Ficheiro | Tabela | Principais funções |
| --- | --- | --- |
| `filaSaida.ts` | `fila_saida` | `adicionar(userId, ...)`, `listarProntas(userId)`, `marcarAEnviar`, `aplicarResultadosSync`, `registarFalhaEnvio`, `libertarPresasAEnviar`, `contarPendentes`, `contarPendentesDoUtilizador`, `limparConcluidasAntigas` |
| `perfilLocal.ts` | `perfil_local` | `guardar`, `obter`, `apagar` |
| `ficheirosPendentes.ts` | `ficheiros_pendentes` | `registar`, `associarOperacao`, `listarPorOperacao`, `marcarEnviado`, `contarPendentes` |
| `moradas.ts` | `moradas` | `guardarVarias`, `procurarPorPlusCode`, `procurarPorCodigoPostal`, `procurarPerto` |
| `zonaOffline.ts` | `zona_offline` | `guardar`, `obter`, `listar`, `apagar` |
| `favoritos.ts` | `favoritos` | `guardar`, `obter`, `listar`, `listarPorMorada`, `apagar` |
| `levantamentos.ts` | `levantamentos` | `guardar`, `obter`, `listar`, `listarPorEstado`, `mudarEstado`, `apagar` |
| `entregas.ts` | `entregas` | `guardar`, `guardarVarias`, `obter`, `listar`, `apagar` |
| `referencias.ts` | `referencias` | `guardarVarias`, `obter`, `listar(tipo, paiId)`, `apagar` |
| `chavesDispositivo.ts` | `chaves_dispositivo` | `guardar` (só chave pública), `obter`, `marcarRegistada(deviceId, userId)` (guarda para que utilizador foi registada), `apagar`. Uma chave nova volta a `registada = 0`. |

## Fila de saída e a Edge Function "sync"

1. `listarProntas(userId)` dá as operações por enviar **desse utilizador**
   (as de outros e as sem `user_id` nunca aparecem).
2. `marcarAEnviar(userId, ids)` antes do `POST /functions/v1/sync`.
3. Com a resposta, `aplicarResultadosSync(userId, results)`, com a mesma regra do site:
   - veio com status diferente de `FAILED` → `concluida`;
   - veio com `FAILED` → volta a `pendente`, conta mais uma tentativa e guarda o erro;
   - não veio na resposta → volta a `pendente` e conta mais uma tentativa.
4. Se o pedido falhar por inteiro (sem rede), `registarFalhaEnvio(userId, erro)`.
5. Se o servidor recusar a sessão (401), `devolverAPendente(userId)`: voltam a
   `pendente` **sem** contar tentativa (a culpa não é das operações).

Outras ajudas usadas pelo motor (`src/sync`):
- `listarProntas(userId, limite, { ignorarEspera: true })` — botão "Sincronizar agora".
- `atualizarPayload(userId, operationId, payload)` — grava o payload com os URLs reais das fotos.
- `registarFalhaOperacao(userId, operationId, erro)` — só essa operação espera (ex.: foto que não subiu).
- `marcarFalhouDefinitivo(userId, operationId, erro)` — falha de vez, sem novas tentativas (ex.: foto alterada).
- `listarFalhadasDoUtilizador(userId)` — as operações `falhou_definitivo` do utilizador.
- `ficheiros.listarDeOperacoesConcluidas()` e `ficheiros.contarPendentesDoUtilizador(userId)`.

Depois de uma falha, a operação espera um pouco antes de voltar a ser enviada
(30 s, 1 min, 2 min, ... no máximo 1 hora).

## Fotos sem rede

No payload, uma foto tirada sem rede aparece como `offline:<id>`
(use `marcadorOffline(id)`), nos campos `photo_facade_url`, `photo_qr_url`,
`proof.photo_url` e `proof.signature_url`. O marcador só é trocado pelo URL real
no momento do envio. O ficheiro fica em `FileSystem.documentDirectory`.

## Moradas perto

`procurarPerto(lat, lng, raio_m)` faz primeiro um filtro rápido por um quadrado
de coordenadas e depois calcula a distância exata. Serve para avisar de
moradas repetidas sem rede.
