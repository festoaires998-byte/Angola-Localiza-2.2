# src/services/imagem

Marca de água, compressão.

| Ficheiro | Para que serve |
| --- | --- |
| `marcaDeAgua.ts` | Medidas da faixa da marca de água (testáveis): 12% da altura, duas linhas (Plus Code e data/hora). |
| `fotoComMarca.ts` | `fotoComMarcaDeAgua(uriCamara, linhas)`: reduz para 1280 px, desenha a faixa com o Skia, grava o JPEG (qualidade 65) em `documentos/fotos/` e devolve `{ uri, sha256, tamanhoBytes }`. Se a marca de água falhar, falha (nunca há foto sem ela). |
| `hashFoto.ts` | `hashFoto(uri)`: SHA-256 (hex, minúsculas) dos bytes do ficheiro final da foto. `sha256Hex(bytes)` para bytes já lidos. |

## hashFoto

Calcular **só depois** de a foto estar pronta (já com a marca de água e comprimida): o hash
é assinado na prova de entrega (`foto_sha256`, ver `src/services/crypto/README.md`) e é o
mesmo `sha256` que se grava em `ficheiros_pendentes`. Se o ficheiro mudar depois disto, o
motor de sync recusa-o ("A foto foi alterada ou danificada") e a assinatura deixa de bater
certo com a foto.

`criarHashFoto(lerBytes)` recebe o leitor de ficheiros; os testes (`__tests__/hashFoto.test.ts`)
usam ficheiros reais do Node com valores de referência conhecidos.

Decisão: a verificação da marca de água por OCR foi substituída por uma prova criptográfica — o hash
SHA-256 da foto final (já com marca de água) é assinado com a chave ECDSA P-256 do aparelho, junto
com o Plus Code, as coordenadas e a hora.
