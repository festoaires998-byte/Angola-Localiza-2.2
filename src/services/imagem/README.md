# src/services/imagem

Marca de água, compressão.

- hashFoto.ts — calcula o SHA-256 da foto final para ser assinado.

Decisão: a verificação da marca de água por OCR foi substituída por uma prova criptográfica — o hash SHA-256 da foto final (já com marca de água) é assinado com a chave ECDSA P-256 do aparelho, junto com o Plus Code, as coordenadas e a hora.
