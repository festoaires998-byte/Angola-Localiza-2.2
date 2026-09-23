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
- Se, por algum motivo, o cálculo der um código que o servidor não aceita, o
  ecrã mostra "Indisponível neste ponto" em vez de um código partido.

## Esquema 2 do Código Postal Digital

A partir do esquema 2 (`generate-postal-code` com `scheme_version: 2`):

- a grelha tem 32 símbolos (`L` no fim): acabou o `undefined` dentro do código.
  Os códigos do esquema 1 que eram válidos continuam exatamente iguais;
- a sigla da província continua a ser as 3 primeiras letras do nome (como no esquema 1).

As contas do servidor estão em `supabase/functions/generate-postal-code/codigoPostal.ts`;
o teste `codigoPostal.test.ts` prova que a app calcula o mesmo.
