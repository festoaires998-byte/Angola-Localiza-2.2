# src/services/location

GPS e informação do sítio onde a pessoa está.

| Ficheiro | Para que serve |
| --- | --- |
| `infoLocal.ts` | `criarInfoLocal()`: Plus Code, Código Postal Digital (provisório/confirmado) e província/município, com cache por zona. Testável. |
| `infoLocalApp.ts` | `infoLocal`: o mesmo ligado à base de dados e às Edge Functions. |

## Sem rede e com rede

| O quê | Sem rede | Com rede (e sessão) |
| --- | --- | --- |
| Plus Code (11 caracteres, ~3 m) | Calculado no telemóvel | Igual |
| Código Postal Digital | **Provisório**: mesmas contas do `generate-postal-code`, sem o `-N` | **Confirmado** pelo `generate-postal-code` |
| Província e município | Último guardado desta zona (Plus Code de 8 dígitos, ~275 m) ou de uma zona até 3 km | `geocode?action=reverse` (a chave da LocationIQ fica no servidor) |

- A mesma zona só é pedida outra vez ao `geocode` depois de 7 dias; o código
  da mesma célula só é confirmado outra vez depois de 10 minutos. O servidor
  aceita no máximo 30 pedidos por minuto.
- Quando o cálculo dá um código inválido (ver "Erros conhecidos"), o ecrã mostra
  "Indisponível neste ponto" em vez de um código partido.

## Erros conhecidos do `generate-postal-code` (a corrigir em PR próprio)

- Quando 5 bits da grelha dão 31, o alfabeto (31 letras) não tem posição 31 e o
  código sai com a palavra `undefined` (≈14% dos pontos no Huambo). O próprio
  `action=validate` do servidor rejeita esses códigos.
- A sigla da província são as 3 primeiras letras do nome: Cuanza Norte/Sul dão
  as duas `CUA`, Lunda Norte/Sul dão `LUN`, e "Uíge" dá `UÍG`, que o validador
  rejeita.

A app replica estas contas **exatamente** (`src/domain/enderecamento/codigoPostal.ts`,
com um teste que compara com uma cópia do código do servidor). Quando o
servidor mudar, a app tem de mudar com ele.
