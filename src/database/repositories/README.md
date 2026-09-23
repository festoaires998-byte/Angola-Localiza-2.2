# src/database/repositories

Funções para ler e gravar em cada tabela. Um ficheiro por tabela.
Cada repositório recebe a `BaseDados` (ver `../tipos.ts`), por isso funciona
tanto no telemóvel como nos testes.

```ts
const fila = criarRepositorioFilaSaida(db, { deviceId });
```

| Ficheiro | Tabela | Principais funções |
| --- | --- | --- |
| `filaSaida.ts` | `fila_saida` | `adicionar`, `listarProntas`, `marcarAEnviar`, `aplicarResultadosSync`, `registarFalhaEnvio`, `libertarPresasAEnviar`, `contarPendentes`, `limparConcluidasAntigas` |
| `ficheirosPendentes.ts` | `ficheiros_pendentes` | `registar`, `associarOperacao`, `listarPorOperacao`, `marcarEnviado`, `contarPendentes` |
| `moradas.ts` | `moradas` | `guardarVarias`, `procurarPorPlusCode`, `procurarPorCodigoPostal`, `procurarPerto` |
| `zonaOffline.ts` | `zona_offline` | `guardar`, `obter`, `listar`, `apagar` |
| `favoritos.ts` | `favoritos` | `guardar`, `obter`, `listar`, `listarPorMorada`, `apagar` |
| `levantamentos.ts` | `levantamentos` | `guardar`, `obter`, `listar`, `listarPorEstado`, `mudarEstado`, `apagar` |
| `entregas.ts` | `entregas` | `guardar`, `guardarVarias`, `obter`, `listar`, `apagar` |
| `referencias.ts` | `referencias` | `guardarVarias`, `obter`, `listar(tipo, paiId)`, `apagar` |
| `chavesDispositivo.ts` | `chaves_dispositivo` | `guardar` (só chave pública), `obter`, `marcarRegistada`, `apagar` |

## Fila de saída e a Edge Function "sync"

1. `listarProntas()` dá as operações por enviar.
2. `marcarAEnviar(ids)` antes do `POST /functions/v1/sync`.
3. Com a resposta, `aplicarResultadosSync(results)`, com a mesma regra do site:
   - veio com status diferente de `FAILED` → `concluida`;
   - veio com `FAILED` → volta a `pendente`, conta mais uma tentativa e guarda o erro;
   - não veio na resposta → volta a `pendente` e conta mais uma tentativa.
4. Se o pedido falhar por inteiro (sem rede), `registarFalhaEnvio(erro)`.

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
