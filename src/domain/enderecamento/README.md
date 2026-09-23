# src/domain/enderecamento

Domínio 1: Plus Code local e Código Postal Digital.

## Plus Code (`plusCode.ts`)

Um **Plus Code** é um "endereço" curto feito a partir das coordenadas GPS.
Por exemplo, o ponto `-8.8383, 13.2344` (Luanda) dá o código `6F3M566M+MQJ`.
Não precisa de internet nem de nomes de ruas: qualquer pessoa pode gerá-lo
e lê-lo.

O módulo segue a especificação oficial Open Location Code (Google) e faz as
contas com números inteiros, para não haver erros de arredondamento. Não usa
React, Expo nem hardware, e não depende de bibliotecas externas.

### O que exporta

| Função | O que faz |
| --- | --- |
| `encode(lat, lng, comprimento = 11)` | Transforma a coordenada num código. |
| `decode(codigo)` | Devolve a área (retângulo) do código e o seu centro. |
| `isValid(codigo)` | Diz se o texto é um Plus Code válido (completo ou curto). |
| `isFull(codigo)` / `isShort(codigo)` | Diz se o código é completo ou curto. |

### Tamanho do código

| Comprimento | Exemplo | Tamanho da área (aprox.) |
| --- | --- | --- |
| 10 | `6F3M566M+MQ` | 14 m × 14 m — é o formato do site |
| 11 (padrão) | `6F3M566M+MQJ` | 3 m × 3 m — acrescenta 1 dígito de grelha |

### Compatibilidade com o site

Os códigos guardados no Supabase têm 10 dígitos e foram gerados pela função
antiga `encodeOLC` do site. Os primeiros 10 dígitos (mais o `+`) de
`encode(lat, lng, 11)` são iguais ao código antigo, e `encode(lat, lng, 10)`
dá exatamente o mesmo texto. Os testes confirmam isto com 1000 coordenadas
aleatórias em Angola.

**Exceção conhecida:** a função antiga faz contas com números decimais. Quando
uma coordenada cai *exatamente* na linha que separa duas células (acontece com
coordenadas "redondas", com 6 casas decimais ou menos, ex.: `-11.765`), a
função antiga pode escolher a célula vizinha a sul ou a oeste. O módulo novo
segue a regra oficial. Nesses casos o código antigo continua a apontar para o
mesmo sítio (o ponto está na borda da sua área), mas o texto é diferente.

### Testes

```bash
npm test
```

## Código Postal Digital (`codigoPostal.ts`)

Formato `AO-{PROV}-{GRID8}[-{N}]-{CHK}`, igual à Edge Function `generate-postal-code`.
`codigoPostalProvisorio(lat, lng, provincia)` faz no telemóvel as mesmas contas
(sem o `-N`, que só o servidor sabe). O teste `codigoPostal.test.ts` compara-o,
em 5000 pontos, com uma cópia do código do servidor. Os erros conhecidos do
servidor estão descritos em `src/services/location/README.md`.
